import type { Temporal } from '@js-temporal/polyfill';

import type { CaptureState, DayBucket, SourceChannel, Task, TaskSource } from '../entities/task.js';
import type { RecurrenceAnchorType, RecurrenceSeries } from '../entities/recurrence-series.js';
import { deriveOccurrenceId, generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import type { RecurrenceRuleTemplate } from '../temporal/recurrence-anchor.js';
import { validateDomainMutation } from '../validation/index.js';
import type { TaskValidationInput } from '../validation/task.js';
import {
  makeOccurrenceSeq,
  makePriority,
  type DurationMinutes,
  type OwnerScope,
  type Priority,
  type Uuid,
} from '../values.js';
import { createTaskCommand } from './create-task.js';
import {
  buildRecurrenceAnchor,
  deriveRecurrenceOccurrenceTemplate,
  RECURRENCE_SERIES_MUTABLE_FIELDS,
  toRecurrenceOccurrenceTemplateJson,
  toRecurrenceTemplateJson,
} from './recurrence-template.js';
import { diffChangedFields, tickClocks } from './project-section-clock.js';
import type { NewTaskRank } from './rank-input.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps } from './types.js';
import type { ValidationResult } from '../validation/types.js';

/**
 * Вход `createRecurringTaskCommand` (`01§11.1`, `01§11.2`) — создаёт
 * `RecurrenceSeries` + первый top-level occurrence Task одной командой.
 * Ровно те поля `CreateTaskInput` (`create-task.ts`), что осмысленны для
 * recurring-задачи: без `parentTaskId` (recurring обязана быть top-level,
 * правило 8, уже блокирующее в валидаторе — здесь просто НЕТ такого входа,
 * ошибку невозможно допустить типом) и без `seriesId`/`occurrenceSeq`/
 * `generatedFromOccurrenceId` (эта команда сама их вычисляет — `01§11.2`,
 * детерминированный UUIDv5).
 *
 * `stopAfterOccurrenceSeq` не входит во вход: свежесозданная серия всегда
 * не ограничена (`null`) — ограничение появляется только через
 * `deleteSeriesCommand` (`01§11.8`).
 */
export interface CreateRecurringTaskInput {
  readonly ownerScope: OwnerScope;
  readonly title: string;
  readonly description?: string;
  readonly priority?: Priority;
  readonly projectId?: Uuid | null;
  readonly sectionId?: Uuid | null;
  readonly captureState: CaptureState;
  readonly availableFrom?: Temporal.PlainDate | null;
  readonly plannedDate?: Temporal.PlainDate | null;
  readonly plannedTime?: Temporal.PlainTime | null;
  readonly durationMin?: DurationMinutes | null;
  readonly focusDate?: Temporal.PlainDate | null;
  readonly dayBucket?: DayBucket;
  readonly deadlineDate?: Temporal.PlainDate | null;
  readonly deadlineTime?: Temporal.PlainTime | null;
  readonly source: TaskSource;
  readonly sourceChannel?: SourceChannel | null;
  readonly sourceCaptureBatchId?: Uuid | null;
  readonly sourceIntentId?: Uuid | null;
  readonly originalProjectNameSnapshot?: string | null;
  readonly originalSectionNameSnapshot?: string | null;
  readonly rank: NewTaskRank;
  /** `01§11.3` vs `01§11.4` — какой якорь считает следующую дату. Выбор
   * принадлежит вызывающему UI (следующий пакет работ), эта команда лишь
   * принимает его как данность. */
  readonly anchorType: RecurrenceAnchorType;
  /** Форма — `RecurrenceChipValue` (`@shagi/nlp`), расширенная `unit:'year'`
   * (см. `temporal/recurrence-anchor.ts`). Хранится как `RecurrenceSeries.
   * templateJson` буквально; `rrule`/`completionIntervalJson` — производные,
   * см. `recurrence-template.ts`. */
  readonly rule: RecurrenceRuleTemplate;
}

export type CreateRecurringTaskResult =
  | {
      readonly status: 'ok';
      readonly series: RecurrenceSeries;
      readonly task: Task;
      readonly validation: ValidationResult;
    }
  | { readonly status: 'rejected'; readonly validation: ValidationResult };

/**
 * Создаёт `RecurrenceSeries` (occurrence_seq стартует с 1 — решение `?3`,
 * `values.ts` `makeOccurrenceSeq`) и материализует первый occurrence через
 * уже готовый `createTaskCommand` (не дублирует его тело — тот же приём, что
 * задокументирован в `complete-task.ts` как "шов для будущего пакета
 * работ"), с ИНЪЕЦИРОВАННЫМ `generateId`, чтобы id первого occurrence тоже
 * был детерминированным `deriveOccurrenceId(seriesId, 1)` (`01§11.2`) — не
 * только со второго occurrence, сходимость должна работать с первого.
 *
 * **Валидация до любой записи.** `createTaskCommand` сам валидирует и пишет
 * атомарно — но если бы серия писалась ПЕРЕД вызовом `createTaskCommand`, а
 * задача оказалась бы невалидной (например, пустой заголовок), осталась бы
 * осиротевшая серия без единого occurrence. Поэтому здесь ЕЩЁ ДО записи
 * серии выполняется тот же самый `validateDomainMutation({entity:'task',...})`,
 * что `createTaskCommand` выполнит повторно секундой позже, — дублирование
 * дешёвого чистого вызова, не дублирование бизнес-правил (правила по-
 * прежнему живут только в `validation/task.ts`).
 *
 * **Не единая атомарная транзакция целиком** (тот же документированный
 * компромисс, что уже принят `project-archive.ts`/`delete-task.ts`: нет
 * batch-примитива в `@shagi/storage`, каждый вложенный вызов открывает
 * собственную `runTransaction`). Порядок записи — СЕРИЯ, затем ЗАДАЧА:
 * если процесс прервётся между двумя транзакциями, возможная осиротевшая
 * `RecurrenceSeries` без единого occurrence безвредна (никогда не
 * прочитана ни одним экраном без Task, на неё ссылающегося) — обратный
 * порядок оставил бы Task с `seriesId`, указывающим в никуда, что опаснее
 * (любой код, читающий `task.seriesId`, ожидает найти серию).
 */
export async function createRecurringTaskCommand(
  input: CreateRecurringTaskInput,
  deps: TaskCommandDeps,
): Promise<CreateRecurringTaskResult> {
  const generateId = deps.generateId ?? generateUuidV7;

  const description = input.description ?? '';
  const priority = input.priority ?? makePriority(4);
  const projectId = input.projectId ?? null;
  const sectionId = input.sectionId ?? null;
  const availableFrom = input.availableFrom ?? null;
  const plannedDate = input.plannedDate ?? null;
  const plannedTime = input.plannedTime ?? null;
  const durationMin = input.durationMin ?? null;
  const focusDate = input.focusDate ?? null;
  const dayBucket = input.dayBucket ?? 'default';
  const deadlineDate = input.deadlineDate ?? null;
  const deadlineTime = input.deadlineTime ?? null;

  const seriesId = generateId();
  const occurrenceSeq = makeOccurrenceSeq(1n);
  const occurrenceId = deriveOccurrenceId(seriesId, occurrenceSeq);

  const validationInput: TaskValidationInput = {
    title: input.title,
    description,
    projectId,
    sectionId,
    parentTaskId: null,
    captureState: input.captureState,
    seriesId,
    availableFrom,
    plannedDate,
    plannedTime,
    durationMin,
    focusDate,
    dayBucket,
    deadlineDate,
    deadlineTime,
    status: 'active',
    completedAt: null,
    completionKind: null,
    priority,
  };
  const context = await deps.storage.tasks.loadValidationContext(null, null);
  const validation = validateDomainMutation({ entity: 'task', data: validationInput, context });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };
  const anchor = buildRecurrenceAnchor(input.anchorType, input.rule);

  // M26: шаблон occurrence (`RecurrenceOccurrenceTemplate`) считается из ТЕХ
  // ЖЕ полей, что уже материализует первый occurrence ниже, и сливается в
  // тот же `templateJson`-объект, что и rrule-часть (см. заголовочный
  // комментарий «M26» в `recurrence-template.ts` — пересечения ключей нет).
  // Без этого следующий occurrence (`generateNextOccurrence`,
  // `complete-occurrence.ts`) получил бы `plannedTime`/`durationMin`/офсеты
  // `null` даже для НОВОЙ, только что заполненной формы создания серии.
  const occurrenceTemplate = deriveRecurrenceOccurrenceTemplate({
    plannedDate,
    plannedTime,
    durationMin,
    deadlineDate,
    deadlineTime,
    availableFrom,
  });

  const series: RecurrenceSeries = {
    id: seriesId,
    ...anchor,
    templateJson: {
      ...toRecurrenceTemplateJson(input.rule),
      ...toRecurrenceOccurrenceTemplateJson(occurrenceTemplate),
    },
    active: true,
    // occurrence 1 уже материализуется этим же вызовом — "следующий, ещё не
    // сгенерированный" occurrence начинается с 2 (решение этого пакета
    // работ, задокументировано в отчёте).
    nextOccurrenceSeq: makeOccurrenceSeq(2n),
    stopAfterOccurrenceSeq: null,
    templateRevision: 1n,
    createdAt: deps.now,
    updatedAt: deps.now,
    clocks: {},
  };
  const seriesChangedFields = diffChangedFields(null, series, RECURRENCE_SERIES_MUTABLE_FIELDS);
  const finalSeries: RecurrenceSeries = {
    ...series,
    clocks: tickClocks(series.clocks, seriesChangedFields, hlc),
  };

  const seriesOpId = deps.generateOpId?.() ?? generateUuidV7();
  // RecurrenceSeries не несёт generic `revision` (в отличие от Task) — E01
  // не завёл его, конкурентность здесь обеспечивают `templateRevision`/
  // `stopAfterOccurrenceSeq`. `baseRevision` — та же конвенция `0n`, что уже
  // применяют Section/Label/Reminder (тоже без `revision`).
  const seriesOutboxEntry: SyncOutboxEntry = {
    opId: seriesOpId,
    deviceId: deps.deviceId,
    entityType: 'recurrence_series',
    entityId: finalSeries.id,
    patchJson: {
      templateJson: finalSeries.templateJson,
      active: finalSeries.active,
      nextOccurrenceSeq: finalSeries.nextOccurrenceSeq,
      stopAfterOccurrenceSeq: finalSeries.stopAfterOccurrenceSeq,
      templateRevision: finalSeries.templateRevision,
      rrule: finalSeries.rrule,
      completionIntervalJson: finalSeries.completionIntervalJson,
    },
    fieldClocksJson: finalSeries.clocks,
    baseRevision: 0n,
    createdAt: deps.now,
    retryCount: 0,
  };
  const seriesWrite: CommandEntityWrite = { entity: 'recurrence_series', value: finalSeries };
  const seriesMutation: CommandDomainMutation = {
    writes: [seriesWrite],
    outbox: [seriesOutboxEntry],
  };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(seriesMutation);
  });

  const taskResult = await createTaskCommand(
    {
      ownerScope: input.ownerScope,
      title: input.title,
      description,
      priority,
      projectId,
      sectionId,
      parentTaskId: null,
      captureState: input.captureState,
      seriesId,
      occurrenceSeq,
      generatedFromOccurrenceId: null,
      availableFrom,
      plannedDate,
      plannedTime,
      durationMin,
      focusDate,
      dayBucket,
      deadlineDate,
      deadlineTime,
      source: input.source,
      sourceChannel: input.sourceChannel ?? null,
      sourceCaptureBatchId: input.sourceCaptureBatchId ?? null,
      sourceIntentId: input.sourceIntentId ?? null,
      originalProjectNameSnapshot: input.originalProjectNameSnapshot ?? null,
      originalSectionNameSnapshot: input.originalSectionNameSnapshot ?? null,
      rank: input.rank,
    },
    { ...deps, generateId: () => occurrenceId },
  );

  if (taskResult.status === 'not_found') {
    // `createTaskCommand` никогда не возвращает `not_found` (нет цели по
    // id — это создание) — недостижимо, но `TaskCommandResult` типизирован
    // на три исхода. Серия уже написана и остаётся (безвредная осиротевшая
    // запись, см. комментарий функции).
    throw new Error(
      'createRecurringTaskCommand: createTaskCommand вернул "not_found" — недостижимо для создания.',
    );
  }
  if (taskResult.status === 'rejected') {
    // Валидатор уже был пройден идентичным вызовом выше — эта ветка
    // недостижима на практике (тот же вход, тот же контекст), но
    // типобезопасно требует обработки; серия уже написана и остаётся (см.
    // комментарий функции — безвредная осиротевшая запись).
    return { status: 'rejected', validation: taskResult.validation };
  }

  return {
    status: 'ok',
    series: finalSeries,
    task: taskResult.task,
    validation: taskResult.validation,
  };
}
