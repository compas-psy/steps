/**
 * `@shagi/platform` — интерфейсы возможностей платформы (SPEC/00 §4):
 * `LocalDbPort`, `FileStorePort`, `NotificationSchedulerPort` и т.д.
 *
 * Только контракты портов. Реализации живут в платформенных оболочках
 * (`apps/web|desktop|mobile`, следующий пакет работ) — так домен и UI
 * (`@shagi/core`, `@shagi/app`) остаются одинаковыми на всех платформах,
 * различаются только реализации портов. Отсутствующая на платформе
 * возможность возвращает `null`/`unsupported`, а не заглушку молча.
 *
 * Механизм гарантирует, что код, пытающийся использовать возможность,
 * обязан разобрать оба случая: возможность есть или её нет. Забыть
 * проверку невозможно на уровне типов.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Temporal } from '@js-temporal/polyfill';

export const PACKAGE_NAME = '@shagi/platform' as const;

/**
 * Маркер недоступности возможности.
 *
 * Это не ошибка, не исключение, а честный ответ: «эта платформа
 * эту возможность не поддерживает». UI адаптируется — скрывает
 * действие или показывает пояснение (SPEC §1.3, §11.1).
 */
export interface Unavailable {
  readonly kind: 'unavailable';
  readonly reason?: string;
}

/**
 * Type guard для проверки доступности возможности.
 *
 * Используется вместо проверки `'kind' in capability` для более
 * читаемого и надёжного кода:
 *
 * ```ts
 * const reminder = platform.notificationScheduler;
 * if (isAvailable(reminder)) {
 *   await reminder.schedule(…);
 * }
 * ```
 */
export function isAvailable<T>(capability: T | Unavailable): capability is T {
  return typeof capability === 'object' && capability !== null && !('kind' in capability);
}

/**
 * `LocalDbPort` — интерфейс локального хранилища задач.
 *
 * На нативных платформах (Android, Windows, iOS, macOS) это SQLite с
 * поддержкой WAL, FTS5 и миграций. На Web это IndexedDB с адаптером,
 * обеспечивающим ту же семантику поиска (SPEC §2).
 *
 * React компоненты не обращаются к БД напрямую; это прерогатива repository
 * слоя (`@shagi/storage`). Порт существует, чтобы приложение могло
 * инициализировать хранилище в boot-последовательности.
 *
 * Поддержка: все платформы (обязательна).
 * Недоступность: тестовый режим, где сохранение отключено.
 */
export interface LocalDbPort {
  /**
   * Инициализировать или открыть локальное хранилище.
   * На нативе — открыть/создать БД. На Web — инициализировать IndexedDB.
   */
  initialize(): Promise<void>;

  /**
   * Закрыть соединение с БД — вызывается на выходе.
   */
  close(): Promise<void>;
}

/**
 * `FileStorePort` — интерфейс хранения файлов (вложений, импорта и т.д.).
 *
 * На Android это выбор папки через SAF; на Windows это каталог приложения;
 * на Web это OPFS или Blob. Реальные реализации различаются по гарантиям:
 * Atomic write (SAF с ограничениями), обычные гарантии ФС (Windows) или
 * браузерные (Web).
 *
 * Поддержка: все платформы (обязательна для хранения вложений).
 * Недоступность: не может быть на R1 — вложения приходят в R1b.
 */
export interface FileStorePort {
  /**
   * Прочитать содержимое файла.
   * @param path платформенный путь или URI
   * @returns содержимое файла
   */
  readFile(path: string): Promise<Uint8Array>;

  /**
   * Записать содержимое файла.
   * @param path платформенный путь или URI
   * @param data содержимое
   */
  writeFile(path: string, data: Uint8Array): Promise<void>;

  /**
   * Удалить файл.
   */
  deleteFile(path: string): Promise<void>;
}

/**
 * `SecureCredentialsPort` — интерфейс защищённого хранилища учётных данных.
 *
 * На Android это KeyStore + EncryptedSharedPreferences; на Windows это DPAPI;
 * на iOS это Keychain. На Web нет встроенного защищённого хранилища —
 * используется зашифрованная cookie или локальное хранилище (меньше гарантий).
 *
 * Используется для refresh-tokens, сессионных ключей, API-ключей.
 *
 * Поддержка: Android, Windows, iOS, macOS (обязательна).
 * Недоступность: некоторые конфигурации Web.
 */
