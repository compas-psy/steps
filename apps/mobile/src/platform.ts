/**
 * Реестр возможностей платформы «мобайл» (Android, Tauri 2 Mobile).
 *
 * Тот же принцип честности, что у веба и десктопа: недоступная возможность
 * — `Unavailable` с причиной, не заглушка.
 *
 * Реализовано по-настоящему:
 *  - `networkStatus` — `navigator.onLine`: системный WebView на Android
 *    (тот же движок, что у Chrome) поддерживает это API так же, как браузер;
 *  - `haptics` — Web Vibration API (`navigator.vibrate`). Именно она, а не
 *    нативный `Vibrator` через JNI: WebView Android поддерживает вибрацию
 *    из коробки, а нативный мост — лишняя Rust/Kotlin поверхность там, где
 *    её нечем оправдать (SPEC §3 — оболочка тонкая). `VIBRATE` в
 *    `android-permissions.txt` — ровно под этот вызов;
 *  - `deepLink` — `tauri-plugin-deep-link`. Схема по умолчанию Tauri Mobile
 *    выводит из `identifier` (`tauri.conf.json`) без дополнительной
 *    конфигурации; `plugins.deep-link` в этом файле НЕ настроен намеренно —
 *    Android App Links требуют боевой домен с `.well-known/assetlinks.json`
 *    (README плагина), которого у продукта пока нет, а прописывать
 *    несуществующий домен значило бы поставить конфиг, который сломается
 *    при первой проверке;
 *  - `localPreferences` — `localStorage` (WebView Android поддерживает Web
 *    Storage как обычный браузер), синхронный, тот же приём, что
 *    `apps/web/src/platform.ts` — тема оформления (M42) и будущие настройки;
 *  - `notificationScheduler` — `notification-bridge.ts` (Task B4):
 *    `tauri-plugin-notification` (Task B2, планирование/boot-restore,
 *    ADR-0008) плюс локальный `tauri-plugin-alarm-capability` (Task B3,
 *    проверка `canScheduleExactAlarms()`) — разрешения из
 *    `android-permissions.txt` (`POST_NOTIFICATIONS`/`SCHEDULE_EXACT_ALARM`/
 *    `USE_EXACT_ALARM`/`RECEIVE_BOOT_COMPLETED`) теперь используются, а не
 *    просто зарезервированы.
 *
 * `Unavailable` с причиной — всё остальное:
 *  - `localDb`/`fileStore` — `@shagi/storage`, ещё не поставлен;
 *  - `secureCredentials` — аккаунта в R1a нет;
 *  - `share` — Android `ACTION_SEND` через нативный intent не реализован в
 *    этом пакете работ; полагаться на `navigator.share` в системном WebView
 *    без проверки на устройстве значило бы обещать то, что не проверено —
 *    здесь такого нет вовсе (нет Android SDK в контейнере);
 *  - `globalShortcut`/`widget` — у Android нет системных глобальных
 *    хоткеев (SPEC §4), виджеты — R1b;
 *  - `updater`/`billing`/`pushHint`/`calendarProvider`/`audioCapture` —
 *    собственный апдейтер и Google Play Billing не подключены в этом
 *    пакете работ; R1/R1.1/R3 соответственно.
 */
import type { PlatformCapabilitiesRegistry, Unavailable } from '@shagi/platform';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { createNotificationBridge } from './notification-bridge.js';

function unavailable(reason: string): Unavailable {
  return { kind: 'unavailable', reason };
}

function createNetworkStatus(): PlatformCapabilitiesRegistry['networkStatus'] {
  return {
    isOnline: () => navigator.onLine,
    onChange(handler) {
      const online = () => handler(true);
      const offline = () => handler(false);
      window.addEventListener('online', online);
      window.addEventListener('offline', offline);
      return () => {
        window.removeEventListener('online', online);
        window.removeEventListener('offline', offline);
      };
    },
  };
}

function createHaptics(): PlatformCapabilitiesRegistry['haptics'] {
  if (!('vibrate' in navigator)) {
    return unavailable('Vibration API недоступна в этом WebView');
  }
  const vibrate = navigator.vibrate.bind(navigator);
  return {
    async light() {
      vibrate(10);
    },
    async medium() {
      vibrate(25);
    },
    async heavy() {
      vibrate(50);
    },
  };
}

/** Синхронный `localStorage` — тот же приём и то же обоснование (в т.ч.
 * поглощение исключения в средах без хранения), что `apps/web/src/platform.ts`,
 * `createLocalPreferences` — комментарий там за полным разбором. */
function createLocalPreferences(): PlatformCapabilitiesRegistry['localPreferences'] {
  return {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // См. `apps/web/src/platform.ts`, `createLocalPreferences`.
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // См. `apps/web/src/platform.ts`, `createLocalPreferences`.
      }
    },
  };
}

function createDeepLink(): PlatformCapabilitiesRegistry['deepLink'] {
  return {
    onLink(handler) {
      let unlisten: (() => void) | null = null;
      let cancelled = false;
      void onOpenUrl((urls) => {
        for (const url of urls) handler(url);
      }).then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });
      return () => {
        cancelled = true;
        unlisten?.();
      };
    },
    async initialLink() {
      // Холодный старт по ссылке/App Link на Android разбирается плагином
      // (intent) — маршрута, которому это передать, ещё нет (@shagi/app, E04).
      return null;
    },
  };
}

export function createMobilePlatform(): PlatformCapabilitiesRegistry {
  return {
    localDb: unavailable(
      'Репозитории — задача @shagi/storage, ещё не поставлена (следующий пакет работ)',
    ),
    fileStore: unavailable('Вложения — R1b (SPEC/00 §10)'),
    secureCredentials: unavailable('Аккаунта и синка в R1a нет — нечего защищённо хранить'),
    notificationScheduler: createNotificationBridge(),
    deepLink: createDeepLink(),
    share: unavailable(
      'ACTION_SEND через нативный intent не реализован в этом пакете работ — Android SDK недоступен в контейнере, чтобы это проверить',
    ),
    globalShortcut: unavailable('У Android нет системных глобальных хоткеев (SPEC §4)'),
    haptics: createHaptics(),
    widget: unavailable('Android widgets — R1b (SPEC/00 §0, §4)'),
    updater: unavailable(
      'Собственный апдейтер (Tauri Mobile не даёт store updater) не подключён в этом пакете работ',
    ),
    billing: unavailable('Google Play Billing не подключён в R1a'),
    pushHint: unavailable('R1 push не использует (SPEC/00 §4)'),
    networkStatus: createNetworkStatus(),
    calendarProvider: unavailable('Внешние календари — R1.1'),
    audioCapture: unavailable('Voice input — R3'),
    localPreferences: createLocalPreferences(),
  };
}
