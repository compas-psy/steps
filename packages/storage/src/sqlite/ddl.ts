import type { FtsIndexDefinition, IndexDefinition } from '../schema/indexes.js';
import type { ColumnDefinition, ColumnType, TableDefinition } from '../schema/types.js';

/**
 * Перевод логической схемы (`../schema/tables.ts`, `../schema/indexes.ts`)
 * в настоящий SQLite DDL (задание пакета работ E02.2, п.2: "не пиши SQL
 * второй раз руками параллельно логическому описанию"). Единственный
 * источник, откуда берутся имена таблиц/столбцов/индексов для CREATE-запросов
 * — сами структуры `TableDefinition`/`IndexDefinition`/`FtsIndexDefinition`,
 * а не отдельно вручную набранные строки SQL.
 *
 * Идентификаторы (`quoteIdent`) собираются конкатенацией — это не то же
 * самое SQL-инъекция, от которой защищают подготовленные выражения:
 * значения здесь приходят из статических определений схемы в исходном коде
 * этого пакета, а не от пользователя/сети (задание E02.2 п.3 требует
 * prepared statements для ЗНАЧЕНИЙ данных — `./repositories.ts`,
 * `./mutation.ts` — там параметры всегда идут через `?`, никогда через
 * конкатенацию).
 */

function quoteIdent(name: string): string {
  return `"${name}"`;
}

function columnSqlType(type: ColumnType): string {
  switch (type) {
    case 'uuid':
    case 'text':
    case 'json':
    case 'plain_date':
    case 'plain_time':
      return 'TEXT';
    case 'integer':
    case 'bigint':
    case 'boolean':
    case 'instant':
      // Все четыре — целочисленные для SQLite; `instant` хранит
      // epoch-наносекунды (`./codec.ts`), `boolean` — 0/1.
      return 'INTEGER';
  }
}

function columnDdl(column: ColumnDefinition): string {
  const nullability = column.nullable ? '' : ' NOT NULL';
  return `${quoteIdent(column.name)} ${columnSqlType(column.type)}${nullability}`;
}

export function buildCreateTableSql(table: TableDefinition): string {
  const parts: string[] = table.columns.map(columnDdl);
  parts.push(`PRIMARY KEY (${table.primaryKey.map(quoteIdent).join(', ')})`);
  for (const fk of table.foreignKeys) {
    parts.push(
      `FOREIGN KEY (${quoteIdent(fk.column)}) REFERENCES ${quoteIdent(fk.referencesTable)}(${quoteIdent(fk.referencesColumn)})`,
    );
  }
  return `CREATE TABLE ${quoteIdent(table.name)} (\n  ${parts.join(',\n  ')}\n)`;
}

export function buildDropTableSql(table: TableDefinition): string {
  return `DROP TABLE IF EXISTS ${quoteIdent(table.name)}`;
}

export function buildCreateIndexSql(index: IndexDefinition): string {
  const columns = index.columns.map(quoteIdent).join(', ');
  return `CREATE INDEX ${quoteIdent(index.name)} ON ${quoteIdent(index.table)} (${columns})`;
}

export function buildDropIndexSql(index: IndexDefinition): string {
  return `DROP INDEX IF EXISTS ${quoteIdent(index.name)}`;
}

/**
 * FTS5-таблица (`02§3`, `../schema/indexes.ts` `TASK_SEARCH_FTS_INDEX`).
 * `id UNINDEXED` — собственный первичный ключ содержимого (`tasks.id`), не
 * участвует в полнотекстовом поиске, нужен только чтобы находить/заменять
 * строку конкретной задачи (`./fts.ts`). Автономная (без `content=`) —
 * не "external content" таблица: содержимое явно дублируется при каждой
 * ресинхронизации (`./fts.ts`), что и требуется решением "rebuildable from
 * canonical rows" (`../schema/indexes.ts` `FtsIndexDefinition`), а внешний
 * content-режим добавил бы FTS5-специфичные триггеры синхронизации с rowid
 * исходной таблицы — сложность, которую задание пакета работ E02.2 явно не
 * требует (ранжирование — отдельный пакет работ).
 */
export function buildCreateFtsSql(index: FtsIndexDefinition): string {
  const columns = ['id UNINDEXED', ...index.ownColumns, ...index.denormalizedFields];
  return `CREATE VIRTUAL TABLE ${quoteIdent(index.name)} USING fts5(${columns.join(', ')})`;
}

export function buildDropFtsSql(index: FtsIndexDefinition): string {
  return `DROP TABLE IF EXISTS ${quoteIdent(index.name)}`;
}

/**
 * `INSERT ... ON CONFLICT (pk) DO UPDATE SET ...` — единственный write-путь
 * для сущностей (`applyMutation`, `02§2`): все таблицы кроме `sync_outbox`
 * могут получить повторную запись по тому же первичному ключу (обновление
 * существующей сущности), поэтому upsert, а не голый `INSERT`.
 *
 * Осознанно не `INSERT OR REPLACE`: тот сперва физически удаляет старую
 * строку, а затем вставляет новую — при активных внешних ключах (`PRAGMA
 * foreign_keys=ON`, обязательна в этом пакете работ) это на мгновение рвёт
 * ссылки других строк на эту (например, `tasks.parent_task_id` дочерних
 * задач на переиздаваемую родительскую) в рамках одного `DELETE`+`INSERT`.
 * `ON CONFLICT DO UPDATE` — обновление на месте, без удаления, ссылки не
 * рвутся ни на миг.
 */
export function buildUpsertSql(table: TableDefinition): string {
  const columns = table.columns.map((c) => c.name);
  const placeholders = columns.map(() => '?').join(', ');
  const conflictTarget = table.primaryKey.map(quoteIdent).join(', ');
  const updates = columns
    .filter((name) => !table.primaryKey.includes(name))
    .map((name) => `${quoteIdent(name)} = excluded.${quoteIdent(name)}`)
    .join(', ');
  const columnList = columns.map(quoteIdent).join(', ');

  const base = `INSERT INTO ${quoteIdent(table.name)} (${columnList}) VALUES (${placeholders})`;
  // Составной PK без единого небазового столбца (в схеме этого пакета не
  // встречается, но защититься дешевле, чем сгенерировать невалидный SQL):
  // `DO NOTHING` вместо пустого `SET`.
  return updates.length === 0
    ? `${base} ON CONFLICT (${conflictTarget}) DO NOTHING`
    : `${base} ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updates}`;
}