export interface SecureCredentialsPort {
  /**
   * Сохранить значение в защищённое хранилище.
   * @param key уникальный ключ
   * @param value строковое значение
   */
  save(key: string, value: string): Promise<void>;

  /**
   * Прочитать значение из защищённого хранилища.
   * Если ключа нет, вернуть `null`.
   */
  read(key: string): Promise<string | null>;

  /**
   * Удалить значение.
   */
  delete(key: string): Promise<void>;
}

/**
 * `LocalPreferencesPort` — интерфейс персистентности пользовательских
 * настроек интерфейса (M42 Appearance и будущие настройки того же рода —
 * `12_SCREEN_STATE_MATRIX.md`, `00_MASTER_IMPLEMENTATION_TZ.md` §4).
 *
 * Это НЕ доменные данные (задачи/проекты) и не что-то, что синхронизируется
 * между устройствами — чисто локальный, платформенно-простой ключ-значение
 * (тема оформления, порог свёрнутости и т.п.), поэтому интерфейс тоньше
 * `SecureCredentialsPort`/`LocalDbPort`: ни шифрования, ни транзакций, ни
 * async — на всех трёх оболочках (`apps/web|desktop|mobile`, уже вебвью,
 * `navigator.onLine` тому доказательство для `networkStatus`) это синхронный
 * `localStorage`, не нужно притворяться, что чтение ключа — это I/O с
 * задержкой.
 *
 * Поддержка: все платформы (вебвью везде — `localStorage` доступен
 * одинаково).
 * Недоступность: тестовый режим (`createUnavailablePlatform`), окружения,
 * где `localStorage` заблокирован (приватный режим с полным запретом
 * хранения) — UI тогда просто не переживает выбор между запусками, не
 * ломается (см. `Appearance.tsx`, `packages/app`).
 */
export interface LocalPreferencesPort {
  /** Текущее значение ключа или `null`, если ничего не сохранено. */
  get(key: string): string | null;
  /** Записать значение ключа. */
  set(key: string, value: string): void;
  /** Удалить ключ (не используется M42, но часть честного контракта
   * ключ-значение — «сохранить»/«прочитать»/«удалить», не два из трёх). */
  remove(key: string): void;
}

/**
 * Точность планирования напоминания.
 *
 * Используется для различия между гарантиями, которые платформа может дать.
 */
export type NotificationPrecision = 'exact' | 'inexact' | 'no-guarantee';

/**
 * Снимок ОДНОГО реально запланированного на платформе уведомления —
 * `02§14` reconciliation (`@shagi/app`, `reminder-reconciliation.ts`)
 * сравнивает это (LIVE actual) с LIVE desired на каждый прогон, а не
 * держит собственное состояние "что было применено" (Task A6, третья и
 * финальная редакция дизайна — два отклонённых черновика разобраны в
 * бриф-файле `task-A6-brief.md`, здесь их выводы не повторяются).
 *
 * Платформенно-нейтральный тип (CLAUDE.md: `packages/platform` не знает
 * Tauri/web специфики) — каждый адаптер переводит СВОЙ DTO в эту форму:
 * Android — `PendingNotification` плагина `tauri-plugin-notification`
 * (Task B4, не эта задача), Web — собственная `Map` таймеров
 * (`apps/web/src/platform.ts`, эта задача).
 *
 * Нет `body`: у `NotificationSchedulerPort.schedule` нет параметра `body`,
 * нести в снимке нечего — не забыли, а осознанно не добавили.
 */
export interface ScheduledNotificationSnapshot {
  /** Тот же `id`, что передавался в `schedule()` — `Reminder.id`. */
  readonly reminderId: string;
  /** Заголовок, реально осевший в системном уведомлении на платформе —
   * сравнивается с ЖИВЫМ заголовком задачи (не с синхронизируемым
   * снимком, см. `computeReminderFingerprint`), чтобы обнаружить
   * переименование задачи ПОСЛЕ того, как напоминание уже запланировано. */
  readonly title: string;
  /** Момент срабатывания, materialized в ABSOLUTE `Instant` — сравнивается
   * с моментом, заново разрешённым из `firesAt` в ТЕКУЩЕЙ таймзоне
   * устройства, чтобы обнаружить дрейф после смены пояса (`01§19`). */
  readonly scheduledAt: Temporal.Instant;
  readonly precision?: NotificationPrecision;
}

