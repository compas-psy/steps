export type { SqliteDriverPort, SqliteParam, SqliteRow } from './driver-port.js';

/**
 * Реализация `SqliteDriverPort` на `node:sqlite` (задание пакета работ
 * E02.2, ADR-0005 «тесты/CI») — весь адаптер `StoragePort` вокруг неё.
 */
export { NodeSqliteDriver } from './node-sqlite-driver.js';
export {
  createSqliteMigrations,
  detectCurrentSchemaVersion,
  schemaOperationDownSql,
  schemaOperationUpSql,
  sqliteMigrationCheckpoint,
  SQLITE_BASELINE_MIGRATION_VERSION,
} from './migrations.js';
export {
  buildCreateFtsSql,
  buildCreateIndexSql,
  buildCreateTableSql,
  buildDropFtsSql,
  buildDropIndexSql,
  buildDropTableSql,
  buildUpsertSql,
} from './ddl.js';
export {
  createSqliteStorageForContract,
  openSqliteStorage,
  SqliteStorage,
} from './sqlite-storage.js';
