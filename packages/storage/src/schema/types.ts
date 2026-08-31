/**
 * Логическое, платформонезависимое описание схемы — не DDL. Ни SQLite, ни
 * IndexedDB здесь не упоминаются: обе будущие реализации (следующие пакеты
 * работ) переводят эти структуры в свой конкретный DDL/object store, но
 * читают ОДНО и то же описание — это и есть механизм, которым `02§4`
 * ("IndexedDB logical schema mirrors native contracts") обеспечивается не
 * дисциплиной, а общим источником данных: разойтись здесь физически негде,
 * пока обе реализации действительно читают эти структуры, а не
 * переписывают колонки вручную по памяти.
 *
 * Имена столбцов — `snake_case`, как в конспекте §7 и `02§2` (это то, что
 * реально ляжет в SQL/индекс), а не `camelCase` доменных типов
 * `@shagi/core` (`Task.plannedDate` → колонка `planned_date`). Соответствие
 * имён — забота конкретного адаптера (следующий пакет работ), не этого
 * файла: он документирует форму хранения, не пишет маппер.
 */

export type ColumnType =
  | 'uuid'
  | 'text'
  | 'integer'
  | 'bigint'
  | 'boolean'
  | 'json'
  | 'instant'
  | 'plain_date'
  | 'plain_time';

export interface ColumnDefinition {
  readonly name: string;
  readonly type: ColumnType;
  readonly nullable: boolean;
}

export interface ForeignKeyDefinition {
  readonly column: string;
  readonly referencesTable: string;
  readonly referencesColumn: string;
}

export interface TableDefinition {
  readonly name: string;
  readonly columns: readonly ColumnDefinition[];
  readonly primaryKey: readonly string[];
  readonly foreignKeys: readonly ForeignKeyDefinition[];
}

function column(name: string, type: ColumnType, nullable = false): ColumnDefinition {
  return { name, type, nullable };
}

/** Свободная функция-конструктор — все определения таблиц ниже собраны
 * через неё, чтобы не повторять форму объекта 13 раз руками. */
export function defineTable(
  name: string,
  columns: readonly ColumnDefinition[],
  primaryKey: readonly string[],
  foreignKeys: readonly ForeignKeyDefinition[] = [],
): TableDefinition {
  return { name, columns, primaryKey, foreignKeys };
}

export { column };
