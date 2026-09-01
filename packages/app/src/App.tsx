/**
 * `App` — единственная точка монтирования продукта (SPEC/00 §3).
 *
 * До E04 это был пустой корневой узел (E00.5) — оболочки могли монтировать
 * `@shagi/app` до того, как появились экраны. С E04 здесь: boot-
 * последовательность (`platform.localDb.initialize()`/`close()` — SPEC §4,
 * «порт существует, чтобы приложение могло инициализировать хранилище в
 * boot-последовательности»), контекст состояния навигации (`state/
 * context.tsx`) и переключение экранов матрицы M01–M06
 * (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`).
 *
 * `data-shagi-app-root` — устойчивый крючок для smoke-теста оболочки
 * (Playwright у `apps/web`), сохранён неизменным.
 *
 * --- Оверлей Quick Add и `Ctrl/Cmd+N` (эпик E05.2) ---------------------------
 *
 * `<QuickAddOverlay>` рендерится рядом с `<Screens>` (не вместо), условно на
 * `quickAdd !== null` (`state/store.ts`) — см. заголовок `store.ts`, блок
 * про `quickAdd`, за полным обоснованием "оверлей, не `ScreenId`" (D12
 * "callable from any app route"). Глобальный `Ctrl/Cmd+N` (`01§3`, раздел
 * "Desktop") — один `keydown`-слушатель на `window` внутри `Bootstrap`
 * (единственное место под `AppProvider`, где уже есть доступ к
 * `useAppController()`), снимается при размонтировании тем же эффектом,
 * что и boot-последовательность `localDb` рядом. `preventDefault()` —
 * `Ctrl+N`/`Cmd+N` иначе открыли бы новое окно браузера/приложения.
 */
import { useEffect, type ReactElement } from 'react';

import { isAvailable, type PlatformCapabilitiesRegistry } from '@shagi/platform';

import { AppProvider, useAppController, useAppState } from './state/context.js';
import type { StorageBackend } from './state/storage-backend.js';
import { QuickAdd } from './screens/QuickAdd.js';
import { SCREENS } from './screens/index.js';
import { AppShell, isMainTabScreen } from './shell/AppShell.js';
import { OfflineBanner } from './shell/OfflineBanner.js';
import type { AppController } from './state/store.js';

/**
 * Контракт между оболочкой (`apps/*`) и продуктом (`@shagi/app`).
 *
 * `platform` — реестр возможностей платформы (SPEC §4). `storageBackend` —
 * ТОЛЬКО описание, какой адаптер `@shagi/storage` использовать (данные, не
 * готовый объект) — оболочке запрещено импортировать `@shagi/storage`
 * напрямую (`apps/web/test/architecture-boundary.test.ts`, SPEC §3), сам
 * `StoragePort` строит `@shagi/app` через `resolveStorageBackend`
 * (`state/storage-backend.ts`). Новые поля host'а добавляются по мере
 * того, как экранам реально есть, что у оболочки спросить — не заранее.
 */
export interface AppHost {
  readonly platform: PlatformCapabilitiesRegistry;
  readonly storageBackend: StorageBackend;
}

function Screens(): ReactElement | null {
  const { screen } = useAppState();
  const ScreenComponent = SCREENS[screen];
  if (ScreenComponent === undefined) return null;
  // `AppShell` (постоянная нижняя навигация, эпик E09) оборачивает только
  // «главные» экраны (`isMainTabScreen`) — онбординг-поток и `Inbox`
  // (карточка со своей кнопкой «Назад», не равноправная вкладка) рендерятся
  // как раньше, без обвязки.
  return isMainTabScreen(screen) ? (
    <AppShell>
      <ScreenComponent />
    </AppShell>
  ) : (
    <ScreenComponent />
  );
}

/**
 * Boot-последовательность: `localDb.initialize()` при монтировании,
 * `close()` при размонтировании. `Unavailable` (тестовый режим, SPEC §4)
 * пропускается молча — это не ошибка, а честный ответ «на этой платформе
 * персистентности нет», уже разобранный на уровне типов `isAvailable`.
 */
function useBootstrapLocalDb(platform: PlatformCapabilitiesRegistry): void {
  useEffect(() => {
    const localDb = platform.localDb;
    if (!isAvailable(localDb)) return;
    void localDb.initialize();
    return () => void localDb.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `platform` — стабильный объект от вызывающей оболочки, пересоздание host'а не входит в жизненный цикл монтирования
  }, []);
}

/** См. заголовок файла, блок «Оверлей Quick Add и `Ctrl/Cmd+N`». */
function useGlobalQuickAddShortcut(controller: AppController): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n';
      if (!isShortcut) return;
      event.preventDefault();
      controller.openQuickAdd('global');
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [controller]);
}

function Bootstrap({ host }: { host: AppHost }): ReactElement {
  useBootstrapLocalDb(host.platform);
  useGlobalQuickAddShortcut(useAppController());
  return (
    <>
      {/* M39 (`12_SCREEN_STATE_MATRIX.md`) — на любом экране, не только
       * «главных» вкладках `AppShell`, см. заголовок `OfflineBanner`. */}
      <OfflineBanner networkStatus={host.platform.networkStatus} />
      <Screens />
      <QuickAdd />
    </>
  );
}

export function App({ host }: { host: AppHost }): ReactElement {
  return (
    <div data-shagi-app-root="">
      <AppProvider host={host}>
        <Bootstrap host={host} />
      </AppProvider>
    </div>
  );
}
