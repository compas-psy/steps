import type { Temporal } from '@js-temporal/polyfill';

import type { ChecklistItem } from '../entities/checklist-item.js';
import type { CompletionKind, Task } from '../entities/task.js';
import type { RecurrenceSeries } from '../entities/recurrence-series.js';
import { deriveChecklistItemId, deriveOccurrenceId, deriveSubtaskId } from '../identity/index.js';
import {
  computeNextCompletionDate,
  computeNextScheduledDate,
} from '../temporal/recurrence-anchor.js';
import type { ValidationResult } from '../validation/types.js';
import { makeOccurrenceSeq, type Uuid } from '../values.js';
import { completeTaskCommand } from './complete-task.js';
import { createChecklistItemCommand } from './checklist-item-create.js';
import { createTaskCommand } from './create-task.js';
import {
  parseRecurrenceOccurrenceTemplate,
  parseRecurrenceRuleTemplate,
  RECURRENCE_SERIES_MUTABLE_FIELDS,
  shiftRelativeDate,
} from './recurrence-template.js';
import { diffChangedFields, tickClocks } from './project-section-clock.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps } from './types.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { generateUuidV7 } from '../identity/index.js';

/**
 * Вход `completeOccurrenceCommand`/`skipOccurrenceCommand` (`01§11.3`–
 * `01§11.5`). `occurrenceLocalDate` — уже материализованная локальная дата
 * события завершения/пропуска (`Temporal.PlainDate`, не `Date`, CLAUDE.md
 * «Время»): командный слой этого пакета работ нигде не хранит таймзону
 * устройства (`TaskCommandDeps` несёт только `now: Temporal.Instant`, ни один
 * существующий файл `commands/*.ts` не читает IANA-зону) — материализация
 * "локальной даты" из `Instant`+зоны остаётся заботой вызывающего кода (UI,
 * следующий пакет работ), тем же способом, каким `plannedDate`/`deadlineDate`
 * уже приходят в команды как готовые `PlainDate`, а не вычисляются внутри.
 */
export interface CompleteOccurrenceInput {
  readonly id: Uuid;
  readonly occurrenceLocalDate: Temporal.PlainDate;
}

/**
 * Аддитивное расширение `TaskCommandResult` (тот же приём, что
 * `DeleteTaskResult`, `delete-task.ts`): 'ok' несёт три ДОПОЛНИТЕЛЬНЫХ поля
 * (`series`/`generatedTask`/`generatedChecklistItems`), 'rejected'/'not_found'
 * — буквально те же формы, что `TaskCommandResult` — так вызывающий код,
 * которому нужен только факт завершения (`task`), не обязан знать про
 * recurrence. `generatedTask` — не только материал для UI, но и точный вход
 * для `undoCompleteOccurrenceCommand` (`01§11.9`): без него UI пришлось бы
 * ГАДАТЬ id следующего occurrence заново.
 */
export type CompleteOccurrenceResult =
  | {
      readonly status: 'ok';
      readonly task: Task;
      readonly validation: ValidationResult;
      readonly series: RecurrenceSeries | null;
      readonly generatedTask: Task | null;
      readonly generatedChecklistItems: readonly ChecklistItem[];
    }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' };

// `dayOffset`/`shiftRelativeDate` — теперь общие (M26, `recurrence-template.ts`
// «--- M26 ... ---»): вынесены оттуда сюда были приватными, но правка
// Planning-полей occurrence (`update-recurring-occurrence-planning.ts`) и
// создание серии (`create-recurring-task.ts`) тоже теперь нуждаются в той же
// арифметике смещения — импортируются, не дублируются.

interface GeneratedNextOccurrence {
  readonly task: Task;
  readonly checklistItems: readonly ChecklistItem[];
}

