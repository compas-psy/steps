import type { ChecklistItem } from '../entities/checklist-item.js';
import type { Task } from '../entities/task.js';
import type { RecurrenceSeries } from '../entities/recurrence-series.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { makeOccurrenceSeq, type Uuid } from '../values.js';
import { collectTombstones, emptyTombstoneCollection } from './delete-task.js';
import { diffChangedFields, tickClocks } from './project-section-clock.js';
import { RECURRENCE_SERIES_MUTABLE_FIELDS } from './recurrence-template.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps } from './types.js';

/** Вход "Удалить всю серию" (`01§11.8`). Адресуется по id ТЕКУЩЕГО
 * (активного) occurrence, не по id серии напрямую — вызывающий UI, стоя на
 * экране конкретной задачи, знает именно этот id; серия и её
 * `occurrenceSeq`-граница выводятся отсюда (`task.seriesId`/
 * `task.occurrenceSeq`), не запрашиваются вторым отдельным полем входа,
 * которое могло бы разойтись с первым. */
export interface DeleteSeriesInput {
  readonly currentOccurrenceId: Uuid;
}

/**
 * `task` — тот самый текущий occurrence, tombstone-нутый этим вызовом (см.
 * комментарий функции про решение "тombstone-ит ли активный occurrence
 * тоже" — да). `affectedSubtaskIds`/`affectedChecklistItemIds` — аддитивно
 * прокинуты из `deleteTaskCommand` (тот же приём, что сам `DeleteTaskResult`
 * уже использует, `delete-task.ts`) — UI показывает единый Undo-тост на весь
 * граф, не два отдельных.
 */
export type DeleteSeriesResult =
  | {
      readonly status: 'ok';
      readonly series: RecurrenceSeries;
      readonly task: Task;
      readonly affectedSubtaskIds: readonly Uuid[];
      readonly affectedChecklistItemIds: readonly Uuid[];
      /** Снимки tombstone-пунктов — материал Undo, см. `DeleteTaskResult`. */
      readonly affectedChecklistItems: readonly ChecklistItem[];
    }
  | { readonly status: 'not_found' }
  /** Цель существует, но не принадлежит серии (`seriesId === null`) —
   * отдельный исход, не смешивается с `not_found`: адрес валиден, действие
   * просто неприменимо (тот же приём, что `not_completed` у
   * `undoCompleteOccurrenceCommand`). */
  | { readonly status: 'not_recurring' };

/**
 * "Удалить всю серию" (`01§11.8`: "Whole-series delete sets
 * stop_after_occurrence_seq = current_occurrence_seq... stops future
 * generation and preserves completed/skipped history"). Только
 * ОДНОДУСТРОЙСТВЕННАЯ часть правила 30 (локальное сравнение
 * `occurrence_seq > stop_after_occurrence_seq` внутри
 * `complete-occurrence.ts`, не сравнение с входящим sync-патчем "regardless
 * of HLC ordering" — это `validateSeriesDeleteBoundary`,
 * `validation/sync-stubs.ts`, сознательно нереализованная заглушка для
 * будущего многодустройственного merge, эпик E11 вне ЭТОГО пакета работ).
 *
 * **Решение: tombstone-ит ли текущий активный occurrence тоже — ДА.**
 * `01§11.8` дословно говорит только про ГРАНИЦУ генерации и про то, что
 * ЗАВЕРШЁННАЯ/ПРОПУЩЕННАЯ история не трогается — про судьбу ЕЩЁ АКТИВНОГО
 * occurrence текст молчит. Обоснование выбора (подробнее — в отчёте пакета
 * работ): "Удалить ВСЮ серию" читается как продуктовый эквивалент обычного
 * `Удалить` для recurring-задачи — так же, как обычное удаление убирает
 * единственный активный экземпляр Task, здесь убирается единственный
 * активный occurrence. Без этого шага после "удаления" серии пользователь
 * продолжал бы видеть текущий occurrence как обычную активную задачу без
 * единого UI-сигнала, что она принадлежит остановленной серии — это
 * противоречит интуиции "удалить" сильнее, чем cascade на живой subtasks/
 * checklist текущего occurrence (который решение переиспользует буквально
 * из уже готового `deleteTaskCommand`, не дублируя его каскад).
 *
 * Порядок внутри мутации: СНАЧАЛА патч серии (граница генерации логически
 * предшествует исчезновению текущего occurrence — так читается и журнал
 * outbox на будущем сервере), ЗАТЕМ tombstone текущего occurrence и его
 * каскада. Обе части — ОДНА транзакция (пакет работ Undo/Restore R1):
 * состояние «серия остановлена, occurrence ещё жив» не должно переживать
 * падение, потому что один Undo обязан вернуть весь граф целиком.
 */
export async function deleteSeriesCommand(
  input: DeleteSeriesInput,
  deps: TaskCommandDeps,
): Promise<DeleteSeriesResult> {
  const current = await deps.storage.tasks.findById(input.currentOccurrenceId);
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }
  if (current.seriesId === null) {
    return { status: 'not_recurring' };
  }
  if (current.occurrenceSeq === null) {
    throw new Error(
      'deleteSeriesCommand: task.occurrenceSeq=null при заданном seriesId — нарушение ' +
        'инварианта TaskHierarchy (`entities/task.ts`).',
    );
  }

  const series = await deps.storage.recurrenceSeries.findById(current.seriesId);
  if (series === null) {
    throw new Error(
      `deleteSeriesCommand: task.seriesId=${current.seriesId} не указывает на существующую ` +
        'RecurrenceSeries — нарушение ссылочной целостности.',
    );
  }

  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };
  const updatedSeries: RecurrenceSeries = {
    ...series,
    active: false,
    stopAfterOccurrenceSeq: makeOccurrenceSeq(current.occurrenceSeq),
    updatedAt: deps.now,
  };
  const changedFields = diffChangedFields(series, updatedSeries, RECURRENCE_SERIES_MUTABLE_FIELDS);
  const finalSeries: RecurrenceSeries = {
    ...updatedSeries,
    clocks: tickClocks(series.clocks, changedFields, hlc),
  };

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const seriesOutboxEntry: SyncOutboxEntry = {
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
  const seriesWrite: CommandEntityWrite = { entity: 'recurrence_series', value: finalSeries };

  // Каскад текущего occurrence собирается БЕЗ записи и уходит в ту же
  // мутацию, что патч серии (пакет работ Undo/Restore R1). Раньше это были
  // две транзакции подряд; между ними существовало состояние «генерация уже
  // остановлена, но текущий occurrence ещё жив», переживающее падение и
  // невосстановимое одним Undo. MASTER §7: пользовательская команда — одна
  // локальная транзакция.
  const acc = emptyTombstoneCollection();
  const validation = await collectTombstones(current, deps, generateOpId, acc);
  if (!validation.valid) {
    throw new Error(
      'deleteSeriesCommand: валидатор отклонил tombstone только что прочитанной живой задачи — ' +
        'недостижимо (мягкое удаление не меняет ни одно проверяемое поле, см. `delete-task.ts`).',
    );
  }

  const mutation: CommandDomainMutation = {
    writes: [seriesWrite, ...acc.writes],
    outbox: [seriesOutboxEntry, ...acc.outbox],
  };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  const rootWrite = acc.writes[acc.writes.length - 1];
  return {
    status: 'ok',
    series: finalSeries,
    task: (rootWrite as { readonly value: Task }).value,
    affectedSubtaskIds: acc.subtaskIds,
    affectedChecklistItemIds: acc.checklistItemIds,
    affectedChecklistItems: acc.checklistItems,
  };
}
