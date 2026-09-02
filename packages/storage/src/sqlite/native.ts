/**
 * Точка входа НАТИВНОГО SQLite-пути (ADR-0005) — то, что импортирует
 * `@shagi/app` для Tauri-оболочек.
 *
 * Отдельный подпуть пакета (`@shagi/storage/sqlite-native`), а не общий
 * баррель `@shagi/storage/sqlite`, по одной причине: общий баррель
 * реэкспортирует `NodeSqliteDriver`, а тот на верхнем уровне делает
 * `import { DatabaseSync } from 'node:sqlite'`. В WebView такого модуля
 * нет, и импорт барреля уронил бы приложение до первого рендера. Здесь
 * граф импортов физически не может дотянуться до `node:`.
 */
export { BridgedSqliteDriver } from './native-bridge.js';
export type {
  NativeSqlBridge,
  NativeSqlInfo,
  NativeSqlRow,
  NativeSqlValue,
} from './native-bridge.js';
export { openNativeSqliteStorage, SqliteStorage } from './storage.js';
