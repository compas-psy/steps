/**
 * Реестр возможностей платформы «веб» (SPEC §4).
 *
 * Правило одно и жёсткое (`packages/platform/src/index.ts`): чего у
 * платформы нет — то `Unavailable`, и UI (когда появится, E04) СКРОЕТ
 * элемент, а не покажет его выключенным. Здесь нет ни одной заглушки,
 * которая делает вид, что умеет то, чего не умеет.
 *
 * Что реализовано по-настоящему (а не Unavailable) и почему:
 *  - `networkStatus` — `navigator.onLine`, тривиально и честно везде;
 *  - `notificationScheduler` — единственный порт, для которого SPEC §11.1
 *    прямо требует явной, а не подразумеваемой недоступности: браузер
 *    может быть закрыт, и обещать точность здесь означало бы соврать.
 *    Поэтому порт ЕСТЬ, но `getSchedulingCapability()` всегда возвращает
 *    `'no-guarantee'` — честный ответ, а не заглушка;
 *  - `deepLink` — маршрутизация по `location.hash`, не требует сервера;
 *  - `share` — Web Share API, только если браузер её реально поддерживает
 *    (`'share' in navigator`) — проверка возможности в рантайме, а не
 *    догадка по UA;
 *  - `updater` — обновление веба это перезагрузка с новым service worker'ом
 *    (SPEC §4, `UpdaterPort`: «На Web это просто перезагрузка страницы»);
 *  - `localPreferences` — `localStorage`, синхронный, доступен одинаково на
 *    всех трёх оболочек (вебвью, `packages/platform`, `LocalPreferencesPort`)
 *    — тема оформления (M42) и будущие настройки того же рода;
 *  - `localDb` — с E04 больше не `Unavailable`: `@shagi/storage` поставлен
 *    (эпик E02), реальный `StoragePort` для веба — `createIndexedDbStorage`,
 *    которую собирает `main.tsx` и кладёт в `AppHost.storage` напрямую (это
 *    отдельное поле, не через `platform` — командный слой `@shagi/core`
 *    работает с `StoragePort`, а не с реестром возможностей платформы).
 *    Сам `localDb`-порт здесь — тонкий lifecycle-хук boot-последовательности
 *    (`@shagi/app` вызывает `initialize()`/`close()` одинаково на всех
 *    платформах): `IndexedDbStorage` открывает соединение лениво в своём
 *    конструкторе (см. `createIndexedDbStorage`, `@shagi/storage`) и сама
 *    управляет им — на вебе явно открывать/закрывать нечего, оба метода
 *    честные no-op, а не притворство, что здесь происходит реальная работа.
 *
 * Остальные порты помечены `Unavailable` с объяснением — у платформы этого
 * нет в принципе (haptics, globalShortcut, widget — см. заголовки портов),
 * либо инфраструктура ещё не построена в этом пакете работ (fileStore —
 * вложения это R1b; secureCredentials/billing/pushHint — аккаунта и
 * сервера в R1a нет вовсе; calendarProvider — R1.1; audioCapture — R3).
 */
import type {
  DeepLinkPort,
  LocalDbPort,
  LocalPreferencesPort,
  NotificationSchedulerPort,
  PlatformCapabilitiesRegistry,
  SharePort,
  Unavailable,
  UpdaterPort,
} from '@shagi/platform';

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

/**
 * Таймеры живут только пока жива страница/вкладка — ни `setTimeout`, ни
 * `Notification` не переживают закрытие браузера. Это ровно то, что
 * `getSchedulingCapability` обязана честно объявить `'no-guarantee'`
 * (SPEC §11.1), а не изображать точность, которой нет.
 */
function createNotificationScheduler(): NotificationSchedulerPort {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    async schedule(id, title, date, time, timezone) {
      const existing = timers.get(id);
      if (existing !== undefined) clearTimeout(existing);
      // Плавающее локальное время (SPEC §5): материализуем момент через
      // переданную IANA-зону — при смене таймзоны вызывающий код
      // пересобирает расписание заново с той же локальной датой/временем.
      const target =
        time === null
          ? date.toZonedDateTime(timezone)
          : date.toZonedDateTime({ timeZone: timezone, plainTime: time });
      const delayMs = target.epochMilliseconds - Date.now();
      if (delayMs <= 0) return;
      const handle = setTimeout(() => {
        timers.delete(id);
        // eslint-disable-next-line no-new -- системное уведомление и есть побочный эффект; хранить объект незачем
        if (Notification.permission === 'granted') new Notification(title);
      }, delayMs);
      timers.set(id, handle);
    },
    async cancel(id) {
      const handle = timers.get(id);
      if (handle !== undefined) {
        clearTimeout(handle);
        timers.delete(id);
      }
    },
    // Веб не может гарантировать доставку при закрытом браузере (SPEC
    // §11.1) — ответ всегда `'no-guarantee'`, никогда `'exact'`/`'inexact'`.
    async getSchedulingCapability() {
      return 'no-guarantee';
    },
  };
}

