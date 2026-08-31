import type { Task } from '../entities/task.js';
import type { RecurrenceSeries } from '../entities/recurrence-series.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import type { TaskValidationInput } from '../validation/task.js';
import type { ValidationResult } from '../validation/types.js';
import { makeOccurrenceSeq, type Uuid } from '../values.js';
import { flattenTask, buildCompletion } from './assemble.js';
import { buildPatchJson, diffChangedFields, pickClocks, tickClocks } from './clock-diff.js';
import { deleteTaskCommand } from './delete-task.js';
import { RECURRENCE_SERIES_MUTABLE_FIELDS } from './recurrence-template.js';
import {
  diffChangedFields as diffSeriesFields,
  tickClocks as tickSeriesClocks,
} from './project-section-clock.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps } from './types.js';

/**
 * Вход `undoCompleteOccurrenceCommand` (`01§8` "Undo", `01§11.9` "Undo
 * completion"). `generatedOccurrenceId` — **точный** id next occurrence,
 * возвращённый вызывающему коду тем же `completeOccurrenceCommand`/
 * `skipOccurrenceCommand` (`CompleteOccurrenceResult.generatedTask?.id`),
 * не пересчитанный заново здесь: "команда возвращает достаточно данных,
 * чтобы UI мог вызвать undo с точным id, не гадая" (решение этого пакета
 * работ) — `null`, если завершение не породило следующий occurrence (не
 * recurring, либо `stopAfterOccurrenceSeq` уже достигнут).
 */
export interface UndoCompleteOccurrenceInput {
  readonly occurrenceId: Uuid;
  readonly generatedOccurrenceId: Uuid | null;
}

/**
 * `removedGeneratedTask` — `true`, только если next occurrence реально был
 * найден, "нетронут" (см. `isUntouchedGeneratedTask` ниже) и tombstone-нут
 * этим вызовом. `false` покрывает оба остальных случая одинаково безопасно
 * для вызывающего кода: "нечего было удалять" и "уже независимо изменён,
 * сохранён" — оба означают "next occurrence всё ещё существует как есть",
 * различие видно по прямому чтению задачи, не по этому флагу.
 */
export type UndoCompleteOccurrenceResult =
  | {
      readonly status: 'ok';
      readonly task: Task;
      readonly validation: ValidationResult;
      readonly series: RecurrenceSeries | null;
      readonly removedGeneratedTask: boolean;
    }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' }
  /** Цель существует, но не была завершена/пропущена — нечего откатывать
   * (отдельный исход, не смешивается с `not_found`: адрес валиден). */
  | { readonly status: 'not_completed' };

/**
 * "Нетронут с момента генерации" (решение этого пакета работ, обоснование —
 * в отчёте): `revision === 1n` — `createTaskCommand` всегда пишет `1n` при
 * создании, а ЛЮБАЯ последующая команда (`update`/`complete`/`delete`)
 * инкрементирует его. Если с момента генерации next occurrence НИКТО (в
 * рамках этого же устройства — `01§11.9` ветка "другое устройство уже
 * изменило" вне объёма, sync ещё не существует) его не трогал, `revision`
 * остаётся `1n`. Дополнительно сверяется `generatedFromOccurrenceId` —
 * защитный рубеж на случай, если вызывающий код перепутал id (тот же
 * source occurrence, что и ожидалось).
 */
function isUntouchedGeneratedTask(task: Task, sourceOccurrenceId: Uuid): boolean {
  return (
    task.deletedAt === null &&
    task.revision === 1n &&
    task.generatedFromOccurrenceId === sourceOccurrenceId
  );
}

/** Откатывает `nextOccurrenceSeq` серии назад к значению удалённого next
 * occurrence — следующее завершение снова сгенерирует ТОТ ЖЕ детерминированный
 * id (сходимость undo/redo, проверено тестом). */
