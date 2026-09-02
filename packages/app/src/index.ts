/**
 * `@shagi/app` — ВСЕ экраны, маршруты и поведение продукта (SPEC/00 §3).
 *
 * Инвариант ТЗ: ни одного экрана, бизнес-правила, правила NLP/sync или
 * пользовательской строки в `apps/*` — всё это только здесь. Оболочки
 * `apps/web|desktop|mobile` — тонкие host-обёртки, которые подключают
 * `@shagi/app` к платформенным портам (`@shagi/platform`) и реальному
 * хранилищу (`@shagi/storage`) и больше ничего не делают.
 */
export const PACKAGE_NAME = '@shagi/app' as const;

export type { AppHost } from './App.js';
export { App } from './App.js';

export type { AppState, AppController, AppStateListener, ScreenId } from './state/store.js';
export { createAppController } from './state/store.js';

export {
  AppProvider,
  useAppState,
  useAppController,
  useHost,
  useStorage,
  type AppProviderProps,
} from './state/context.js';

export {
  prepareStorage,
  resolveStorageBackend,
  type PreparedStorage,
  type StorageBackend,
} from './state/storage-backend.js';
/** Типы моста в нативную SQLite — оболочке они нужны, чтобы реализовать
 * транспорт, а импортировать `@shagi/storage` напрямую ей нельзя (граница
 * `apps/*`, SPEC/00 §3). */
export type { NativeSqlBridge, NativeSqlInfo, NativeSqlRow, NativeSqlValue } from '@shagi/storage';
export {
  BACKEND_MIGRATION_KEY,
  type BackendMigrationCounts,
  type BackendMigrationOutcome,
} from './state/backend-migration.js';

export { SCREENS } from './screens/index.js';