/**
 * `IndexedDbStorage` (реальный `StoragePort`) открывает соединение сама —
 * см. заголовок файла. `initialize()`/`close()` — честный no-op, симметричный
 * с нативными платформами, которым есть что открывать/закрывать явно.
 */
function createLocalDb(): LocalDbPort {
  return {
    async initialize() {},
    async close() {},
  };
}

/**
 * `localStorage` синхронный и по контракту `LocalPreferencesPort` (см.
 * `@shagi/platform`) — тонкая обёртка без адаптации. Может кинуть исключение
 * в приватном режиме с полным запретом хранения — это не Unavailable
 * (браузер честно ДАЁТ `localStorage` как объект, отказывает только на
 * вызове), поэтому каждый метод глотает исключение и ведёт себя как «ключа
 * нет»/«запись тихо не удалась»: выбор пользователя не переживёт такую
 * сессию, но и не роняет экран (M42, см. `Appearance.tsx`, `@shagi/app`).
 */
function createLocalPreferences(): LocalPreferencesPort {
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
        // См. заголовок функции — приватный режим без хранения.
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // См. заголовок функции.
      }
    },
  };
}

function createDeepLink(): DeepLinkPort {
  return {
    onLink(handler) {
      const listener = () => handler(window.location.hash);
      window.addEventListener('hashchange', listener);
      return () => window.removeEventListener('hashchange', listener);
    },
    async initialLink() {
      return window.location.hash === '' ? null : window.location.hash;
    },
  };
}

function createShare(): SharePort | Unavailable {
  if (!('share' in navigator)) {
    return unavailable('Web Share API недоступна в этом браузере');
  }
  return {
    async share(payload) {
      try {
        const files =
          payload.files?.map(
            // `Uint8Array.slice()` возвращает срез на собственном
            // `ArrayBuffer` (не `SharedArrayBuffer`) — ровно то, что просит
            // `BlobPart`; сам `file.bytes.buffer` этого не гарантирует.
            (file) => new File([file.bytes.slice()], file.name, { type: file.mime }),
          ) ?? [];
        // `exactOptionalPropertyTypes`: `title` у ShareData обязателен, если
        // задан — не может быть `undefined` явно, поэтому передаём объект
        // без ключа вовсе, когда заголовка нет.
        await navigator.share(
          payload.title === undefined
            ? { text: payload.text, files }
            : { title: payload.title, text: payload.text, files },
        );
        return 'shared';
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'share failed' };
      }
    },
  };
}

/**
 * SW обновляет себя в фоне; «установить» с точки зрения веба — это
 * перезагрузиться под уже готовым новым воркером (`skip-waiting`,
 * см. `public/sw.js`).
 */
function createUpdater(): UpdaterPort | Unavailable {
  if (!('serviceWorker' in navigator)) {
    return unavailable('Service worker недоступен в этом браузере');
  }
  return {
    async checkForUpdate() {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return null;
      await registration.update();
      // Веб не знает номер версии заранее (нет release-манифеста на клиенте,
      // сервера обновлений в R1a нет) — честный сигнал «есть новее» без
      // номера, а не выдуманная версия.
      return registration.waiting !== null ? 'pending' : null;
    },
    async installAndReload() {
      const registration = await navigator.serviceWorker.getRegistration();
      registration?.waiting?.postMessage('skip-waiting');
      window.location.reload();
    },
  };
}

export function createWebPlatform(): PlatformCapabilitiesRegistry {
  return {
    localDb: createLocalDb(),
    fileStore: unavailable('Вложения — R1b (SPEC/00 §10)'),
    secureCredentials: unavailable('Аккаунта и синка в R1a нет — нечего защищённо хранить'),
    notificationScheduler: createNotificationScheduler(),
    deepLink: createDeepLink(),
    share: createShare(),
    globalShortcut: unavailable('У веба нет доступа к системным хоткеям'),
    haptics: unavailable('Web Vibration API не входит в baseline (нестабильна/не везде)'),
    widget: unavailable('Виджетов на вебе не существует'),
    updater: createUpdater(),
    billing: unavailable('Веб-биллинг — через сервер, сервера в R1a нет'),
    pushHint: unavailable('R1 push не использует (SPEC/00 §4)'),
    networkStatus: createNetworkStatus(),
    calendarProvider: unavailable('Внешние календари — R1.1'),
    audioCapture: unavailable('Voice input — R3'),
    localPreferences: createLocalPreferences(),
  };
}
