import { isTaskLabelActive, type Uuid } from '@shagi/core';

import { TASK_SEARCH_FTS_INDEX } from '../schema/indexes.js';
import type { EntityWrite } from '../ports/index.js';

import { sqlToString, sqlToUuid, uuidToSql } from './codec.js';
import type { SqliteRow } from './driver-port.js';
import { rowToTaskLabel } from './mappers.js';
import type { NodeSqliteDriver } from './node-sqlite-driver.js';

/**
 * Синхронизация FTS5-индекса (`../schema/indexes.ts` `TASK_SEARCH_FTS_INDEX`)
 * с каноническими строками — задание пакета работ E02.2, п.4.
 *
 * **Выбор: явные операции в той же транзакции, а не SQL-триггеры.**
 * `title`/`description` — родные поля `tasks`, для них триггер был бы
 * тривиален (`AFTER INSERT/UPDATE/DELETE ON tasks`). Но индекс несёт ещё два
 * ДЕНОРМАЛИЗОВАННЫХ поля из ДРУГИХ таблиц (`project_title` из `projects`,
 * `label_display_names` — агрегат по `labels` через `task_labels`,
 * `../schema/indexes.ts` `FtsIndexDefinition.denormalizedFields`).
 * Правильная синхронизация этих двух полей триггерами потребовала бы ЕЩЁ
 * триггеров на `projects` (переименование проекта — обновить `tasks_fts` всех
 * его задач) и на `labels`/`task_labels` (переименование метки или
 * добавление/снятие связи — обновить `tasks_fts` всех задач с этой меткой,
 * причём "активность" связи — не булев столбец, а результат сравнения двух
 * HLC, `@shagi/core` `isTaskLabelActive`, — SQL-триггер не может переиспользовать
 * эту доменную функцию, ему пришлось бы отдельно реализовывать то же
 * сравнение вторым способом на SQL, а это ровно то дублирование логики,
 * которого просит избежать CLAUDE.md).
 *
 * Здесь же, в `applyMutation` (`./sqlite-storage.ts`), на момент записи уже
 * есть весь `DomainMutation.writes` целиком и доступ к `isTaskLabelActive` из
 * `@shagi/core` напрямую — TS-код пересчитывает ровно те строки `tasks_fts`,
 * которые могла задеть конкретная мутация, вызовом одной и той же функции
 * (`isTaskLabelActive`), которой уже пользуется `TaskLabelRepository.countActiveByTask`
 * (`./repositories.ts`) — источник истины один, а не два похожих СПОСОБА
 * посчитать активность связи (SQL-версия и TS-версия).
 *
 * Каждый вызов здесь происходит ВНУТРИ активной транзакции драйвера
 * (`NodeSqliteDriver.transaction`, вызывается из `applyMutation` до того, как
 * колбэк транзакции вернётся) — индекс не может разойтись с `tasks`, потому
 * что откат мутации откатывает и эти изменения (тот же `ROLLBACK`).
 */

const FTS_TABLE = TASK_SEARCH_FTS_INDEX.name;

async function deleteFtsRow(driver: NodeSqliteDriver, taskId: Uuid): Promise<void> {
  await driver.execute(`DELETE FROM "${FTS_TABLE}" WHERE id = ?`, [uuidToSql(taskId)]);
}

async function upsertFtsRow(
  driver: NodeSqliteDriver,
  taskId: Uuid,
  title: string,
  description: string,
  projectTitle: string,
  labelDisplayNames: string,
): Promise<void> {
  await deleteFtsRow(driver, taskId);
  await driver.execute(
    `INSERT INTO "${FTS_TABLE}" (id, title, description, project_title, label_display_names) VALUES (?, ?, ?, ?, ?)`,
    [uuidToSql(taskId), title, description, projectTitle, labelDisplayNames],
  );
}

async function loadProjectTitle(driver: NodeSqliteDriver, projectId: Uuid | null): Promise<string> {
  if (projectId === null) {
    return '';
  }
  const row = await driver.queryOne<SqliteRow>(`SELECT title FROM "projects" WHERE id = ?`, [
    uuidToSql(projectId),
  ]);
  return row === null ? '' : sqlToString(row.title ?? null);
}

