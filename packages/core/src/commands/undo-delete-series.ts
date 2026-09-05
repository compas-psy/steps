import type { ChecklistItem } from '../entities/checklist-item.js';
import type { RecurrenceSeries } from '../entities/recurrence-series.js';
import type { Task } from '../entities/task.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { generateUuidV7 } from '../identity/index.js';
import type { ValidationResult } from '../validation/types.js';
import type { Uuid } from '../values.js';
import { diffChangedFields, tickClocks } from './project-section-clock.js';
import { RECURRENCE_SERIES_MUTABLE_FIELDS } from './recurrence-template.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps } from './types.js';
import { planUndoDelete } from './undo-delete-tasks.js';

/**
 * Undo «Удалить всю серию» (`01§11.8`, ST §58 U3) — зеркало атомарного
 * `deleteSeriesCommand`: ОДНА доменная мутация возвращает и серию в точное
 * прежнее состояние, и текущий occurrence вместе с его подзадачами и
 * пунктами чек-листа.
 *
 * Почему не цепочка «`undoDeleteTasksCommand`, потом откат серии»: между
 * двумя транзакциями существовало бы состояние «occurrence снова жив, а
 * генерация всё ещё остановлена» — не просто некрасивое, а недостижимое ни
 * одной пользовательской командой, и переживающее падение на середине.
 * Поэтому граф собирается тем же планировщиком (`planUndoDelete`), запись
 * серии добавляется к его записям, и всё уходит одним `applyMutation`.
 */
export interface UndoDeleteSeriesInput {
  /** Тот же occurrence, по которому серия удалялась. */
  readonly currentOccurrenceId: Uuid;
  /** `DeleteSeriesResult.previousSeries` — серия ДО удаления. Прежняя
   * граница `stopAfterOccurrenceSeq` невыводима из состояния после
   * удаления (она могла быть задана и раньше), поэтому приходит снимком:
   * узкий UndoToken, а не хранилище снимков. */
  readonly previousSeries: RecurrenceSeries;
  readonly subtaskIds?: readonly Uuid[];
  readonly checklistItems?: readonly ChecklistItem[];
}

export type UndoDeleteSeriesResult =
  | {
      readonly status: 'ok';
      readonly series: RecurrenceSeries;
      readonly tasks: readonly Task[];
      readonly checklistItems: readonly ChecklistItem[];
      readonly validation: ValidationResult;
    }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' }
  /** Occurrence не в состоянии tombstone — откатывать нечего. Повторное
   * нажатие «Отменить» обязано быть идемпотентным (ST §58). */
  | { readonly status: 'not_deleted' };

export async function undoDeleteSeriesCommand(
  input: UndoDeleteSeriesInput,
  deps: TaskCommandDeps,
): Promise<UndoDeleteSeriesResult> {
  const generateOpId = deps.generateOpId ?? generateUuidV7;

  const plan = await planUndoDelete(
    {
      ids: [input.currentOccurrenceId],
      subtaskIds: input.subtaskIds ?? [],
      checklistItems: input.checklistItems ?? [],
    },
    deps,
    generateOpId,
  );
  if (plan.status === 'parent_still_deleted') {
    // Верхнеуровневый occurrence серии не имеет родителя, поэтому этот исход
    // здесь недостижим; сводим его к `not_found`, чтобы не тащить наружу
    // вариант, который вызывающий код не сможет осмысленно показать.
    return { status: 'not_found' };
  }
  if (plan.status !== 'ok') return plan;

  const current = await deps.storage.recurrenceSeries.findById(input.previousSeries.id);
  if (current === null) {
    throw new Error(
      `undoDeleteSeriesCommand: RecurrenceSeries ${input.previousSeries.id} не существует — ` +
        'нарушение ссылочной целостности (её только что удаляли, а не стирали).',
    );
  }

  // Возвращаются ИМЕННО те поля, которые меняла прямая команда (`active`,
  // `stopAfterOccurrenceSeq`), и берутся они из снимка, а не угадываются:
  // `stopAfterOccurrenceSeq: null` было бы правдой только для серии, у
  // которой границы не было вовсе. `updatedAt` — текущий момент: откат тоже
  // мутация вперёд, а не переписывание прошлого (MASTER §7).
  const restored: RecurrenceSeries = {
    ...current,
    active: input.previousSeries.active,
    stopAfterOccurrenceSeq: input.previousSeries.stopAfterOccurrenceSeq,
    updatedAt: deps.now,
  };
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };
  const changedFields = diffChangedFields(current, restored, RECURRENCE_SERIES_MUTABLE_FIELDS);
  const finalSeries: RecurrenceSeries = {
    ...restored,
    clocks: tickClocks(current.clocks, changedFields, hlc),
  };

  const seriesWrite: CommandEntityWrite = { entity: 'recurrence_series', value: finalSeries };
  const seriesOutbox: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'recurrence_series',
    entityId: finalSeries.id,
    patchJson: {
      active: finalSeries.active,
      stopAfterOccurrenceSeq: finalSeries.stopAfterOccurrenceSeq,
    },
    fieldClocksJson: finalSeries.clocks,
    baseRevision: 0n,
    createdAt: deps.now,
    retryCount: 0,
  };

  // Серия первой — зеркало прямой команды, где патч серии логически
  // предшествует tombstone occurrence; журнал outbox читается так же.
  const mutation: CommandDomainMutation = {
    writes: [seriesWrite, ...plan.writes],
    outbox: [seriesOutbox, ...plan.outbox],
  };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return {
    status: 'ok',
    series: finalSeries,
    tasks: plan.tasks,
    checklistItems: plan.checklistItems,
    validation: plan.validation,
  };
}
