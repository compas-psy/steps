import { isNonEmptyArray } from '../values.js';
import type { EntityWrite } from '../ports/index.js';
import {
  ATTACHMENTS_TABLE,
  CHECKLIST_ITEMS_TABLE,
  LABELS_TABLE,
  PROJECTS_TABLE,
  RECURRENCE_SERIES_TABLE,
  REMINDERS_TABLE,
  SECTIONS_TABLE,
  SYNC_OUTBOX_TABLE,
  TASK_LABELS_TABLE,
  TASK_LINKS_TABLE,
  TASKS_TABLE,
  IMPORT_BATCHES_TABLE,
} from '../schema/tables.js';
import type { TableDefinition } from '../schema/types.js';
import type { ImportBatch, SyncOutboxEntry } from '@shagi/core';

import { buildUpsertSql } from './ddl.js';
import type { SqliteParam, SqliteRow } from './driver-port.js';
import { syncFtsForWrite } from './fts.js';
import {
  attachmentToRow,
  checklistItemToRow,
  labelToRow,
  projectToRow,
  recurrenceSeriesToRow,
  reminderToRow,
  sectionToRow,
  syncOutboxEntryToRow,
  taskLabelToRow,
  taskLinkToRow,
  taskToRow,
  importBatchToRow,
} from './mappers.js';
import type { NodeSqliteDriver } from './node-sqlite-driver.js';
import type { DomainMutation } from '../ports/transaction.js';

/**
 * `applyMutation` (задание пакета работ E02.2, п.3+4) — единственное место,
 * где `EntityWrite`/`SyncOutboxEntry` физически попадают в таблицы SQLite и
 * (для `tasks`/`task_labels`/`projects`/`labels`) в `tasks_fts` (`./fts.ts`).
 * Зеркалит по форме `../memory/in-memory-storage.ts` `applyMutationToTables`
 * — тот же порядок проверок и тот же смысл (outbox обязателен, иначе
 * `TypeError` уже в рантайме, не только по типам), другой физический бэкенд.
 */

const upsertSqlCache = new Map<TableDefinition, string>();

function upsertSqlFor(table: TableDefinition): string {
  let sql = upsertSqlCache.get(table);
  if (sql === undefined) {
    sql = buildUpsertSql(table);
    upsertSqlCache.set(table, sql);
  }
  return sql;
}

async function upsert(
  driver: NodeSqliteDriver,
  table: TableDefinition,
  row: SqliteRow,
): Promise<void> {
  const params: SqliteParam[] = table.columns.map((column) => row[column.name] ?? null);
  await driver.execute(upsertSqlFor(table), params);
}

async function writeEntity(driver: NodeSqliteDriver, write: EntityWrite): Promise<void> {
  switch (write.entity) {
    case 'task':
      return upsert(driver, TASKS_TABLE, taskToRow(write.value));
    case 'project':
      return upsert(driver, PROJECTS_TABLE, projectToRow(write.value));
    case 'section':
      return upsert(driver, SECTIONS_TABLE, sectionToRow(write.value));
    case 'label':
      return upsert(driver, LABELS_TABLE, labelToRow(write.value));
    case 'task_label':
      return upsert(driver, TASK_LABELS_TABLE, taskLabelToRow(write.value));
    case 'checklist_item':
      return upsert(driver, CHECKLIST_ITEMS_TABLE, checklistItemToRow(write.value));
    case 'reminder':
      return upsert(driver, REMINDERS_TABLE, reminderToRow(write.value));
    case 'recurrence_series':
      return upsert(driver, RECURRENCE_SERIES_TABLE, recurrenceSeriesToRow(write.value));
    case 'attachment':
      return upsert(driver, ATTACHMENTS_TABLE, attachmentToRow(write.value));
    case 'task_link':
      return upsert(driver, TASK_LINKS_TABLE, taskLinkToRow(write.value));
  }
}

async function writeOutboxEntry(driver: NodeSqliteDriver, entry: SyncOutboxEntry): Promise<void> {
  await upsert(driver, SYNC_OUTBOX_TABLE, syncOutboxEntryToRow(entry));
}

export async function applyMutationSql(
  driver: NodeSqliteDriver,
  mutation: DomainMutation,
): Promise<void> {
  if (!isNonEmptyArray(mutation.outbox)) {
    throw new TypeError(
      'applyMutation: outbox обязан содержать хотя бы одну запись (00§7, задание E02.1/E02.2) — ' +
        'типы это уже запрещают на этапе компиляции, рантайм-проверка здесь на случай ' +
        'вызова из нетипизированного кода.',
    );
  }

  for (const write of mutation.writes) {
    await writeEntity(driver, write);
    await syncFtsForWrite(driver, write);
  }

  for (const entry of mutation.outbox) {
    await writeOutboxEntry(driver, entry);
  }
}

/**
 * Запись `import_batches` — отдельно от `applyMutationSql` и без outbox,
 * см. разбор в `StorageWriteTransaction.saveImportBatch` (`ports/storage-port.ts`).
 */
export async function saveImportBatchSql(
  driver: NodeSqliteDriver,
  batch: ImportBatch,
): Promise<void> {
  await upsert(driver, IMPORT_BATCHES_TABLE, importBatchToRow(batch));
}
