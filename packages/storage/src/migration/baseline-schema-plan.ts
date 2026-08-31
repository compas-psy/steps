import {
  ALL_INDEXES,
  TASK_SEARCH_FTS_INDEX,
  type FtsIndexDefinition,
  type IndexDefinition,
} from '../schema/indexes.js';
import { ALL_TABLES } from '../schema/tables.js';
import type { TableDefinition } from '../schema/types.js';

/**
 * Содержимое "миграции 0001" (создание базовой схемы), выраженное как
 * платформонезависимый список операций поверх `../schema/*` — не SQL, не
 * IndexedDB-вызовы. Будущий SQLite-адаптер переводит `create_table` в
 * `CREATE TABLE`, `create_index` в `CREATE INDEX`, `create_fts_index` в
 * `CREATE VIRTUAL TABLE ... USING fts5(...)`; будущий IndexedDB-адаптер —
 * `create_table` в `createObjectStore`, `create_index` в `store.createIndex`,
 * `create_fts_index` — в инициализацию собственного поискового индекса
 * (FTS5 у IndexedDB нет, реализация всегда своя, `02§4`). Порядок операций
 * значим и зафиксирован здесь один раз, а не выведен заново в каждом
 * адаптере: таблицы обязаны существовать раньше индексов на них, а индексы
 * — раньше FTS (денормализованные поля FTS ссылаются на данные из уже
 * проиндексированных таблиц).
 */
export type SchemaOperation =
  | { readonly op: 'create_table'; readonly table: TableDefinition }
  | { readonly op: 'create_index'; readonly index: IndexDefinition }
  | { readonly op: 'create_fts_index'; readonly index: FtsIndexDefinition };

export const BASELINE_SCHEMA_PLAN: readonly SchemaOperation[] = [
  ...ALL_TABLES.map((table): SchemaOperation => ({ op: 'create_table', table })),
  ...ALL_INDEXES.map((index): SchemaOperation => ({ op: 'create_index', index })),
  { op: 'create_fts_index', index: TASK_SEARCH_FTS_INDEX },
];
