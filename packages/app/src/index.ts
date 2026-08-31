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

export { resolveStorageBackend, type StorageBackend } from './state/storage-backend.js';

export { SCREENS } from './screens/index.js';
