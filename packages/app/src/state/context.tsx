/**
 * React-контекст поверх `AppController` (`./store.js`) — тот же паттерн,
 * что `state/context.tsx` в `compas-psy/zapiski`: `useSyncExternalStore`
 * подписывает компонент на конкретный срез состояния без внешней
 * стейт-библиотеки (см. обоснование в `store.ts`).
 *
 * `AppHost` (платформенные порты + реальное хранилище) идёт тем же
 * контекстом — экраны получают и состояние навигации, и доступ к
 * `@shagi/storage`/`@shagi/platform` одним хуком, без прокидывания пропсов
 * через каждый уровень.
 */
import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';

import type { StoragePort } from '@shagi/storage';

import type { AppHost } from '../App.js';
import { type AppController, type AppState, createAppController } from './store.js';
import { resolveStorageBackend } from './storage-backend.js';

interface AppContextValue {
  readonly controller: AppController;
  readonly host: AppHost;
  readonly storage: StoragePort;
}

const AppContext = createContext<AppContextValue | null>(null);

export interface AppProviderProps {
  readonly host: AppHost;
  readonly children: ReactNode;
  /** Только для тестов/сторибука экранов — внешний контроллер вместо
   * создаваемого по умолчанию, чтобы можно было предустановить экран. */
  readonly controller?: AppController;
  /**
   * Уже собранное хранилище. Нужен нативному backend'у (ADR-0005): его
   * нельзя собрать синхронно — открытие базы, протокол миграций схемы и
   * одноразовый перенос из IndexedDB асинхронны по природе. Оболочка
   * вызывает `prepareStorage()` ДО монтирования и передаёт результат сюда.
   *
   * Для остальных backend'ов проп не нужен: они собираются синхронно из
   * `host.storageBackend`, и ни один существующий экран/тест об этом
   * пропе не знает.
   */
  readonly storage?: StoragePort;
}

export function AppProvider({
  host,
  children,
  controller,
  storage: preparedStorage,
}: AppProviderProps): ReactElement {
  const resolvedController = controller ?? createAppController();
  // Резолвится один раз на смонтированный `AppHost`, не на каждый рендер —
  // `createIndexedDbStorage`/`createInMemoryStorage` заводят собственное
  // состояние (открытое соединение/таблицы), пересоздавать его без причины
  // означало бы терять его между рендерами. Готовое хранилище от оболочки
  // (нативная SQLite) не пересобирается вовсе.
  const storage = useMemo(
    () => preparedStorage ?? resolveStorageBackend(host.storageBackend),
    [preparedStorage, host.storageBackend],
  );
  return (
    <AppContext.Provider value={{ controller: resolvedController, host, storage }}>
      {children}
    </AppContext.Provider>
  );
}

function useAppContext(): AppContextValue {
  const value = useContext(AppContext);
  if (value === null) {
    throw new Error('useApp/useAppState/useHost вызваны вне <AppProvider>');
  }
  return value;
}

/** Текущее состояние навигации (переподписывается на изменения). */
export function useAppState(): AppState {
  const { controller } = useAppContext();
  return useSyncExternalStore(controller.subscribe, controller.getState);
}

/** Сам контроллер — для вызова `goTo`/`continueLocally` из обработчиков. */
export function useAppController(): AppController {
  return useAppContext().controller;
}

/** `AppHost`, переданный оболочкой (`apps/web|desktop|mobile`) — платформенные
 * порты и описание storage backend'а (не сам `StoragePort` — см. `useStorage`). */
export function useHost(): AppHost {
  return useAppContext().host;
}

/** Реальный `StoragePort` (`@shagi/storage`), собранный из `host.storageBackend`
 * функцией `resolveStorageBackend` — экраны читают/пишут задачи через него. */
export function useStorage(): StoragePort {
  return useAppContext().storage;
}
