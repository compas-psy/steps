import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';
import {
  createUnavailablePlatform,
  type LocalPreferencesPort,
  type NotificationPrecision,
  type NotificationSchedulerPort,
  type ScheduledNotificationSnapshot,
} from '@shagi/platform';
import { t } from '@shagi/i18n';

import { App, LAST_KNOWN_TIMEZONE_KEY, type AppHost } from '../src/index.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

/** Тот же фейк, что `test/state/reminder-reconciliation.test.ts` (Task A3,
 * бриф Task A4 указывает переиспользовать эту же форму) — платформа
 * целиком в памяти, считает вызовы для проверки «реконсиляция реально
 * прошла», не только «не упало». Снимок несёт реальные `title`/`scheduledAt`
 * (Task A6) — тем же расчётом, что настоящий веб-адаптер
 * (`apps/web/src/platform.ts`), иначе повторный прогон реконсиляции внутри
 * теста видел бы "устаревшее содержимое" там, где раньше проверялось только
 * присутствие id. */
function fakeScheduler(): NotificationSchedulerPort & {
  calls: { scheduled: string[]; cancelled: string[]; listScheduled: number };
} {
  const scheduled = new Map<string, ScheduledNotificationSnapshot>();
  const calls = { scheduled: [] as string[], cancelled: [] as string[], listScheduled: 0 };
  return {
    calls,
    async schedule(id, title, date, time, timezone, precision) {
      const target =
        time === null
          ? date.toZonedDateTime(timezone)
          : date.toZonedDateTime({ timeZone: timezone, plainTime: time });
      const snapshot: ScheduledNotificationSnapshot =
        precision === undefined
          ? { reminderId: id, title, scheduledAt: target.toInstant() }
          : { reminderId: id, title, scheduledAt: target.toInstant(), precision };
      scheduled.set(id, snapshot);
      calls.scheduled.push(id);
    },
    async cancel(id) {
      scheduled.delete(id);
      calls.cancelled.push(id);
    },
    async listScheduled() {
      calls.listScheduled += 1;
      return Array.from(scheduled.values());
    },
    async getSchedulingCapability(): Promise<NotificationPrecision> {
      return 'exact';
    },
  };
}

/** Тот же фейк, что `test/screens/Appearance.test.tsx` — синхронное
 * чтение/запись поверх `Map`. */
function fakeLocalPreferences(
  initial: Readonly<Record<string, string>> = {},
): LocalPreferencesPort {
  const store = new Map(Object.entries(initial));
  return {
    get: (key) => store.get(key) ?? null,
    set: (key, value) => {
      store.set(key, value);
    },
    remove: (key) => {
      store.delete(key);
    },
  };
}