/**
 * `NotificationSchedulerPort` — интерфейс планирования уведомлений/напоминаний.
 *
 * Это именно планирование (запрос к ОС сработать в определённое время),
 * а не просто push. На Android это AlarmManager/ExactAlarmManager; на Windows
 * это Windows Task Scheduler или фоновые задачи; на iOS это UserNotifications.
 * На Web гарантий нет: браузер может не быть открыт в момент напоминания.
 *
 * Ключевое требование (SPEC §11.1): если платформа не может гарантировать
 * точное время (например, Android без точного будильника) или вообще доставку
 * (Web), UI **должна** сказать об этом. Никаких заглушек и подделок.
 *
 * Время передаётся как плавающее локальное (PlainDate + PlainTime по SPEC §5):
 * после смены таймзоны пользователем приложение пересчитывает расписание,
 * сохраняя смысл «09:00 по местному». Тип Temporal требуется (`Date` запрещён
 * в доменной логике).
 *
 * Поддержка: Android (с проверкой точности), Windows ('exact'), iOS ('exact'),
 * macOS ('exact'), Web ('no-guarantee').
 */
export interface NotificationSchedulerPort {
  /**
   * Запланировать уведомление.
   * @param id уникальный идентификатор напоминания
   * @param title текст уведомления — уходит в системное уведомление,
   *              но не логируется и не отправляется в телеметрию (SPEC §5.6)
   * @param date дата в плавающем локальном времени (PlainDate)
   * @param time время в плавающем локальном времени (PlainTime),
   *             может быть null если напоминание на весь день
   * @param timezone IANA-зона для материализации момента
   *                 (используется при смене таймзоны для пересчёта)
   * @param precision требуемая точность — для того, чтобы UI предупредила
   *                  о пониженной доступности ('inexact' на Android без exact alarm,
   *                  'no-guarantee' на Web)
   */
  schedule(
    id: string,
    title: string,
    date: Temporal.PlainDate,
    time: Temporal.PlainTime | null,
    timezone: string,
    precision?: NotificationPrecision,
  ): Promise<void>;

  /**
   * Отменить запланированное уведомление.
   */
  cancel(id: string): Promise<void>;

  /**
   * Снимки ВСЕХ реально запланированных на этой платформе уведомлений прямо
   * сейчас — основа reconciliation (`02§14`). До Task A6 это были голые
   * `id` (сравнение только по присутствию), но id-presence слеп к дрейфу
   * СОДЕРЖИМОГО: переименование задачи (заголовок живёт на `Task`, не на
   * `Reminder`) и смена таймзоны устройства (тот же `firesAt` разрешается в
   * другой абсолютный момент) меняют то, что ДОЛЖНО быть запланировано, не
   * трогая ни `id`, ни `enabled` — вызывающий код (`applyReconciliation`,
   * `@shagi/app`) теперь сравнивает `title`/`scheduledAt` каждого снимка с
   * заново вычисленным желаемым состоянием на каждый прогон и решает, что
   * досоздать (в том числе заменить устаревшее содержимое), а что отменить.
   * Порядок не гарантирован.
   */
  listScheduled(): Promise<readonly ScheduledNotificationSnapshot[]>;

  /**
   * Проверить возможности точного планирования на этой платформе.
   *
   * Результат определяет, что UI показывает пользователю:
   *   'exact' — точное планирование доступно, UI может обещать точное время
   *   'inexact' — доступно только неточное, UI предупредит о погрешности
   *   'no-guarantee' — доставка не гарантирована вообще (Web: браузер может
   *                    быть закрыт), UI должна явно сказать об этом
   */
  getSchedulingCapability(): Promise<NotificationPrecision>;
}

/**
 * `DeepLinkPort` — интерфейс обработки глубоких ссылок.
 *
 * На нативе это intent/URL scheme; на Web это fragment routing.
 * Приложение регистрирует обработчик и получает контрольные события
 * при открытии ссылки — как холодного старта, так и горячей подписки.
 *
 * Поддержка: все платформы.
 * Недоступность: несистемные браузеры, где нет контроля над схемой.
 */
