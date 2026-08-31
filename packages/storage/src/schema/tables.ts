import { column, defineTable, type ColumnDefinition, type TableDefinition } from './types.js';

/**
 * Тринадцать таблиц конспекта §7 (`.ultraplan/research/01-domain.md`
 * раздел 1) — без будущей R3 `vector_capture_batches` (вне охвата волны,
 * `02§2.2`). Состав колонок сверен буквально с уже существующими типами
 * `@shagi/core` (`entities/*.ts`) — где домен не завёл поле (например,
 * `sections`/`labels` без `created_at`/`updated_at`, `reminders`/`attachments`/
 * `task_links` без tombstone), здесь оно тоже не заведено: типы `@shagi/core`
 * — источник истины по составу полей сущности, а не конспект/`02§2`
 * буквально (расхождение с `02§2` там, где оно есть, уже разобрано и
 * прокомментировано в самих файлах `@shagi/core`, дублировать разбор
 * незачем).
 */

/** `Hlc` (`@shagi/core`) не скалярна — раскладывается в три колонки. Ноль
 * колонок `hlc`-типа не заводится: любой SQL/IndexedDB бэкенд всё равно
 * хранит структуру по частям, лучше явно здесь, чем угадывать в адаптере. */
function hlcColumns(prefix: string, nullable: boolean): ColumnDefinition[] {
  return [
    column(`${prefix}_physical`, 'instant', nullable),
    column(`${prefix}_logical`, 'integer', nullable),
    column(`${prefix}_device_id`, 'uuid', true), // deviceId сам по себе всегда nullable (§ Hlc.deviceId)
  ];
}

export const TASKS_TABLE: TableDefinition = defineTable(
  'tasks',
  [
    column('id', 'uuid'),
    column('owner_scope', 'uuid'),
    column('title', 'text'),
    column('description', 'text'),
    column('status', 'text'),
    column('capture_state', 'text'),
    column('project_id', 'uuid', true),
    column('section_id', 'uuid', true),
    column('parent_task_id', 'uuid', true),
    column('rank', 'text'),
    column('priority', 'integer'),
    column('focus_date', 'plain_date', true),
    column('day_bucket', 'text'),
    column('available_from', 'plain_date', true),
    column('planned_date', 'plain_date', true),
    column('planned_time', 'plain_time', true),
    column('duration_min', 'integer', true),
    column('deadline_date', 'plain_date', true),
    column('deadline_time', 'plain_time', true),
    column('series_id', 'uuid', true),
    column('occurrence_seq', 'bigint', true),
    column('generated_from_occurrence_id', 'uuid', true),
    column('original_project_name_snapshot', 'text', true),
    column('original_section_name_snapshot', 'text', true),
    column('source', 'text'),
    column('source_channel', 'text', true),
    column('source_capture_batch_id', 'uuid', true),
    column('source_intent_id', 'uuid', true),
    column('created_at', 'instant'),
    column('updated_at', 'instant'),
    column('completed_at', 'instant', true),
    column('completion_kind', 'text', true),
    column('deleted_at', 'instant', true),
    column('revision', 'bigint'),
    column('clocks', 'json'),
  ],
  ['id'],
  [
    { column: 'project_id', referencesTable: 'projects', referencesColumn: 'id' },
    { column: 'section_id', referencesTable: 'sections', referencesColumn: 'id' },
    { column: 'parent_task_id', referencesTable: 'tasks', referencesColumn: 'id' },
    { column: 'series_id', referencesTable: 'recurrence_series', referencesColumn: 'id' },
    { column: 'generated_from_occurrence_id', referencesTable: 'tasks', referencesColumn: 'id' },
  ],
);

export const PROJECTS_TABLE: TableDefinition = defineTable(
  'projects',
  [
    column('id', 'uuid'),
    column('title', 'text'),
    column('description', 'text'),
    column('color_token', 'text'),
    column('icon', 'text', true),
    column('default_view', 'text'),
    column('favorite', 'boolean'),
    column('archived_at', 'instant', true),
    column('rank', 'text'),
    column('created_at', 'instant'),
    column('updated_at', 'instant'),
    column('deleted_at', 'instant', true),
    column('clocks', 'json'),
  ],
  ['id'],
);

export const SECTIONS_TABLE: TableDefinition = defineTable(
  'sections',
  [
    column('id', 'uuid'),
    column('project_id', 'uuid'),
    column('title', 'text'),
    column('rank', 'text'),
    column('deleted_at', 'instant', true),
    column('clocks', 'json'),
  ],
  ['id'],
  [{ column: 'project_id', referencesTable: 'projects', referencesColumn: 'id' }],
);

export const LABELS_TABLE: TableDefinition = defineTable(
  'labels',
  [
    column('id', 'uuid'),
    column('normalized_name', 'text'),
    column('display_name', 'text'),
    column('color_token', 'text', true),
    column('rank', 'text'),
    column('deleted_at', 'instant', true),
    column('clocks', 'json'),
  ],
  ['id'],
);