/**
 * Генерирует следующий occurrence (top-level Task) + копии subtasks/checklist
 * items текущего occurrence неполными (`01§11.1`, `01§11.7`). Не пишет
 * ничего в `series` — вызывающая функция сама решает, обновлять ли
 * `nextOccurrenceSeq` (после успешной генерации).
 *
 * **M26**: `plannedTime`/`durationMin`/`deadlineDate`/`availableFrom`
 * СЛЕДУЮЩЕГО occurrence читаются из `RecurrenceOccurrenceTemplate`,
 * материализованного в `series.templateJson` (см. заголовочный комментарий
 * `recurrence-template.ts`, раздел «M26»), а НЕ вычисляются из `current` —
 * это единственное изменение, которое делает "Это повторение" (правка
 * `current` без прикосновения к шаблону, `updateTaskCommand` напрямую)
 * реально изолированной от "Вся серия" (правка, которая ОБНОВЛЯЕТ шаблон,
 * `updateSeriesOccurrenceTemplateCommand`): до M26 обе ветки были
 * неразличимы, потому что здесь читалось `current`, а не шаблон.
 */
async function generateNextOccurrence(
  current: Task,
  series: RecurrenceSeries,
  nextSeq: bigint,
  nextPlannedDate: Temporal.PlainDate,
  deps: TaskCommandDeps,
): Promise<GeneratedNextOccurrence> {
  const nextOccurrenceId = deriveOccurrenceId(series.id, makeOccurrenceSeq(nextSeq));

  const occurrenceTemplate = parseRecurrenceOccurrenceTemplate(series.templateJson);
  const newDeadlineDate =
    occurrenceTemplate.deadlineOffsetDays === null
      ? null
      : nextPlannedDate.add({ days: occurrenceTemplate.deadlineOffsetDays });
  const newAvailableFrom =
    occurrenceTemplate.availableFromOffsetDays === null
      ? null
      : nextPlannedDate.add({ days: occurrenceTemplate.availableFromOffsetDays });

  const taskResult = await createTaskCommand(
    {
      ownerScope: current.ownerScope,
      title: current.title,
      description: current.description,
      priority: current.priority,
      projectId: current.projectId,
      sectionId: current.sectionId,
      parentTaskId: null,
      captureState: 'processed',
      seriesId: series.id,
      occurrenceSeq: nextSeq,
      generatedFromOccurrenceId: current.id,
      availableFrom: newAvailableFrom,
      plannedDate: nextPlannedDate,
      // Время суток — плавающее wall-clock, из шаблона серии, не с текущего
      // occurrence (`01§11.7`, M26 — см. комментарий функции).
      plannedTime: occurrenceTemplate.plannedTime,
      durationMin: occurrenceTemplate.durationMin,
      // Focus/day_bucket — ручные, разовые пометки "поставить в сегодняшнюю
      // линейку" (`01§6`/`01§7`); новый occurrence не наследует их — решение
      // этого пакета работ, задокументировано в отчёте.
      focusDate: null,
      dayBucket: 'default',
      deadlineDate: newDeadlineDate,
      deadlineTime: newDeadlineDate !== null ? occurrenceTemplate.deadlineTime : null,
      source: 'recurrence',
      sourceChannel: null,
      sourceCaptureBatchId: null,
      sourceIntentId: null,
      originalProjectNameSnapshot: current.originalProjectNameSnapshot,
      originalSectionNameSnapshot: current.originalSectionNameSnapshot,
      rank: { placement: 'explicit', rank: current.rank },
    },
    { ...deps, generateId: () => nextOccurrenceId },
  );
  if (taskResult.status !== 'ok') {
    throw new Error(
      'generateNextOccurrence: createTaskCommand отклонил поля, скопированные с уже ' +
        `валидного occurrence (${taskResult.status}) — недостижимо при непротиворечивых данных.`,
    );
  }
  const generatedTask = taskResult.task;

  // Subtasks — оба статуса (шаблон-источник — ТЕКУЩИЙ occurrence, снимок
  // "на лету", раз отдельной сущности "шаблон subtask" схема не заводит —
  // см. отчёт пакета работ, п. "где хранится шаблон subtasks"), пересозданы
  // НЕЗАВИСИМО от того, был ли конкретный subtask завершён (`01§11.1`
  // "recreate them incomplete").
  const [activeSubtasks, completedSubtasks] = await Promise.all([
    deps.storage.tasks.listDirectSubtasks(current.id, 'active'),
    deps.storage.tasks.listDirectSubtasks(current.id, 'completed'),
  ]);
  for (const subtask of [...activeSubtasks, ...completedSubtasks]) {
    const subtaskId = deriveSubtaskId(nextOccurrenceId, subtask.id);
    const subPlannedDate = shiftRelativeDate(
      current.plannedDate,
      subtask.plannedDate,
      nextPlannedDate,
    );
    const subDeadlineDate = shiftRelativeDate(
      current.plannedDate,
      subtask.deadlineDate,
      nextPlannedDate,
    );
    const subAvailableFrom = shiftRelativeDate(
      current.plannedDate,
      subtask.availableFrom,
      nextPlannedDate,
    );
    await createTaskCommand(
      {
        ownerScope: subtask.ownerScope,
        title: subtask.title,
        description: subtask.description,
        priority: subtask.priority,
        projectId: subtask.projectId,
        sectionId: subtask.sectionId,
        parentTaskId: nextOccurrenceId,
        captureState: 'processed',
        availableFrom: subAvailableFrom,
        plannedDate: subPlannedDate,
        plannedTime: subPlannedDate !== null ? subtask.plannedTime : null,
        durationMin: subtask.durationMin,
        focusDate: null,
        dayBucket: 'default',
        deadlineDate: subDeadlineDate,
        deadlineTime: subDeadlineDate !== null ? subtask.deadlineTime : null,
        source: 'recurrence',
        sourceChannel: null,
        sourceCaptureBatchId: null,
        sourceIntentId: null,
        originalProjectNameSnapshot: subtask.originalProjectNameSnapshot,
        originalSectionNameSnapshot: subtask.originalSectionNameSnapshot,
        rank: { placement: 'explicit', rank: subtask.rank },
      },
      { ...deps, generateId: () => subtaskId },
    );
  }

  // Checklist items — тот же приём: снимок текущих (живых) пунктов, done
  // сбрасывается в `false` независимо от исходного состояния.
  const checklistItems = await deps.storage.checklistItems.listByTask(current.id);
  const generatedChecklistItems: ChecklistItem[] = [];
  for (const item of checklistItems) {
    const itemId = deriveChecklistItemId(nextOccurrenceId, item.id);
    const itemResult = await createChecklistItemCommand(
      {
        taskId: nextOccurrenceId,
        text: item.text,
        rank: { placement: 'explicit', rank: item.rank },
      },
      { ...deps, generateId: () => itemId },
    );
    if (itemResult.status === 'ok') {
      generatedChecklistItems.push(itemResult.item);
    }
  }

  return { task: generatedTask, checklistItems: generatedChecklistItems };
}

