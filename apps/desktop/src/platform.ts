/**
 * Реестр возможностей платформы «десктоп» (Windows, Tauri 2).
 *
 * Тот же принцип честности, что у веба (`apps/web/src/platform.ts`):
 * недоступная возможность — `Unavailable` с причиной, не заглушка.
 *
 * Реализовано по-настоящему:
 *  - `networkStatus` — тот же `navigator.onLine`, что и в вебе: webview
 *    Tauri — обычный Chromium/WebView2, API идентично;
 *  - `deepLink` — `tauri-plugin-deep-link`, схема `shagi://` (SPEC §4,
 *    `DeepLinkPort`: «на нативе это intent/URL scheme»);
 *  - `globalShortcut` — `tauri-plugin-global-shortcut`. Это единственная
 *    платформа, где порт вообще осмыслен (SPEC §4: «Поддержка: Windows,
 *    macOS»; ports-таблица §4 явно перечисляет `GlobalShortcutPort` —
 *    десктопный Command Palette/global Quick Add подключится к нему в R1b,
 *    сама регистрация хоткея — не экран и не бизнес-правило);
 *  - `share` — на Windows это копирование в буфer обмена (SPEC §4,
 *    `SharePort`: «на Windows это обычное копирование в clipboard»),
 *    `tauri-plugin-clipboard-manager`, результат всегда `'copied'`.
 *
 * Всё остальное — `Unavailable`: `localDb`/`fileStore` — репозитории и
 * файловое хранилище относятся к `@shagi/storage`, ещё не поставлен;
 * `secureCredentials` — аккаунта в R1a нет; `notificationScheduler` —
 * честная нативная точность (Task Scheduler/AlarmManager-эквивалент)
 * требует отдельного native-плагина, которого в этом пакете работ ещё нет
 * (обещать `'exact'` без проверки means соврать — SPEC §11.1); `haptics` —
 * Windows без вибромотора; `widget` — Windows tiles помечены «future»;
 * `updater` — сервера обновлений/ключа подписи в этом пакете работ нет;
 * `billing`/`pushHint`/`calendarProvider`/`audioCapture` — соответственно
 * R1b+/R1/R1.1/R3.
 */
import type { PlatformCapabilitiesRegistry, Unavailable } from '@shagi/platform';
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

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

function createDeepLink(): PlatformCapabilitiesRegistry['deepLink'] {
  return {
    onLink(handler) {
      // `onOpenUrl` возвращает Promise<UnlistenFn> — оборачиваем в
      // синхронную функцию отписки, т.к. DeepLinkPort её ожидает сразу.
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
      // Холодный старт с deep link на десктопе разбирается самим Tauri
      // (аргументы процесса) — до появления реального маршрута (@shagi/app,
      // E04) отдавать здесь нечего честно, кроме `null`.
      return null;
    },
  };
}

function createGlobalShortcut(): PlatformCapabilitiesRegistry['globalShortcut'] {
  return {
    register(accelerator, handler) {
      void register(accelerator, handler);
      return () => {
        void unregister(accelerator);
      };
    },
    isSupported() {
      return true;
    },
  };
}

function createShare(): PlatformCapabilitiesRegistry['share'] {
  return {
    async share(payload) {
      try {
        await writeText(payload.text);
        return 'copied';
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'clipboard write failed' };
      }
    },
  };
}

export function createDesktopPlatform(): PlatformCapabilitiesRegistry {
  return {
    localDb: unavailable(
      'Репозитории — задача @shagi/storage, ещё не поставлена (следующий пакет работ)',
    ),
    fileStore: unavailable('Вложения — R1b (SPEC/00 §10)'),
    secureCredentials: unavailable('Аккаунта и синка в R1a нет — нечего защищённо хранить'),
    notificationScheduler: unavailable(
      'Точная нативная проверка (Task Scheduler/фоновая доставка) не подключена в этом пакете работ — обещать "exact" без неё значило бы соврать (SPEC §11.1)',
    ),
    deepLink: createDeepLink(),
    share: createShare(),
    globalShortcut: createGlobalShortcut(),
    haptics: unavailable('У Windows нет встроенной вибрации'),
    widget: unavailable('Windows tiles — future (SPEC §4)'),
    updater: unavailable('Сервера обновлений и ключа подписи в этом пакете работ нет'),
    billing: unavailable('Microsoft Store billing не подключён в R1a'),
    pushHint: unavailable('R1 push не использует (SPEC/00 §4)'),
    networkStatus: createNetworkStatus(),
    calendarProvider: unavailable('Внешние календари — R1.1'),
    audioCapture: unavailable('Voice input — R3'),
  };
}