export const TASK_LABELS_TABLE: TableDefinition = defineTable(
  'task_labels',
  [
    column('task_id', 'uuid'),
    column('label_id', 'uuid'),
    ...hlcColumns('add_hlc', false),
    ...hlcColumns('remove_hlc', true),
  ],
  // Составной первичный ключ: одна строка на пару на весь срок жизни связи
  // (OR-set по значению полей одной строки, не по множеству версий — см.
  // `ports/task-label-repository.ts`).
  ['task_id', 'label_id'],
  [
    { column: 'task_id', referencesTable: 'tasks', referencesColumn: 'id' },
    { column: 'label_id', referencesTable: 'labels', referencesColumn: 'id' },
  ],
);

export const CHECKLIST_ITEMS_TABLE: TableDefinition = defineTable(
  'checklist_items',
  [
    column('id', 'uuid'),
    column('task_id', 'uuid'),
    column('text', 'text'),
    column('done', 'boolean'),
    column('rank', 'text'),
    column('deleted_at', 'instant', true),
    column('clocks', 'json'),
  ],
  ['id'],
  [{ column: 'task_id', referencesTable: 'tasks', referencesColumn: 'id' }],
);

export const REMINDERS_TABLE: TableDefinition = defineTable(
  'reminders',
  [
    column('id', 'uuid'),
    column('task_id', 'uuid'),
    column('kind', 'text'),
    column('local_rule_json', 'json'),
    column('enabled', 'boolean'),
    column('scheduled_fingerprint', 'text'),
  ],
  ['id'],
  [{ column: 'task_id', referencesTable: 'tasks', referencesColumn: 'id' }],
);

export const RECURRENCE_SERIES_TABLE: TableDefinition = defineTable(
  'recurrence_series',
  [
    column('id', 'uuid'),
    column('anchor_type', 'text'),
    column('rrule', 'text', true),
    column('completion_interval_json', 'json', true),
    column('template_json', 'json'),
    column('active', 'boolean'),
    column('next_occurrence_seq', 'bigint'),
    column('stop_after_occurrence_seq', 'bigint', true),
    column('template_revision', 'bigint'),
    column('created_at', 'instant'),
    column('updated_at', 'instant'),
    column('clocks', 'json'),
  ],
  ['id'],
);

export const ATTACHMENTS_TABLE: TableDefinition = defineTable(
  'attachments',
  [
    column('id', 'uuid'),
    column('task_id', 'uuid'),
    column('display_name', 'text'),
    column('mime', 'text'),
    column('size', 'integer'),
    column('sha256', 'text'),
    column('local_uri', 'text', true),
    column('object_key', 'text', true),
    column('state', 'text'),
    column('created_at', 'instant'),
    column('updated_at', 'instant'),
  ],
  ['id'],
  [{ column: 'task_id', referencesTable: 'tasks', referencesColumn: 'id' }],
);

export const TASK_LINKS_TABLE: TableDefinition = defineTable(
  'task_links',
  [
    column('id', 'uuid'),
    column('task_id', 'uuid'),
    column('url', 'text'),
    column('display_label', 'text', true),
    column('created_at', 'instant'),
    column('updated_at', 'instant'),
  ],
  ['id'],
  [{ column: 'task_id', referencesTable: 'tasks', referencesColumn: 'id' }],
);

export const IMPORT_BATCHES_TABLE: TableDefinition = defineTable(
  'import_batches',
  [
    column('id', 'uuid'),
    column('source', 'text'),
    column('started_at', 'instant'),
    column('finished_at', 'instant', true),
    column('rollback_deadline', 'instant'),
    column('status', 'text'),
    column('report_json', 'json'),
  ],
  ['id'],
);

export const SYNC_OUTBOX_TABLE: TableDefinition = defineTable(
  'sync_outbox',
  [
    column('op_id', 'uuid'),
    column('device_id', 'uuid'),
    column('entity_type', 'text'),
    column('entity_id', 'uuid'),
    column('patch_json', 'json'),
    column('field_clocks_json', 'json'),
    column('base_revision', 'bigint'),
    column('created_at', 'instant'),
    column('retry_count', 'integer'),
  ],
  ['op_id'],
);

export const SYNC_CONFLICTS_TABLE: TableDefinition = defineTable(
  'sync_conflicts',
  [
    column('id', 'uuid'),
    column('entity_type', 'text'),
    column('entity_id', 'uuid'),
    column('field', 'text'),
    column('local_value', 'json'),
    column('remote_value', 'json'),
    column('winner_value', 'json'),
    ...hlcColumns('local_clock', false),
    ...hlcColumns('remote_clock', false),
    column('resolved_at', 'instant', true),
  ],
  ['id'],
);

/** Полный набор — источник истины для схема-тестов и для будущих
 * SQLite/IndexedDB адаптеров (следующие пакеты работ). */
export const ALL_TABLES: readonly TableDefinition[] = [
  TASKS_TABLE,
  PROJECTS_TABLE,
  SECTIONS_TABLE,
  LABELS_TABLE,
  TASK_LABELS_TABLE,
  CHECKLIST_ITEMS_TABLE,
  REMINDERS_TABLE,
  RECURRENCE_SERIES_TABLE,
  ATTACHMENTS_TABLE,
  TASK_LINKS_TABLE,
  IMPORT_BATCHES_TABLE,
  SYNC_OUTBOX_TABLE,
  SYNC_CONFLICTS_TABLE,
];
