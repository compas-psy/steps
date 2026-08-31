/**
 * `@shagi/storage` — адаптер `StoragePort` поверх IndexedDB (задание пакета
 * работ E02.3). Реэкспортируется из главного барреля пакета (`../index.ts`),
 * тем же приёмом, что и `../sqlite/index.ts`, — глобальный `indexedDB`
 * читается только ВНУТРИ тел функций (`openIndexedDbDatabase` и т.п.), не
 * на верхнем уровне модуля, поэтому сам импорт этого файла ничего не трогает
 * в платформенном API и безопасен в любом рантайме; настоящий доступ к
 * `indexedDB` происходит только при вызове `createIndexedDbStorage(...)`.
 */
export { createIndexedDbStorage, IndexedDbStorage } from './indexeddb-storage.js';
export {
  createIndexedDbCheckpoint,
  indexedDbCheckpointPort,
  restoreIndexedDbCheckpoint,
  type IndexedDbMigrationExecutor,
  type IndexedDbSnapshot,
} from './checkpoint.js';
export { applyBaselineSchema, allObjectStoreNames, DATABASE_VERSION } from './schema.js';
export { openIndexedDbDatabase } from './request.js';
export { rebuildSearchIndex, runSearch } from './search-index.js';
