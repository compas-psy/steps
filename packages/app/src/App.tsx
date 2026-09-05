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
 *
 * --- Boot-применение темы (M42 Appearance, пакет работ «Настройки») -------
 *
 * `useBootstrapTheme` — читает сохранённый `ThemePreference`
 * (`theme/preference.js`, `LocalPreferencesPort`) и применяет его к
 * `document.documentElement` ПРИ КАЖДОМ ЗАПУСКЕ приложения, а не только
 * когда пользователь долистает до `screens/Appearance.tsx`. Без этого шага
 * тема сбрасывалась бы к дефолту («система») при каждой перезагрузке
 * страницы, пока пользователь заново не зайдёт в Settings → Оформление —
 * прямое нарушение задания «применяет его при следующем запуске» (найдено
 * и исправлено при ручной проверке в браузере этим же пакетом работ: без
 * этого хука `data-theme` после `location.reload()` оставался `null`, хотя
 * `localStorage` уже хранил `'light'`/`'dark'`). `Unavailable` — молча
 * пропускается, тот же приём, что `useBootstrapLocalDb` рядом.
 *
 * --- Boot-реконсиляция напоминаний (00§7 шаг 5, Task A4) -------------------
 *
 * `useBootstrapReminderReconciliation` — на каждом запуске сверяет ВЕСЬ
 * желаемый набор напоминаний workspace с тем, что реально запланировано на
 * платформе (`reconcileReminderSchedule`, Task A3,
 * `state/reminder-reconciliation.ts`), и молча чинит расхождение
 * (доспланирует недостающее, отменяет лишнее). Источник истины —
 * SQLite/IndexedDB, не память нативного слоя: если ОС потеряла alarm
 * (Android `RECEIVE_BOOT_COMPLETED` — Phase B), этот проход при следующем
 * открытии приложения его находит и пересоздаёт. Точечная реконсиляция
 * ПОСЛЕ конкретной команды (create/cancel reminder, complete/delete task —
 * `reconcileReminderScheduleForTask`, экраны `packages/app/src/screens/*`)
 * покрывает обычный путь; этот полный скан — сеть безопасности на случай,
 * когда синхронный путь не отработал (краш до реконсиляции, sync с другого
 * устройства, потерянный alarm) — тот же принцип "источник истины — база,
 * не память платформы", что документирует сам `reconcileReminderSchedule`.
 *
 * --- Смена таймзоны (01§19, Task A5) ----------------------------------------
 *
 * "При смене таймзоны устройства продукт пересчитывает локальные напоминания,
 * сохраняя 09:00 локальным 09:00" — 09:00 остаётся тем же `PlainTime`,
 * пересчитывается только момент срабатывания в UTC. Полный скан выше и так
 * вызывается БЕЗУСЛОВНО на каждом запуске и уже передаёт ТЕКУЩУЮ таймзону
 * (`Temporal.Now.timeZoneId()`) в `reconcileReminderSchedule` — если человек
 * улетел в другой пояс и перезапустил приложение, реконсиляция сама
 * пересчитает момент срабатывания по новой таймзоне и переставит
 * платформенный alarm (фингерпринт внутри `reconcileReminderSchedule`,
 * Task A2, зависит от `timezone` — это её работа, не переделывается здесь,
 * см. Task A6).
 *
 * Значит не покрыто только ОБНАРУЖЕНИЕ факта смены — то, ради чего этот
 * блок. Ни один из трёх апп-шеллов (`apps/{web,desktop,mobile}/src`) сегодня
 * не публикует нативное событие "часовой пояс сменился" через
 * `PlatformCapabilitiesRegistry` (проверено `grep -rn "visibilitychange|
 * onResume|AppState|document.hidden"` по `packages/app/src` и всем
 * `apps/<оболочка>/src` — ничего не нашлось) — добавлять кросс-платформенный порт "приложение
 * вернулось на передний план" не входит в объём этой задачи, это отдельный,
 * более крупный порт. Рабочий вариант — сравнение "на старте":
 * `useBootstrapTimezoneWatch` читает сохранённую с прошлого запуска
 * таймзону (`shagi.preferences.lastKnownTimezone`, тот же `localPreferences`,
 * что `THEME_PREFERENCE_KEY`/`onboarding.ts` — SPEC §4) и сравнивает с
 * текущей. Полный скан НАД этим сравнением не завязан (он и так шёл бы
 * безусловно) — сравнение даёт запись текущей таймзоны обратно в
 * `localPreferences`, чтобы будущий foreground-триггер (когда появится порт)
 * уже сравнивал с актуальным прошлым значением, а не отсутствующим.
 *
 * ИЗВЕСТНОЕ ОГРАНИЧЕНИЕ: обнаружение происходит только на холодном
 * старте/перемонтировании `<App>`, не мгновенно при смене пояса на живом
 * экране (нет источника такого события — см. выше). Спецификация требует
 * корректности "при смене таймзоны", не реакции короче секунды — это
 * осознанный, документированный компромисс, не забытый случай.
 */