export interface DeepLinkPort {
  /**
   * Подписаться на события глубоких ссылок.
   * @param handler функция, вызываемая при получении ссылки
   * @returns функция отписки
   */
  onLink(handler: (url: string) => void): () => void;

  /**
   * Предпол. URL для холодного старта (если приложение было закрыто).
   * Может быть `null`, если старт был без ссылки.
   */
  initialLink(): Promise<string | null>;
}

/**
 * `SharePort` — интерфейс поделиться контентом с системой.
 *
 * На Android это ACTION_SEND в системный selector; на Windows это
 * обычное копирование в clipboard; на iOS это UIActivityViewController.
 * На Web нет встроенного — можно использовать Web Share API, если браузер поддерживает.
 *
 * Поддержка: Android, Windows, iOS (обязательна).
 * Недоступность: старые версии Android, несовременные браузеры.
 */
export interface SharePort {
  /**
   * Поделиться контентом.
   * @param payload текст, заголовок, файлы
   * @returns результат (shared, copied, или ошибка)
   */
  share(payload: {
    title?: string;
    text: string;
    files?: readonly { name: string; mime: string; bytes: Uint8Array }[];
  }): Promise<'shared' | 'copied' | { error: string }>;
}

/**
 * `GlobalShortcutPort` — интерфейс глобального хоткея (Command Palette и т.д.).
 *
 * На Windows/macOS это регистрация глобального сочетания клавиш, которое
 * срабатывает, даже если окно приложения не в фокусе. На Android это
 * невозможно — эквивалент это плитка Quick Settings или виджет 1×1.
 * На Web нет доступа к системным хоткеям.
 *
 * Поддержка: Windows, macOS.
 * Недоступность: Android, Web.
 */
export interface GlobalShortcutPort {
  /**
   * Зарегистрировать глобальный хоткей.
   * @param accelerator строка типа "Ctrl+Shift+Space"
   * @param handler функция, вызываемая при нажатии
   * @returns функция отписки
   */
  register(accelerator: string, handler: () => void): () => void;

  /**
   * Проверить, может ли эта платформа регистрировать глобальные хоткеи.
   */
  isSupported(): boolean;
}

/**
 * `HapticsPort` — интерфейс вибрации (тактильная обратная связь).
 *
 * На Android это Vibrator API; на iOS это UIImpactFeedbackGenerator.
 * На Windows и Web нет встроенной поддержки (разве что Web Haptics API,
 * но это редко и экспериментально).
 *
 * Поддержка: Android, iOS.
 * Недоступность: Windows, Web, устройства без вибромотора.
 */
export interface HapticsPort {
  /**
   * Короткая вибрация (например, при нажатии кнопки).
   */
  light(): Promise<void>;

  /**
   * Средняя вибрация.
   */
  medium(): Promise<void>;

  /**
   * Длительная вибрация.
   */
  heavy(): Promise<void>;
}

/**
 * `WidgetPort` — интерфейс виджетов приложения (на главном экране).
 *
 * На Android это AppWidgetManager с layout-файлами; на Windows это
 * tiles в App Center. На iOS/macOS/Web нет встроенного эквивалента
 * (Live Activities и Dynamic Island это другое).
 *
 * Поддержка: Android (R1b), Windows (future).
 * Недоступность: iOS, macOS, Web.
 */
export interface WidgetPort {
  /**
   * Обновить виджеты (например, после завершения задачи или изменения фокуса).
   */
  refresh(): Promise<void>;
}

/**
 * `UpdaterPort` — интерфейс проверки и установки обновлений.
 *
 * На нативе это платформенные API (Google Play, Windows Store, App Store).
 * На Web это просто перезагрузка страницы (Service Worker обновляет себя в фоне).
 * Tauri на мобилке не работает, поэтому Android требует свой updater.
 *
 * Поддержка: все платформы.
 * Недоставляемые гарантии: Web не может гарантировать, что пользователь
 * получит обновление через магазин.
 */
export interface UpdaterPort {
  /**
   * Проверить наличие обновления.
   * @returns версия доступного обновления или `null`, если обновлений нет
   */
  checkForUpdate(): Promise<string | null>;

