import { BASELINE_SCHEMA_PLAN, type SchemaOperation } from '../migration/baseline-schema-plan.js';
import type { MigrationCheckpointPort, MigrationStep } from '../migration/migration.js';

import {
  buildCreateFtsSql,
  buildCreateIndexSql,
  buildCreateTableSql,
  buildDropFtsSql,
  buildDropIndexSql,
  buildDropTableSql,
} from './ddl.js';
import type { NodeSqliteDriver } from './node-sqlite-driver.js';

/**
 * Материализация схемы через протокол миграций (`../migration/migration.ts`,
 * задание пакета работ E02.2, п.2) — `BASELINE_SCHEMA_PLAN` уже перечисляет
 * операции в правильном порядке (таблицы → индексы → FTS,
 * `../migration/baseline-schema-plan.ts`), эта функция только переводит
 * каждую операцию в SQL через `./ddl.ts`. Ровно одна миграция (версия 1) —
 * второй в этом пакете работ не появляется, следующие пакеты работ добавят
 * версии 2+ рядом, не трогая эту.
 */
export function schemaOperationUpSql(operation: SchemaOperation): string {
  switch (operation.op) {
    case 'create_table':
      return buildCreateTableSql(operation.table);
    case 'create_index':
      return buildCreateIndexSql(operation.index);
    case 'create_fts_index':
      return buildCreateFtsSql(operation.index);
  }
}

export function schemaOperationDownSql(operation: SchemaOperation): string {
  switch (operation.op) {
    case 'create_table':
      return buildDropTableSql(operation.table);
    case 'create_index':
      return buildDropIndexSql(operation.index);
    case 'create_fts_index':
      return buildDropFtsSql(operation.index);
  }
}

export const SQLITE_BASELINE_MIGRATION_VERSION = 1;

/**
 * `MigrationStep<NodeSqliteDriver>[]` для `runMigrations` (`../migration/migration.ts`).
 * `down` — обратный порядок `BASELINE_SCHEMA_PLAN` (FTS → индексы → таблицы,
 * сами таблицы в обратном порядке создания — так зависимые внешние ключи
 * дропаются раньше того, на что они ссылаются; см. `./ddl.ts`
 * `buildUpsertSql` про то, почему порядок вообще важен для FK).
 */
export function createSqliteMigrations(): readonly MigrationStep<NodeSqliteDriver>[] {
  return [
    {
      version: SQLITE_BASELINE_MIGRATION_VERSION,
      description: 'Базовая схема: 13 таблиц конспекта §7, 10 индексов, FTS5 по задачам (02§3)',
      up: async (executor) => {
        for (const operation of BASELINE_SCHEMA_PLAN) {
          await executor.execute(schemaOperationUpSql(operation));
        }
      },
      down: async (executor) => {
        for (const operation of BASELINE_SCHEMA_PLAN.toReversed()) {
          await executor.execute(schemaOperationDownSql(operation));
        }
      },
    },
  ];
}

/**
 * Определяет версию уже применённой схемы у СУЩЕСТВУЮЩЕЙ базы (нужно, чтобы
 * повторное открытие уже мигрированного файла не пыталось создать таблицы
 * заново). В этом пакете работ версия всего одна — единственный вопрос,
 * который стоит перед `runMigrations`, это "применена ли миграция 1", а не
 * "какая из N версий применена"; полноценный учёт версии схемы (отдельная
 * системная таблица) — задача следующего пакета работ, когда версий станет
 * больше одной, и придётся отличать "версия 1" от "версия 2" не только по
 * наличию `tasks`.
 */
export async function detectCurrentSchemaVersion(driver: NodeSqliteDriver): Promise<number> {
  const row = await driver.queryOne<{ readonly name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    ['tasks'],
  );
  return row === null ? 0 : SQLITE_BASELINE_MIGRATION_VERSION;
}

/**
 * `MigrationCheckpointPort` для `NodeSqliteDriver` (`02§15`: "native atomic
 * DB backup/checkpoint"). `NodeSqliteDriver.snapshot`/`restoreFromSnapshot`
 * оборачивают `DatabaseSync.serialize`/`deserialize` — настоящий байтовый
 * снимок всей БД в памяти, не SQL-транзакция: протокол `runMigrations`
 * (`../migration/migration.ts`) снимает checkpoint ДО каждого шага и не
 * предусматривает отдельного "commit" хука при успехе (см. её комментарий),
 * поэтому обычный `BEGIN`/`COMMIT` сюда не ложится — снимок/восстановление
 * байт ложится ровно на форму протокола.
 */
export const sqliteMigrationCheckpoint: MigrationCheckpointPort<NodeSqliteDriver, Uint8Array> = {
  createCheckpoint: async (executor) => executor.snapshot(),
  restoreCheckpoint: async (executor, checkpoint) => {
    executor.restoreFromSnapshot(checkpoint);
  },
};