import { useEffect, type ReactElement } from 'react';
import { Temporal } from '@js-temporal/polyfill';

import { isAvailable, type PlatformCapabilitiesRegistry } from '@shagi/platform';

import { AppProvider, useAppController, useAppState, useStorage } from './state/context.js';
import type { StoragePort } from '@shagi/storage';

import type { StorageBackend } from './state/storage-backend.js';
import { QuickAdd } from './screens/QuickAdd.js';
import { SCREENS } from './screens/index.js';
import { AppShell } from './shell/AppShell.js';
import { OfflineBanner } from './shell/OfflineBanner.js';
import { reconcileReminderSchedule } from './state/reminder-reconciliation.js';
import type { AppController } from './state/store.js';
import { THEME_PREFERENCE_KEY, applyTheme, isThemePreference } from './theme/preference.js';

/** Ключ последней известной таймзоны в `localPreferences` — см. заголовок
 * файла, блок «Смена таймзоны». Тот же префикс `shagi.preferences.`, что у
 * `THEME_PREFERENCE_KEY`/`ONBOARDING_DONE_KEY` (не сталкивается с чужими
 * ключами в общем `localStorage` оболочки). */
export const LAST_KNOWN_TIMEZONE_KEY = 'shagi.preferences.lastKnownTimezone';

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
  // Решение «какая обвязка положена этому экрану» целиком внутри `AppShell`:
  // оно зависит не только от экрана, но и от ширины окна (десктопная
  // раскладка охватывает больше экранов, чем мобильные вкладки — см.
  // заголовок `shell/AppShell.tsx`), а ширину знает один хук в одном месте.
  // Раньше здесь стоял `isMainTabScreen(screen)`; развилка по вьюпорту в
  // этой точке означала бы вторую подписку на медиазапрос и второй источник
  // правды о раскладке.
  return (
    <AppShell>
      <ScreenComponent />
    </AppShell>
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

/** См. заголовок файла, блок «Boot-применение темы». Читает сохранённый
 * выбор РОВНО один раз при монтировании — `document.documentElement`
 * глобален, применять его на каждый рендер незачем и не идемпотентно
 * дороже, чем нужно. `Unavailable`/ничего не сохранено — молча остаётся
 * дефолт «система» (атрибут не ставится вовсе), тот же принцип честности,
 * что и `useBootstrapLocalDb`. */
function useBootstrapTheme(platform: PlatformCapabilitiesRegistry): void {
  useEffect(() => {
    const localPreferences = platform.localPreferences;
    if (!isAvailable(localPreferences)) return;
    const saved = localPreferences.get(THEME_PREFERENCE_KEY);
    if (saved !== null && isThemePreference(saved)) {
      applyTheme(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- та же причина, что `useBootstrapLocalDb` выше
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

/** См. заголовок файла, блок «Boot-реконсиляция напоминаний». Полный скан
 * (`reconcileReminderSchedule`, Task A3) — не по одной задаче: на старте
 * (или после `RECEIVE_BOOT_COMPLETED` на Android, где ОС могла потерять
 * alarm между перезагрузкой и тем, как этот код успел отреагировать) нет
 * единственной задачи, которая могла разойтись, разойтись мог весь
 * workspace. `void` — реконсиляция не блокирует первый рендер экрана
 * (уведомления — фоновая забота, не то, от чего зависит, что человек видит
 * первым кадром). `Unavailable` — молча пропускается, тот же принцип
 * честности, что `useBootstrapLocalDb`/`useBootstrapTheme` рядом. */
function useBootstrapReminderReconciliation(
  platform: PlatformCapabilitiesRegistry,
  storage: StoragePort,
): void {
  useEffect(() => {
    const scheduler = platform.notificationScheduler;
    if (!isAvailable(scheduler)) return;
    void reconcileReminderSchedule(
      storage,
      scheduler,
      Temporal.Now.plainDateTimeISO(),
      Temporal.Now.timeZoneId(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- один раз на монтирование хоста (00§7 шаг 5), не на каждый рендер; `storage`/`platform` стабильны на время жизни `AppProvider`, та же причина, что у `useBootstrapLocalDb`
  }, []);
}

/** См. заголовок файла, блок «Смена таймзоны» (01§19, Task A5). Полный скан
 * реконсиляции выше и так безусловно вызывается на каждом запуске с
 * ТЕКУЩЕЙ таймзоной — этот хук её не дублирует и не делает условной, он
 * только фиксирует последнюю известную таймзону в `localPreferences`, чтобы
 * будущему foreground-триггеру (когда появится соответствующий порт, см.
 * заголовок файла) было с чем сравнивать. Читаем прошлое значение ДО
 * записи нового и пишем, только когда оно РЕАЛЬНО отличается (включая
 * самый первый запуск, где сохранённого значения ещё нет вовсе) — не ради
 * экономии байта, а чтобы не дёргать `localPreferences.set` вхолостую на
 * каждом старте: на вебе `localStorage.setItem` рассылает событие `storage`
 * в другие вкладки того же источника, и записывать туда одно и то же
 * значение при каждом монтировании значило бы создавать пустой шторм этих
 * событий без единой смены пояса. `Unavailable` — молча пропускается, тот
 * же принцип честности, что у `useBootstrapLocalDb`/`useBootstrapTheme`
 * рядом. */
function useBootstrapTimezoneWatch(platform: PlatformCapabilitiesRegistry): void {
  useEffect(() => {
    const localPreferences = platform.localPreferences;
    if (!isAvailable(localPreferences)) return;
    const previousTimezone = localPreferences.get(LAST_KNOWN_TIMEZONE_KEY);
    const currentTimezone = Temporal.Now.timeZoneId();
    if (previousTimezone !== currentTimezone) {
      localPreferences.set(LAST_KNOWN_TIMEZONE_KEY, currentTimezone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- один раз на монтирование хоста, та же причина, что у `useBootstrapLocalDb` рядом
  }, []);
}

function Bootstrap({ host }: { host: AppHost }): ReactElement {
  const storage = useStorage();
  useBootstrapLocalDb(host.platform);
  useBootstrapTheme(host.platform);
  useBootstrapReminderReconciliation(host.platform, storage);
  useBootstrapTimezoneWatch(host.platform);
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

export function App({
  host,
  storage,
}: {
  readonly host: AppHost;
  /** Готовое хранилище от оболочки — нужно нативному backend'у, который
   * нельзя собрать синхронно (ADR-0005, см. `AppProviderProps.storage`). */
  readonly storage?: StoragePort;
}): ReactElement {
  return (
    <div data-shagi-app-root="">
      <AppProvider host={host} {...(storage === undefined ? {} : { storage })}>
        <Bootstrap host={host} />
      </AppProvider>
    </div>
  );
}