async function rollBackSeries(
  series: RecurrenceSeries,
  removedOccurrenceSeq: bigint,
  deps: TaskCommandDeps,
): Promise<RecurrenceSeries> {
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };
  const updated: RecurrenceSeries = {
    ...series,
    nextOccurrenceSeq: makeOccurrenceSeq(removedOccurrenceSeq),
    updatedAt: deps.now,
  };
  const changedFields = diffSeriesFields(series, updated, RECURRENCE_SERIES_MUTABLE_FIELDS);
  const finalSeries: RecurrenceSeries = {
    ...updated,
    clocks: tickSeriesClocks(series.clocks, changedFields, hlc),
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
 * Откат завершения/пропуска occurrence (`01§8` "Undo": "Restores exact
 * prior status/focus/bucket/subtask graph. For recurrence, generated next
 * occurrence is also removed if it has not independently changed."). Общая
 * функция для complete/skip (обе восстанавливают ровно то же самое —
 * `status='active'`, `completedAt=null`, `completionKind=null`; различие
 * complete/skip было только в `completionKind` при завершении, откат не
 * должен его помнить — `active` не несёт `completionKind`).
 *
 * Не переиспользует ни одну существующую команду для шага 1 (нет
 * `uncompleteTaskCommand` нигде в дереве — `01§8` описывает Undo как будущую
 * UI-функциональность, ProjectDetail.tsx явно "этот пакет работ не строит
 * Undo"), поэтому revert собран здесь напрямую тем же приёмом, что
 * `complete-task.ts`/`update-task.ts` (валидация → `buildCompletion` →
 * diff/tick → outbox).
 */
export async function undoCompleteOccurrenceCommand(
  input: UndoCompleteOccurrenceInput,
  deps: TaskCommandDeps,
): Promise<UndoCompleteOccurrenceResult> {
  const current = await deps.storage.tasks.findById(input.occurrenceId);
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }
  if (current.status !== 'completed') {
    return { status: 'not_completed' };
  }

  const validationInput: TaskValidationInput = {
    ...flattenTask(current),
    status: 'active',
    completedAt: null,
    completionKind: null,
  };
  const context = await deps.storage.tasks.loadValidationContext(current.id, current.parentTaskId);
  const validation = validateDomainMutation({ entity: 'task', data: validationInput, context });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const revertedTask: Task = {
    ...current,
    ...buildCompletion({ status: 'active', completedAt: null, completionKind: null }),
    updatedAt: deps.now,
    revision: current.revision + 1n,
  };
  const changedFields = diffChangedFields(current, revertedTask);
  const finalTask: Task = {
    ...revertedTask,
    clocks: tickClocks(current.clocks, changedFields, hlc),
  };
  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'task',
    entityId: current.id,
    patchJson: buildPatchJson(finalTask, changedFields),
    fieldClocksJson: pickClocks(finalTask.clocks, changedFields),
    baseRevision: current.revision,
    createdAt: deps.now,
    retryCount: 0,
  };
  const write: CommandEntityWrite = { entity: 'task', value: finalTask };
  const mutation: CommandDomainMutation = { writes: [write], outbox: [outboxEntry] };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  if (current.seriesId === null || input.generatedOccurrenceId === null) {
    return {
      status: 'ok',
      task: finalTask,
      validation,
      series: null,
      removedGeneratedTask: false,
    };
  }

  const series = await deps.storage.recurrenceSeries.findById(current.seriesId);
  if (series === null) {
    throw new Error(
      `undoCompleteOccurrenceCommand: task.seriesId=${current.seriesId} не указывает на ` +
        'существующую RecurrenceSeries — нарушение ссылочной целостности.',
    );
  }

  const generatedTask = await deps.storage.tasks.findById(input.generatedOccurrenceId);
  if (generatedTask === null || !isUntouchedGeneratedTask(generatedTask, current.id)) {
    // Либо уже не существует (нечего делать), либо независимо изменён —
    // `01§11.9` "preserve remote work" (здесь — локальная правка в те же
    // 6 секунд, тот же принцип: сохранить, не откатывать серию).
    return {
      status: 'ok',
      task: finalTask,
      validation,
      series,
      removedGeneratedTask: false,
    };
  }
  if (generatedTask.occurrenceSeq === null) {
    throw new Error(
      'undoCompleteOccurrenceCommand: generatedTask.occurrenceSeq=null у top-level occurrence ' +
        '(seriesId задан) — нарушение инварианта TaskHierarchy.',
    );
  }

  await deleteTaskCommand({ id: input.generatedOccurrenceId }, deps);
  const updatedSeries = await rollBackSeries(series, generatedTask.occurrenceSeq, deps);

  return {
    status: 'ok',
    task: finalTask,
    validation,
    series: updatedSeries,
    removedGeneratedTask: true,
  };
}