async function loadLabelDisplayNames(driver: NodeSqliteDriver, taskId: Uuid): Promise<string> {
  const rows = await driver.queryAll<SqliteRow>(`SELECT * FROM "task_labels" WHERE task_id = ?`, [
    uuidToSql(taskId),
  ]);
  const activeLabelIds = rows
    .map(rowToTaskLabel)
    .filter(isTaskLabelActive)
    .map((link) => link.labelId);
  if (activeLabelIds.length === 0) {
    return '';
  }
  const names: string[] = [];
  for (const labelId of activeLabelIds) {
    const row = await driver.queryOne<SqliteRow>(`SELECT display_name FROM "labels" WHERE id = ?`, [
      uuidToSql(labelId),
    ]);
    if (row !== null) {
      names.push(sqlToString(row.display_name ?? null));
    }
  }
  return names.join(' ');
}

/** Пересчитывает и переписывает строку `tasks_fts` ровно одной задачи —
 * удаляет её, если задачи больше нет либо она tombstone (tombstone не
 * user-visible, `02§1` — поиск не должен его находить). */
export async function refreshTaskFtsRow(driver: NodeSqliteDriver, taskId: Uuid): Promise<void> {
  const row = await driver.queryOne<SqliteRow>(`SELECT * FROM "tasks" WHERE id = ?`, [
    uuidToSql(taskId),
  ]);
  if (row === null || row.deleted_at !== null) {
    await deleteFtsRow(driver, taskId);
    return;
  }
  const title = sqlToString(row.title ?? null);
  const description = sqlToString(row.description ?? null);
  const projectIdRaw = row.project_id ?? null;
  const projectId = projectIdRaw === null ? null : sqlToUuid(projectIdRaw);
  const [projectTitle, labelDisplayNames] = await Promise.all([
    loadProjectTitle(driver, projectId),
    loadLabelDisplayNames(driver, taskId),
  ]);
  await upsertFtsRow(driver, taskId, title, description, projectTitle, labelDisplayNames);
}

async function refreshFtsForProject(driver: NodeSqliteDriver, projectId: Uuid): Promise<void> {
  const rows = await driver.queryAll<SqliteRow>(
    `SELECT id FROM "tasks" WHERE project_id = ? AND deleted_at IS NULL`,
    [uuidToSql(projectId)],
  );
  for (const row of rows) {
    await refreshTaskFtsRow(driver, sqlToUuid(row.id ?? null));
  }
}

async function refreshFtsForLabel(driver: NodeSqliteDriver, labelId: Uuid): Promise<void> {
  const rows = await driver.queryAll<SqliteRow>(`SELECT * FROM "task_labels" WHERE label_id = ?`, [
    uuidToSql(labelId),
  ]);
  const taskIds = new Set<Uuid>();
  for (const link of rows.map(rowToTaskLabel)) {
    if (isTaskLabelActive(link)) {
      taskIds.add(link.taskId);
    }
  }
  for (const taskId of taskIds) {
    await refreshTaskFtsRow(driver, taskId);
  }
}

/** Вызывается для КАЖДОГО `EntityWrite` мутации (`./sqlite-storage.ts`
 * `applyMutation`) — решает, какие строки `tasks_fts` эта конкретная запись
 * может задеть, и пересчитывает ровно их. */
export async function syncFtsForWrite(driver: NodeSqliteDriver, write: EntityWrite): Promise<void> {
  switch (write.entity) {
    case 'task':
      await refreshTaskFtsRow(driver, write.value.id);
      return;
    case 'project':
      await refreshFtsForProject(driver, write.value.id);
      return;
    case 'label':
      await refreshFtsForLabel(driver, write.value.id);
      return;
    case 'task_label':
      await refreshTaskFtsRow(driver, write.value.taskId);
      return;
    case 'section':
    case 'checklist_item':
    case 'reminder':
    case 'recurrence_series':
    case 'attachment':
    case 'task_link':
      // Не входят в `ownColumns`/`denormalizedFields` индекса
      // (`../schema/indexes.ts`) — нечего пересчитывать.
      return;
  }
}