/** Пишет `series` с новым `nextOccurrenceSeq` (per-field HLC через тот же
 * generic-модуль, что уже переиспользует `create-recurring-task.ts`). */
async function advanceSeries(
  series: RecurrenceSeries,
  nextOccurrenceSeq: bigint,
  deps: TaskCommandDeps,
): Promise<RecurrenceSeries> {
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };
  const updated: RecurrenceSeries = {
    ...series,
    nextOccurrenceSeq: makeOccurrenceSeq(nextOccurrenceSeq),
    updatedAt: deps.now,
  };
  const changedFields = diffChangedFields(series, updated, RECURRENCE_SERIES_MUTABLE_FIELDS);
  const finalSeries: RecurrenceSeries = {
    ...updated,
    clocks: tickClocks(series.clocks, changedFields, hlc),
  };

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'recurrence_series',
    entityId: finalSeries.id,
    patchJson: { nextOccurrenceSeq: finalSeries.nextOccurrenceSeq },
    fieldClocksJson: finalSeries.clocks,
    baseRevision: 0n,
    createdAt: deps.now,
    retryCount: 0,
  };
  const write: CommandEntityWrite = { entity: 'recurrence_series', value: finalSeries };
  const mutation: CommandDomainMutation = { writes: [write], outbox: [outboxEntry] };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });
  return finalSeries;
}

