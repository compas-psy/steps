/**
 * «Отменить импорт» (M48) — `01§26`, дословно:
 *
 *   «Every import has `import_batch_id`. Result allows `Отменить импорт`
 *    for 10 minutes or until first manual edit of imported entities.
 *    Rollback removes only untouched imported entities.»
 *
 * Три правила, каждое проверяется отдельно и каждое своим тестом:
 *
 * 1. **Окно 10 минут** — `ImportBatch.rollbackDeadline`. Просрочено —
 *    откат недоступен, и это не ошибка, а нормальный исход: отвечаем
 *    кодом, а не исключением.
 * 2. **До первой ручной правки.** Признак правки — `updatedAt > createdAt`
 *    у импортированной сущности. Импорт ставит обе метки равными (один
 *    `now` на всю команду, `TaskCommandDeps.now`), поэтому расхождение
 *    может появиться только от последующей команды. Это честный признак,
 *    не эвристика: любая команда домена двигает `updatedAt`.
 * 3. **Только нетронутое.** Тронутая задача остаётся, остальные удаляются;
 *    сам факт частичного отката возвращается вызывающему коду, а не
 *    прячется.
 *
 * Удаление — обычными командами домена (`deleteTaskCommand` и т.д.), то
 * есть tombstone, а не физическое стирание: `01§9`/`02§9` не знают других
 * удалений, и откат импорта не повод заводить второе.
 */
import { Temporal } from '@js-temporal/polyfill';
import {
  deleteLabelCommand,
  deleteProjectAndTasksCommand,
  deleteSectionCommand,
  deleteTaskCommand,
  type ImportBatch,
  type Uuid,
} from '@shagi/core';
import type { StoragePort } from '@shagi/storage';

import { IMPORT_BATCH_STATUS } from './apply-import.js';

export interface RollbackDeps {
  readonly storage: StoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
}

export type RollbackRefusalCode =
  /** Партии с таким id нет. */
  | 'batch_not_found'
  /** Прошло больше 10 минут (`01§26`). */
  | 'window_expired'
  /** Партия уже откачена. */
  | 'already_rolled_back'
  /** Импортированное уже правили руками. */
  | 'manually_edited';

export type RollbackResult =
  | {
      readonly status: 'ok';
      readonly removedTaskIds: readonly Uuid[];
      readonly removedProjectIds: readonly Uuid[];
      readonly removedSectionIds: readonly Uuid[];
      readonly removedLabelIds: readonly Uuid[];
    }
  | { readonly status: 'refused'; readonly code: RollbackRefusalCode };

function idsFromReport(batch: ImportBatch, key: string): readonly Uuid[] {
  const value = batch.reportJson[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Uuid => typeof item === 'string');
}

/**
 * Можно ли ещё откатить — тот же расчёт, что и у самого отката, но БЕЗ
 * записи: экран Import Result показывает по нему кнопку, а не гадает.
 */
export async function canRollbackImport(
  batchId: Uuid,
  deps: RollbackDeps,
): Promise<{ readonly can: boolean; readonly code: RollbackRefusalCode | null }> {
  const batch = await deps.storage.importBatches.findById(batchId);
  if (batch === null) return { can: false, code: 'batch_not_found' };
  if (batch.status === IMPORT_BATCH_STATUS.rolledBack) {
    return { can: false, code: 'already_rolled_back' };
  }
  if (Temporal.Instant.compare(deps.now, batch.rollbackDeadline) > 0) {
    return { can: false, code: 'window_expired' };
  }
  if (await hasManualEdit(batch, deps)) return { can: false, code: 'manually_edited' };
  return { can: true, code: null };
}

async function hasManualEdit(batch: ImportBatch, deps: RollbackDeps): Promise<boolean> {
  for (const id of idsFromReport(batch, 'taskIds')) {
    const task = await deps.storage.tasks.findById(id);
    if (task === null) continue;
    // Строгое «больше», а не «не равно»: импорт ставит обе метки из одного
    // `now`, поэтому равенство — это «не трогали».
    if (Temporal.Instant.compare(task.updatedAt, task.createdAt) > 0) return true;
  }
  return false;
}

export async function rollbackImport(batchId: Uuid, deps: RollbackDeps): Promise<RollbackResult> {
  const gate = await canRollbackImport(batchId, deps);
  if (!gate.can) return { status: 'refused', code: gate.code ?? 'batch_not_found' };
  const batch = await deps.storage.importBatches.findById(batchId);
  if (batch === null) return { status: 'refused', code: 'batch_not_found' };

  // У команд удаления разные наборы зависимостей (`DeleteSectionDeps`,
  // `DeleteProjectDeps`, `DeleteLabelDeps`); настоящий `StoragePort`
  // подходит на каждую роль сразу, поэтому все они собираются из него.
  const commandDeps = { storage: deps.storage, now: deps.now, deviceId: deps.deviceId };
  const cascadeDeps = {
    ...commandDeps,
    sections: deps.storage.sections,
    tasks: deps.storage.tasks,
    taskCommandStorage: deps.storage,
    taskLabels: deps.storage,
  };

  // Порядок обратный созданию: сначала задачи (у них ссылки на проект,
  // раздел и метки), затем разделы, проекты и метки.
  const removedTaskIds: Uuid[] = [];
  for (const id of idsFromReport(batch, 'taskIds')) {
    const result = await deleteTaskCommand({ id }, commandDeps);
    if (result.status === 'ok') removedTaskIds.push(id);
  }
  const removedSectionIds: Uuid[] = [];
  for (const id of idsFromReport(batch, 'sectionIds')) {
    const result = await deleteSectionCommand({ id }, cascadeDeps);
    if (result.status === 'ok') removedSectionIds.push(id);
  }
  const removedProjectIds: Uuid[] = [];
  for (const id of idsFromReport(batch, 'projectIds')) {
    // Проект уходит ВМЕСТЕ с задачами: всё в нём — импортированное, а
    // «сохранить задачи» оставило бы их в Inbox, то есть откат не откатил
    // бы импорт.
    const result = await deleteProjectAndTasksCommand({ id }, cascadeDeps);
    if (result.status === 'ok') removedProjectIds.push(id);
  }
  const removedLabelIds: Uuid[] = [];
  for (const id of idsFromReport(batch, 'labelIds')) {
    const result = await deleteLabelCommand({ id }, cascadeDeps);
    if (result.status === 'ok') removedLabelIds.push(id);
  }

  await deps.storage.runTransaction(async (tx) => {
    await tx.saveImportBatch({
      ...batch,
      status: IMPORT_BATCH_STATUS.rolledBack,
      finishedAt: deps.now,
    });
  });

  return { status: 'ok', removedTaskIds, removedProjectIds, removedSectionIds, removedLabelIds };
}
