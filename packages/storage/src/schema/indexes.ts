/**
 * Индексы конспекта §7 / `02§3` — списаны дословно, ни один не добавлен и
 * не убран. В самом списке `02§3` их десять (семь `tasks`, один `sections`,
 * два `task_labels`) плюс отдельно FTS5 — `test/schema/indexes.test.ts`
 * сверяет этот массив с тем же списком построчно, чтобы расхождение с
 * замороженным контрактом стало красным тестом, а не незамеченной опечаткой.
 */

export interface IndexDefinition {
  readonly name: string;
  readonly table: string;
  readonly columns: readonly string[];
}

function index(table: string, columns: readonly string[]): IndexDefinition {
  return { name: `idx_${table}_${columns.join('_')}`, table, columns };
}

export const TASK_STATUS_PLANNED_DATE_INDEX = index('tasks', ['status', 'planned_date']);
export const TASK_STATUS_DEADLINE_DATE_INDEX = index('tasks', ['status', 'deadline_date']);
export const TASK_CAPTURE_STATE_STATUS_INDEX = index('tasks', ['capture_state', 'status']);
export const TASK_PROJECT_SECTION_STATUS_RANK_INDEX = index('tasks', [
  'project_id',
  'section_id',
  'status',
  'rank',
]);
export const TASK_PARENT_STATUS_RANK_INDEX = index('tasks', ['parent_task_id', 'status', 'rank']);
export const TASK_FOCUS_DATE_STATUS_INDEX = index('tasks', ['focus_date', 'status']);
export const TASK_SERIES_STATUS_INDEX = index('tasks', ['series_id', 'status']);
export const SECTION_PROJECT_RANK_INDEX = index('sections', ['project_id', 'rank']);
export const TASK_LABEL_BY_TASK_INDEX = index('task_labels', ['task_id']);
export const TASK_LABEL_BY_LABEL_INDEX = index('task_labels', ['label_id']);

export const ALL_INDEXES: readonly IndexDefinition[] = [
  TASK_STATUS_PLANNED_DATE_INDEX,
  TASK_STATUS_DEADLINE_DATE_INDEX,
  TASK_CAPTURE_STATE_STATUS_INDEX,
  TASK_PROJECT_SECTION_STATUS_RANK_INDEX,
  TASK_PARENT_STATUS_RANK_INDEX,
  TASK_FOCUS_DATE_STATUS_INDEX,
  TASK_SERIES_STATUS_INDEX,
  SECTION_PROJECT_RANK_INDEX,
  TASK_LABEL_BY_TASK_INDEX,
  TASK_LABEL_BY_LABEL_INDEX,
];

/**
 * FTS5 по заголовку/описанию задачи с денормализованными полями проекта и
 * меток (`02§3`: "FTS5 task title/description + denormalized project/label
 * searchable fields"). Ранжирование поверх этого индекса — отдельный пакет
 * работ (задание E02.1 «Границы»: "Ранжирование поиска — отдельный пакет");
 * здесь фиксируется только форма — какие поля индексируются и что индекс
 * обязан быть rebuildable из канонических строк (`02§3`), не как считается
 * релевантность.
 */
export interface FtsIndexDefinition {
  readonly name: string;
  readonly sourceTable: string;
  /** Родные колонки `tasks`, участвующие в полнотекстовом поиске. */
  readonly ownColumns: readonly string[];
  /** Денормализованные поля из `projects`/`labels`, которые индекс обязан
   * копировать в свою запись при каждом изменении названия проекта/метки —
   * "rebuildable from canonical rows" (`02§3`) описывает именно это: сама
   * FTS5-запись не источник истины, источник — `tasks`/`projects`/`labels`. */
  readonly denormalizedFields: readonly string[];
  readonly rebuildableFromCanonicalRows: true;
}

export const TASK_SEARCH_FTS_INDEX: FtsIndexDefinition = {
  name: 'tasks_fts',
  sourceTable: 'tasks',
  ownColumns: ['title', 'description'],
  denormalizedFields: ['project_title', 'label_display_names'],
  rebuildableFromCanonicalRows: true,
};