/**
 * Общее тело `completeOccurrenceCommand`/`skipOccurrenceCommand` (`01§11.5`:
 * "Skip supports the same 6-second Undo transaction as completion" — оба
 * действия по форме идентичны, различается только `completionKind`).
 *
 * 1. Завершает/пропускает ТЕКУЩИЙ occurrence — переиспользует
 *    `completeTaskCommand` буквально (не дублирует его тело, тот же приём,
 *    что уже описан в `complete-task.ts` как "шов для эпика E11").
 * 2. Если `task.seriesId === null` — не ветвится дальше (CLAUDE.md, п.3).
 * 3. Если серия ЗА ГРАНИЦЕЙ (`stopAfterOccurrenceSeq`, `01§11.8`
 *    remove-wins boundary, ОДНОДУСТРОЙСТВЕННАЯ часть — локальное сравнение,
 *    не sync-реконсиляция `validateSeriesDeleteBoundary`, которая остаётся
 *    нереализованной заглушкой для будущего многодустройственного merge,
 *    см. `validation/sync-stubs.ts`) — не генерирует следующий, но текущий
 *    всё равно завершается.
 * 4. Иначе считает следующую дату нужным якорем и генерирует следующий
 *    occurrence (`generateNextOccurrence`), продвигает `nextOccurrenceSeq`.
 */
async function completeOrSkipOccurrenceCommand(
  input: CompleteOccurrenceInput,
  deps: TaskCommandDeps,
  completionKind: CompletionKind,
): Promise<CompleteOccurrenceResult> {
  const current = await deps.storage.tasks.findById(input.id);
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const completeResult = await completeTaskCommand({ id: input.id, completionKind }, deps);
  if (completeResult.status === 'not_found') {
    return { status: 'not_found' };
  }
  if (completeResult.status === 'rejected') {
    return { status: 'rejected', validation: completeResult.validation };
  }

  if (current.seriesId === null) {
    return {
      status: 'ok',
      task: completeResult.task,
      validation: completeResult.validation,
      series: null,
      generatedTask: null,
      generatedChecklistItems: [],
    };
  }

  const series = await deps.storage.recurrenceSeries.findById(current.seriesId);
  if (series === null) {
    throw new Error(
      `completeOrSkipOccurrenceCommand: task.seriesId=${current.seriesId} не указывает на ` +
        'существующую RecurrenceSeries — нарушение ссылочной целостности.',
    );
  }

  const nextSeq = series.nextOccurrenceSeq;
  const beyondBoundary =
    !series.active ||
    (series.stopAfterOccurrenceSeq !== null && nextSeq > series.stopAfterOccurrenceSeq);
  if (beyondBoundary) {
    return {
      status: 'ok',
      task: completeResult.task,
      validation: completeResult.validation,
      series,
      generatedTask: null,
      generatedChecklistItems: [],
    };
  }

  const rule = parseRecurrenceRuleTemplate(series.templateJson);
  const nextPlannedDate =
    series.anchorType === 'scheduled'
      ? computeNextScheduledDate(rule, input.occurrenceLocalDate)
      : computeNextCompletionDate(rule, input.occurrenceLocalDate);

  const generated = await generateNextOccurrence(current, series, nextSeq, nextPlannedDate, deps);
  const updatedSeries = await advanceSeries(series, nextSeq + 1n, deps);

  return {
    status: 'ok',
    task: completeResult.task,
    validation: completeResult.validation,
    series: updatedSeries,
    generatedTask: generated.task,
    generatedChecklistItems: generated.checklistItems,
  };
}

/** `Завершить` для occurrence серии (`01§11.3`/`01§11.4`) — обычная задача
 * без серии завершается как всегда, `completionKind:'done'`. */
export function completeOccurrenceCommand(
  input: CompleteOccurrenceInput,
  deps: TaskCommandDeps,
): Promise<CompleteOccurrenceResult> {
  return completeOrSkipOccurrenceCommand(input, deps, 'done');
}

/** `Пропустить это повторение` (`01§11.5`) — та же генерация следующего
 * occurrence, но текущий получает `completionKind:'skipped'`. */
export function skipOccurrenceCommand(
  input: CompleteOccurrenceInput,
  deps: TaskCommandDeps,
): Promise<CompleteOccurrenceResult> {
  return completeOrSkipOccurrenceCommand(input, deps, 'skipped');
}