  /**
   * Установить и перезагрузить (на нативе попросить магазин; на Web
   * срабатывает Service Worker, на следующий запуск будет новая версия).
   */
  installAndReload(): Promise<void>;
}

/**
 * `BillingPort` — интерфейс работы с покупками и подписками.
 *
 * На Android это Google Play Billing; на iOS это StoreKit2; на Windows это
 * Microsoft Store billing. На Web нет встроенного — используется Stripe/Paddle.
 *
 * Поддержка: нативные платформы обязательно используют магазин; Web
 * использует собственный бэкенд.
 * Недоступность: Web (для пользователя — через сервер).
 */
export interface BillingPort {
  /**
   * Запросить информацию о доступных SKU (продуктах).
   */
  getProducts(): Promise<Array<{ id: string; price: string; currency: string }>>;

  /**
   * Начать покупку.
   * @param productId SKU в магазине
   */
  purchase(productId: string): Promise<{ success: boolean; error?: string }>;
}

/**
 * `PushHintPort` — интерфейс push-уведомлений от сервера.
 *
 * Это не локальные напоминания, а сообщения с облака (синхронизация,
 * совместное редактирование, оповещение о комментариях и т.д.).
 * На нативе это FCM (Google Cloud Messaging); на Web это Web Push.
 *
 * R1 это не использует, но архитектура должна это позволить (R1.3).
 *
 * Поддержка: все платформы (в R1 неактивна).
 * Недоступность: отключено в конфигурации, браузер без Web Push.
 */
export interface PushHintPort {
  /**
   * Зарегистрировать устройство для получения push'ей.
   * @returns токен для отправки на сервер
   */
  requestToken(): Promise<string | null>;

  /**
   * Подписаться на получение push'ей.
   * @param handler функция, вызываемая при получении сообщения
   * @returns функция отписки
   */
  onMessage(handler: (payload: Record<string, unknown>) => void): () => void;
}

/**
 * `NetworkStatusPort` — интерфейс мониторинга состояния сети.
 *
 * Приложение использует это, чтобы показать UI состояние (offline/online),
 * не ретраить операции в фоне, когда сети нет.
 *
 * Поддержка: все платформы (обязательна для offline-first архитектуры).
 * Недоставляемая гарантия: определение «online» — это не то же самое, что
 * доступность сервера. Сеть может быть, но вход запрещён или маршрут упал.
 */
export interface NetworkStatusPort {
  /**
   * Текущее состояние сети.
   * @returns `true` если есть сеть, `false` если нет
   */
  isOnline(): boolean;

  /**
   * Подписаться на изменения состояния сети.
   * @returns функция отписки
   */
  onChange(handler: (isOnline: boolean) => void): () => void;
}

/**
 * `CalendarProviderPort` — интерфейс доступа к системным календарям.
 *
 * R1.1 (Planning) интегрирует внешние календари: просмотр занятости,
 * создание событий из задач, синхронизация. На нативе это EventKit (iOS) и
 * CalendarContract (Android). На Windows это Outlook COM или REST API. На Web
 * это OAuth к Google Calendar, Outlook Calendar и т.д.
 *
 * Поддержка: iOS, Android (R1.1+), Windows (future).
 * Недоступность: старые версии Android без доступа к календарю, Web без OAuth.
 */
export interface CalendarProviderPort {
  /**
   * Запросить доступ к календарям.
   * На нативе это системный диалог; на Web это OAuth.
   * @returns `true` если доступ получен, `false` если отказано
   */
  requestAccess(): Promise<boolean>;

  /**
   * Получить список доступных календарей.
   */
  listCalendars(): Promise<Array<{ id: string; name: string }>>;

  /**
   * Создать событие в календаре.
   */
  createEvent(
    calendarId: string,
    event: {
      title: string;
      startTime: string;
      endTime: string;
      description?: string;
    },
  ): Promise<void>;
}

/**
 * `AudioCapturePort` — интерфейс захвата аудио (микрофон).
 *
 * R3 (Vector) использует это для Voice Input — это отправить голосовую
 * команду вместо текста в Quick Add или поиск. На нативе это AudioRecord (Android)
 * и AVAudioEngine (iOS). На Web это Web Audio API.
 *
 * Требует явного разрешения пользователя (just-in-time, не на старте).
 *
 * Поддержка: все платформы (в R3).
 * Недоступность: пользователь отказал в доступе, гарнитура не подключена,
 * браузер без Web Audio.
 */
