/**
 * `@shagi/storage/schema` — логическая схема (задание пакета работ E02.1,
 * п.3). Платформонезависимо: ни SQLite DDL, ни IndexedDB object store здесь
 * не пишутся — это перевод следующих пакетов работ (SQLite/IndexedDB
 * адаптеры), общий источник данных не даёт им физически разойтись
 * (`02§4`).
 */
export {
  ALL_TABLES,
  ATTACHMENTS_TABLE,
  CHECKLIST_ITEMS_TABLE,
  IMPORT_BATCHES_TABLE,
  LABELS_TABLE,
  PROJECTS_TABLE,
  RECURRENCE_SERIES_TABLE,
  REMINDERS_TABLE,
  SECTIONS_TABLE,
  SYNC_CONFLICTS_TABLE,
  SYNC_OUTBOX_TABLE,
  TASK_LABELS_TABLE,
  TASK_LINKS_TABLE,
  TASKS_TABLE,
} from './tables.js';
export type {
  ColumnDefinition,
  ColumnType,
  ForeignKeyDefinition,
  TableDefinition,
} from './types.js';
export {
  ALL_INDEXES,
  SECTION_PROJECT_RANK_INDEX,
  TASK_CAPTURE_STATE_STATUS_INDEX,
  TASK_FOCUS_DATE_STATUS_INDEX,
  TASK_LABEL_BY_LABEL_INDEX,
  TASK_LABEL_BY_TASK_INDEX,
  TASK_PARENT_STATUS_RANK_INDEX,
  TASK_PROJECT_SECTION_STATUS_RANK_INDEX,
  TASK_SEARCH_FTS_INDEX,
  TASK_SERIES_STATUS_INDEX,
  TASK_STATUS_DEADLINE_DATE_INDEX,
  TASK_STATUS_PLANNED_DATE_INDEX,
} from './indexes.js';
export type { FtsIndexDefinition, IndexDefinition } from './indexes.js';