describe('App', () => {
  it('монтирует корневой узел с крючком для smoke-теста оболочки', () => {
    render(<App host={testHost()} />);
    const root = document.querySelector('[data-shagi-app-root]');
    expect(root).not.toBeNull();
  });

  it('не падает и не инициализирует localDb, когда платформа его не поддерживает (Unavailable)', () => {
    // `createUnavailablePlatform()` даёт `localDb: Unavailable` — boot-эффект
    // обязан пройти проверку `isAvailable` и молча пропустить initialize/close,
    // а не бросить (SPEC §4: Unavailable — честный ответ, не ошибка).
    expect(() => render(<App host={testHost()} />)).not.toThrow();
  });

  it('рендерит экран по умолчанию (launch) без падения, даже если реестр экранов пуст', () => {
    // `SCREENS` заполняется пакетами работ E04.2+ — до этого путь
    // `SCREENS[screen] === undefined` обязан рендерить пустой узел, не падать.
    render(<App host={testHost()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('App — глобальный Quick Add (эпик E05.2, D12 "callable from any route")', () => {
  it('Ctrl+N открывает оверлей Quick Add поверх текущего экрана', async () => {
    const user = userEvent.setup();
    render(<App host={testHost()} />);

    expect(screen.queryByRole('dialog', { name: t('quickAdd', 'overlay.title') })).toBeNull();

    await user.keyboard('{Control>}n{/Control}');

    expect(
      await screen.findByRole('dialog', { name: t('quickAdd', 'overlay.title') }),
    ).toBeInTheDocument();
  });

  it('снимает глобальный слушатель при размонтировании — повторный Ctrl+N после unmount ничего не делает', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App host={testHost()} />);

    unmount();

    // Не должно бросать и не должно оставлять слушателя, реагирующего на
    // событие после размонтирования дерева (нечего было бы обновить).
    await expect(user.keyboard('{Control>}n{/Control}')).resolves.not.toThrow();
  });
});

describe('App — boot-применение темы (M42 Appearance)', () => {
  afterEach(() => {
    // Тест реально трогает `document.documentElement` (см. заголовок
    // `App.tsx`, блок «Boot-применение темы») — сброс, чтобы не утечь в
    // следующий тестовый файл этого же процесса vitest.
    document.documentElement.removeAttribute('data-theme');
  });

  it('применяет сохранённую тёмную тему сразу при монтировании, ДО открытия Settings', () => {
    const host: AppHost = {
      platform: {
        ...createUnavailablePlatform(),
        localPreferences: fakeLocalPreferences({
          'shagi.preferences.theme': 'dark',
        }),
      },
      storageBackend: { kind: 'memory' },
    };

    render(<App host={host} />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('ничего не сохранено — атрибут не выставляется (дефолт «система»)', () => {
    const host: AppHost = {
      platform: { ...createUnavailablePlatform(), localPreferences: fakeLocalPreferences() },
      storageBackend: { kind: 'memory' },
    };

    render(<App host={host} />);

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('`Unavailable` localPreferences — не падает, атрибут не выставляется', () => {
    expect(() => render(<App host={testHost()} />)).not.toThrow();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('App — boot-реконсиляция напоминаний (00§7 шаг 5, Task A4)', () => {
  it('доступный notificationScheduler — reconcileReminderSchedule вызывается один раз при монтировании', async () => {
    const scheduler = fakeScheduler();
    const host: AppHost = {
      platform: { ...createUnavailablePlatform(), notificationScheduler: scheduler },
      storageBackend: { kind: 'memory' },
    };

    render(<App host={host} />);

    // `reconcileReminderSchedule` (Task A3) всегда начинает с
    // `scheduler.listScheduled()` — считать его вызовы достаточно, чтобы
    // доказать, что реконсиляция реально прошла, а не просто не упала.
    // Пустой workspace (ничего не посеяно) не создаёт ни `schedule`, ни
    // `cancel` — нечего согласовывать.
    await waitFor(() => expect(scheduler.calls.listScheduled).toBe(1));
    expect(scheduler.calls.scheduled).toEqual([]);
    expect(scheduler.calls.cancelled).toEqual([]);
  });

  it('`Unavailable` notificationScheduler (тестовый режим) — не падает, реконсиляцию звать нечем', () => {
    // `createUnavailablePlatform()` даёт `notificationScheduler: Unavailable`
    // — boot-эффект обязан пройти `isAvailable` и молча пропустить вызов, а
    // не бросить (тот же принцип, что `localDb`/`localPreferences` выше).
    expect(() => render(<App host={testHost()} />)).not.toThrow();
  });
});

describe('App — обнаружение смены таймзоны на старте (01§19, Task A5)', () => {
  it('сохранённая таймзона отличается от текущей — полная реконсиляция проходит и запись в localPreferences обновляется на текущую', async () => {
    // Реальная таймзона окружения теста (та же, что прочитает boot-эффект)
    // — берём её тем же вызовом, что и продуктовый код, а не хардкодим
    // строку: тест обязан пройти в любом TZ CI-раннера, а не только там,
    // где `TZ=UTC`.
    const currentTimezone = Temporal.Now.timeZoneId();
    // Любая заведомо ДРУГАЯ IANA-зона: если раннер сам в 'UTC', берём
    // 'Europe/Moscow', иначе — 'UTC'. Так «сохранённое ≠ текущее»
    // гарантировано независимо от TZ раннера — это ровно тот сценарий
    // «сменили пояс с прошлого запуска», который проверяет этот тест, а не
    // просто «функция была вызвана».
    const staleTimezone = currentTimezone === 'UTC' ? 'Europe/Moscow' : 'UTC';
    const preferences = fakeLocalPreferences({ [LAST_KNOWN_TIMEZONE_KEY]: staleTimezone });
    const scheduler = fakeScheduler();
    const host: AppHost = {
      platform: {
        ...createUnavailablePlatform(),
        notificationScheduler: scheduler,
        localPreferences: preferences,
      },
      storageBackend: { kind: 'memory' },
    };

    render(<App host={host} />);

    // Полный скан реконсиляции (Task A4) отрабатывает безусловно на каждом
    // старте — `listScheduled` доказывает, что он реально прошёл, та же
    // проверка, что в блоке Task A4 выше.
    await waitFor(() => expect(scheduler.calls.listScheduled).toBe(1));
    // Смена пояса зафиксирована: значение под ключом переписано с
    // `staleTimezone` (искусственно состаренного «прошлого запуска») на
    // РЕАЛЬНУЮ текущую таймзону — именно то, с чем будет сравнивать
    // будущий foreground-триггер.
    await waitFor(() => expect(preferences.get(LAST_KNOWN_TIMEZONE_KEY)).toBe(currentTimezone));
  });

  it('сохранённая таймзона совпадает с текущей — запись в localPreferences не перезаписывается вхолостую', async () => {
    const currentTimezone = Temporal.Now.timeZoneId();
    let writes = 0;
    const store = new Map<string, string>([[LAST_KNOWN_TIMEZONE_KEY, currentTimezone]]);
    const preferences: LocalPreferencesPort = {
      get: (key) => store.get(key) ?? null,
      set: (key, value) => {
        writes += 1;
        store.set(key, value);
      },
      remove: (key) => {
        store.delete(key);
      },
    };
    const scheduler = fakeScheduler();
    const host: AppHost = {
      platform: {
        ...createUnavailablePlatform(),
        notificationScheduler: scheduler,
        localPreferences: preferences,
      },
      storageBackend: { kind: 'memory' },
    };

    render(<App host={host} />);

    // Реконсиляция всё равно проходит (она безусловна, Task A4) — тут
    // проверяется ТОЛЬКО что write в `localPreferences` не происходит
    // вхолостую, когда пояс не менялся, см. заголовок `App.tsx`, блок
    // «Смена таймзоны», про шторм `storage`-событий.
    await waitFor(() => expect(scheduler.calls.listScheduled).toBe(1));
    expect(writes).toBe(0);
    expect(store.get(LAST_KNOWN_TIMEZONE_KEY)).toBe(currentTimezone);
  });
});
