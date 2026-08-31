/**
 * `@shagi/storage/migration` — механизм версионирования схемы (задание
 * пакета работ E02.1, п.4; `02§15`). Конкретные SQLite/IndexedDB миграции
 * — следующие пакеты работ; здесь только протокол безопасности (checkpoint
 * → apply → restore-on-failure) и содержимое базовой миграции 0001 как
 * платформонезависимый план операций.
 */
export {
  runMigrations,
  type MigrationCheckpointPort,
  type MigrationOutcome,
  type MigrationStep,
} from './migration.js';
export { BASELINE_SCHEMA_PLAN, type SchemaOperation } from './baseline-schema-plan.js';