export interface AudioCapturePort {
  /**
   * Запросить разрешение на доступ к микрофону.
   * @returns `true` если разрешено, `false` если отказано/ошибка
   */
  requestPermission(): Promise<boolean>;

  /**
   * Начать захват аудио.
   * @param onChunk вызывается по мере получения аудиоданных
   * @returns функция остановки захвата
   */
  startCapture(onChunk: (audio: Uint8Array) => void): Promise<() => Promise<void>>;
}

/**
 * Реестр возможностей платформы.
 *
 * Это единственное место, где вызывающий код разбирает, доступна ли
 * возможность. Результат — либо сама возможность (порт), либо объект
 * `Unavailable`, и на уровне типов забыть проверку невозможно.
 *
 * Пример:
 * ```ts
 * const registry = platform.capabilities();
 * const reminder = registry.notificationScheduler;
 *
 * if (isAvailable(reminder)) {
 *   // reminder типизирован как NotificationSchedulerPort
 *   const capability = await reminder.getSchedulingCapability();
 *   if (capability === 'no-guarantee') {
 *     // UI должна предупредить пользователя
 *   }
 *   await reminder.schedule(
 *     'task-123',
 *     'Завтра в 09:00',
 *     plannedDate,
 *     plannedTime,
 *     'Europe/Moscow',
 *   );
 * } else {
 *   // Напоминания недоступны — UI скроет кнопку
 * }
 * ```
 */
export interface PlatformCapabilitiesRegistry {
  readonly localDb: LocalDbPort | Unavailable;
  readonly fileStore: FileStorePort | Unavailable;
  readonly secureCredentials: SecureCredentialsPort | Unavailable;
  readonly notificationScheduler: NotificationSchedulerPort | Unavailable;
  readonly deepLink: DeepLinkPort | Unavailable;
  readonly share: SharePort | Unavailable;
  readonly globalShortcut: GlobalShortcutPort | Unavailable;
  readonly haptics: HapticsPort | Unavailable;
  readonly widget: WidgetPort | Unavailable;
  readonly updater: UpdaterPort | Unavailable;
  readonly billing: BillingPort | Unavailable;
  readonly pushHint: PushHintPort | Unavailable;
  readonly networkStatus: NetworkStatusPort | Unavailable;
  readonly calendarProvider: CalendarProviderPort | Unavailable;
  readonly audioCapture: AudioCapturePort | Unavailable;
  readonly localPreferences: LocalPreferencesPort | Unavailable;
}

/**
 * Нулевая реализация платформы.
 *
 * Используется в двух случаях:
 *   1. В тестах, когда нужно проверить поведение домена без конкретной платформы.
 *   2. В Web-сборке для окружений, где некоторые возможности недоступны.
 *
 * Ключевое свойство: нулевая реализация **не молчит и не подделывает успех**.
 * Каждый метод честно отвечает: «эта возможность здесь недоступна».
 *
 * Пример: `initialize()` в нулевом LocalDbPort не просто возвращает `undefined`,
 * он отказывает уже на уровне типов (он возвращает Unavailable, а не порт).
 * Если вызывающий код забудет проверить, TypeScript не даст скомпилироваться.
 *
 * @returns реестр, где все возможности помечены как недоступные
 */
export function createUnavailablePlatform(): PlatformCapabilitiesRegistry {
  const unavailable: Unavailable = {
    kind: 'unavailable',
    reason: 'Capability not available on this platform or in this environment',
  };

  return {
    localDb: unavailable,
    fileStore: unavailable,
    secureCredentials: unavailable,
    notificationScheduler: unavailable,
    deepLink: unavailable,
    share: unavailable,
    globalShortcut: unavailable,
    haptics: unavailable,
    widget: unavailable,
    updater: unavailable,
    billing: unavailable,
    pushHint: unavailable,
    networkStatus: unavailable,
    calendarProvider: unavailable,
    audioCapture: unavailable,
    localPreferences: unavailable,
  };
}
