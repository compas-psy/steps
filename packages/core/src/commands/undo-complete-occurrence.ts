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
import { collectTombstones, emptyTombstoneCollection } from './delete-task.js';
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
 * `generatedOutcome` — что стало со сгенерированным next occurrence:
 *
 *  - `removed` — был найден, "нетронут" (см. `isUntouchedGeneratedTask`) и
 *    tombstone-нут этой же мутацией, `nextOccurrenceSeq` серии откачен;
 *  - `absent` — удалять было нечего (не генерировался, либо уже удалён);
 *  - `preserved_conflict` — СУЩЕСТВУЕТ и был независимо изменён, поэтому
 *    сохранён как есть. `01§11.9` требует здесь не «тихо ничего не делать»,
 *    а показать пользователю уведомление о конфликте синхронизации: чужая
 *    работа не удаляется и не теряется, но и вид, что Undo прошёл целиком,
 *    делать нельзя. Раньше этот случай был неотличим от `absent` (общий
 *    `removedGeneratedTask: false`), и UI физически не мог показать
 *    требуемое уведомление — пакет работ Undo/Restore R1 разделил их.
 *
 * `removedGeneratedTask` сохранён как производное поле: вызывающий код
 * (`packages/app`), типизированный на прежнюю форму, продолжает
 * компилироваться — аддитивное расширение, тот же приём, что у
 * `DeleteTaskResult`.
 */
export type UndoGeneratedOutcome = 'removed' | 'absent' | 'preserved_conflict';

export type UndoCompleteOccurrenceResult =
  | {
      readonly status: 'ok';
      readonly task: Task;
      readonly validation: ValidationResult;
      readonly series: RecurrenceSeries | null;
      readonly removedGeneratedTask: boolean;
      readonly generatedOutcome: UndoGeneratedOutcome;
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
 * id (сходимость undo/redo, проверено тестом). Только СОБИРАЕТ запись:
 * применяется она вместе с откатом самой задачи и tombstone next occurrence
 * одной транзакцией (пакет работ Undo/Restore R1) — иначе между тремя
 * бывшими транзакциями существовало состояние «текущий уже активен, а next
 * ещё жив», то есть ДВА активных occurrence одной серии, прямо запрещённые
 * `01§11.10`. */
function buildSeriesRollback(
  series: RecurrenceSeries,
  removedOccurrenceSeq: bigint,
  deps: TaskCommandDeps,
  generateOpId: () => Uuid,
): {
  readonly series: RecurrenceSeries;
  readonly write: CommandEntityWrite;
  readonly outbox: SyncOutboxEntry;
} {
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

  return {
    series: finalSeries,
    write: { entity: 'recurrence_series', value: finalSeries },
    outbox: {
      opId: generateOpId(),
      deviceId: deps.deviceId,
      entityType: 'recurrence_series',
      entityId: finalSeries.id,
      patchJson: { nextOccurrenceSeq: finalSeries.nextOccurrenceSeq },
      fieldClocksJson: finalSeries.clocks,
      baseRevision: 0n,
      createdAt: deps.now,
      retryCount: 0,
    },
  };
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
  const writes: CommandEntityWrite[] = [{ entity: 'task', value: finalTask }];
  const outbox: SyncOutboxEntry[] = [
    {
      opId: generateOpId(),
      deviceId: deps.deviceId,
      entityType: 'task',
      entityId: current.id,
      patchJson: buildPatchJson(finalTask, changedFields),
      fieldClocksJson: pickClocks(finalTask.clocks, changedFields),
      baseRevision: current.revision,
      createdAt: deps.now,
      retryCount: 0,
    },
  ];

  // Сначала выясняем судьбу сгенерированного next occurrence и только потом
  // пишем — всё тремя частями (откат текущего, tombstone next, откат
  // границы серии) уходит ОДНОЙ транзакцией. Пока это были три транзакции
  // подряд, между первой и второй существовало состояние «оба occurrence
  // серии активны», запрещённое `01§11.10`, и падение на середине оставляло
  // его навсегда.
  let series: RecurrenceSeries | null = null;
  let generatedOutcome: UndoGeneratedOutcome = 'absent';

  if (current.seriesId !== null && input.generatedOccurrenceId !== null) {
    series = await deps.storage.recurrenceSeries.findById(current.seriesId);
    if (series === null) {
      throw new Error(
        `undoCompleteOccurrenceCommand: task.seriesId=${current.seriesId} не указывает на ` +
          'существующую RecurrenceSeries — нарушение ссылочной целостности.',
      );
    }

    const generatedTask = await deps.storage.tasks.findById(input.generatedOccurrenceId);
    if (generatedTask !== null && isUntouchedGeneratedTask(generatedTask, current.id)) {
      if (generatedTask.occurrenceSeq === null) {
        throw new Error(
          'undoCompleteOccurrenceCommand: generatedTask.occurrenceSeq=null у top-level occurrence ' +
            '(seriesId задан) — нарушение инварианта TaskHierarchy.',
        );
      }
      const acc = emptyTombstoneCollection();
      const cascade = await collectTombstones(generatedTask, deps, generateOpId, acc);
      if (!cascade.valid) {
        throw new Error(
          'undoCompleteOccurrenceCommand: валидатор отклонил tombstone только что прочитанного ' +
            'живого occurrence — недостижимо (см. `delete-task.ts`).',
        );
      }
      const rollback = buildSeriesRollback(series, generatedTask.occurrenceSeq, deps, generateOpId);
      writes.push(...acc.writes, rollback.write);
      outbox.push(...acc.outbox, rollback.outbox);
      series = rollback.series;
      generatedOutcome = 'removed';
    } else if (generatedTask !== null && generatedTask.deletedAt === null) {
      // Существует и независимо изменён — `01§11.9` "preserve remote work":
      // не удаляем и не теряем чужую правку, но и не делаем вид, что Undo
      // прошёл целиком. Вызывающий UI обязан показать уведомление о
      // конфликте синхронизации по этому исходу.
      generatedOutcome = 'preserved_conflict';
    }
  }

  const mutation: CommandDomainMutation = {
    writes,
    // Непуст по построению: первой записью всегда идёт откат самой задачи.
    outbox: outbox as unknown as CommandDomainMutation['outbox'],
  };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return {
    status: 'ok',
    task: finalTask,
    validation,
    series,
    removedGeneratedTask: generatedOutcome === 'removed',
    generatedOutcome,
  };
}
