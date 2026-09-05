// eslint-disable-next-line import/no-unassigned-import -- побочный эффект: регистрирует indexedDB в globalThis, присваивать нечего
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Temporal } from '@js-temporal/polyfill';
import {
  createUnavailablePlatform,
  type NotificationPrecision,
  type NotificationSchedulerPort,
  type PlatformCapabilitiesRegistry,
  type ScheduledNotificationSnapshot,
} from '@shagi/platform';
import { t } from '@shagi/i18n';

import type { AppHost } from '../../src/App.js';
import { AppProvider } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { DataPrivacy } from '../../src/screens/DataPrivacy.js';
import { ONBOARDING_DONE_KEY } from '../../src/state/onboarding.js';
import type { StorageBackend } from '../../src/state/storage-backend.js';

/** Тот же фейк, что `test/screens/TaskDetail.test.tsx`/`ProjectDetail.test.tsx`
 * (Task A3/A4) — `initialScheduled` имитирует alarm, реально осевший на
 * платформе ДО стирания (Task B5: `eraseAllLocalData()` чистит только
 * SQLite/IndexedDB, платформенный scheduler — отдельная память, о которой
 * `storage` ничего не знает). */
function fakeScheduler(initialScheduled: readonly string[] = []): NotificationSchedulerPort & {
  calls: { scheduled: string[]; cancelled: string[] };
} {
  const scheduled = new Map<string, ScheduledNotificationSnapshot>(
    initialScheduled.map((id) => [
      id,
      { reminderId: id, title: '', scheduledAt: Temporal.Instant.fromEpochMilliseconds(0) },
    ]),
  );
  const calls = { scheduled: [] as string[], cancelled: [] as string[] };
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
      return Array.from(scheduled.values());
    },
    async getSchedulingCapability(): Promise<NotificationPrecision> {
      return 'exact';
    },
  };
}

function testHost(storageBackend: StorageBackend): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend };
}

/**
 * `AppProvider` строит НАСТОЯЩЕЕ хранилище из `host.storageBackend` ещё до
 * того, как экран отрисуется, поэтому вариант `indexeddb` нельзя изобразить
 * пустышкой — без полифила выше тест падал бы на `indexedDB is not defined`
 * и ничего не проверял. Тот же приём и тот же полифил, что в
 * `packages/storage/test/indexeddb/support/create-test-storage.ts`.
 */
const MEMORY: StorageBackend = { kind: 'memory' };
const INDEXEDDB: StorageBackend = { kind: 'indexeddb', databaseName: 'shagi-test' };

describe('DataPrivacy (M51)', () => {
  it('говорит про хранение ПРАВДУ для оболочки без персистентности', () => {
    render(
      <AppProvider host={testHost(MEMORY)}>
        <DataPrivacy />
      </AppProvider>,
    );

    expect(screen.getByText(t('settings', 'dataPrivacy.storage.memory.badge'))).toBeInTheDocument();
    expect(
      screen.getByText(t('settings', 'dataPrivacy.storage.memory.description')),
    ).toBeInTheDocument();
    // Обратное утверждение — не украшение теста: если экран начнёт обещать
    // сохранность там, где её нет (`apps/mobile` сегодня именно такова),
    // человек решит, что продукт теряет его задачи по ошибке.
    expect(
      screen.queryByText(t('settings', 'dataPrivacy.storage.local.badge')),
    ).not.toBeInTheDocument();
  });

  it('для постоянного хранилища говорит про него, а не про память', () => {
    render(
      <AppProvider host={testHost(INDEXEDDB)}>
        <DataPrivacy />
      </AppProvider>,
    );

    expect(screen.getByText(t('settings', 'dataPrivacy.storage.local.badge'))).toBeInTheDocument();
    expect(
      screen.queryByText(t('settings', 'dataPrivacy.storage.memory.badge')),
    ).not.toBeInTheDocument();
  });

  it('сообщает, что аналитика и отчёты о сбоях не собираются', () => {
    render(
      <AppProvider host={testHost(INDEXEDDB)}>
        <DataPrivacy />
      </AppProvider>,
    );

    expect(screen.getByText(t('settings', 'dataPrivacy.analytics.badge'))).toBeInTheDocument();
    expect(screen.getByText(t('settings', 'dataPrivacy.crashes.badge'))).toBeInTheDocument();
  });

  it('удаление данных требует подтверждения и прямо говорит, что восстановить неоткуда', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider host={testHost(MEMORY)}>
        <DataPrivacy />
      </AppProvider>,
    );

    // Сама строка НЕ стирает ничего — §13 `05_SECURITY_PRIVACY_LEGAL.md`
    // требует подтверждения.
    await user.click(
      screen.getByRole('button', { name: t('settings', 'dataPrivacy.erase.action') }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Предупреждение обязано быть именно про отсутствие облачной копии, а
    // не абстрактное «действие необратимо».
    expect(screen.getByText(t('settings', 'dataPrivacy.erase.warning'))).toBeInTheDocument();
  });

  it('подтверждение действительно стирает хранилище и уводит на первый экран', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'dataPrivacy' });
    const host = testHost(MEMORY);
    render(
      <AppProvider host={host} controller={controller}>
        <DataPrivacy />
      </AppProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: t('settings', 'dataPrivacy.erase.action') }),
    );
    await user.click(
      screen.getByRole('button', { name: t('settings', 'dataPrivacy.erase.confirm') }),
    );

    // Проверяется не «диалог закрылся», а что экран увёл человека туда, куда
    // он попал бы на новом устройстве: оставаться на настройках поверх
    // пустого хранилища значило бы показывать состояние, которого нет.
    await waitFor(() => {
      expect(controller.getState().screen).toBe('welcome');
    });
  });

  it('удаление снимает и флаг «онбординг пройден» — следующий запуск как на новом устройстве', async () => {
    const user = userEvent.setup();
    const store = new Map<string, string>([[ONBOARDING_DONE_KEY, '1']]);
    const platform: PlatformCapabilitiesRegistry = {
      ...createUnavailablePlatform(),
      localPreferences: {
        get: (key) => store.get(key) ?? null,
        set: (key, value) => void store.set(key, value),
        remove: (key) => void store.delete(key),
      },
    };
    const controller = createAppController({ screen: 'dataPrivacy' });
    render(
      <AppProvider host={{ platform, storageBackend: MEMORY }} controller={controller}>
        <DataPrivacy />
      </AppProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: t('settings', 'dataPrivacy.erase.action') }),
    );
    await user.click(
      screen.getByRole('button', { name: t('settings', 'dataPrivacy.erase.confirm') }),
    );

    // Иначе человек после стирания попал бы в пустой продукт вместо
    // приветствия: данных нет, а признак «всё уже видел» остался.
    await waitFor(() => expect(store.has(ONBOARDING_DONE_KEY)).toBe(false));
  });

  it('стирание отменяет ВСЕ запланированные напоминания в scheduler (M52, Task B5 — путь #6)', async () => {
    // `eraseAllLocalData()` чистит только SQLite/IndexedDB — платформенный
    // native alarm запланирован в ДРУГОЙ памяти (`NotificationSchedulerPort`,
    // Android `TimedNotificationPublisher`), о которой `storage` ничего не
    // знает. Без явного полного скана после стирания эти alarm'ы остались бы
    // висеть навсегда и сработали бы со СТАРЫМ (уже стёртым) содержимым —
    // ровно риск, который B5 обязан закрыть, не задокументировать.
    const user = userEvent.setup();
    const scheduler = fakeScheduler(['orphan-reminder-1', 'orphan-reminder-2']);
    const host: AppHost = {
      platform: { ...createUnavailablePlatform(), notificationScheduler: scheduler },
      storageBackend: { kind: 'memory' },
    };
    render(
      <AppProvider host={host}>
        <DataPrivacy />
      </AppProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: t('settings', 'dataPrivacy.erase.action') }),
    );
    await user.click(
      screen.getByRole('button', { name: t('settings', 'dataPrivacy.erase.confirm') }),
    );

    await waitFor(() =>
      expect(scheduler.calls.cancelled.toSorted()).toEqual([
        'orphan-reminder-1',
        'orphan-reminder-2',
      ]),
    );
  });

  it('отмена в диалоге ничего не стирает', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'dataPrivacy' });
    render(
      <AppProvider host={testHost(MEMORY)} controller={controller}>
        <DataPrivacy />
      </AppProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: t('settings', 'dataPrivacy.erase.action') }),
    );
    await user.click(
      screen.getByRole('button', { name: t('settings', 'dataPrivacy.erase.cancel') }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(controller.getState().screen).toBe('dataPrivacy');
  });

  it('не рисует ни одного нерабочего действия: только «Назад» и ни одного тумблера', () => {
    render(
      <AppProvider host={testHost(INDEXEDDB)}>
        <DataPrivacy />
      </AppProvider>,
    );

    // Тумблер согласия и «Удалить аккаунт» из макета M51 в R1 не
    // реализованы или запрещены (см. заголовок `DataPrivacy.tsx`). Пока их
    // нет — их не должно быть и на экране: тест обязан покраснеть на первой
    // же строке, дописанной «чтобы было как в макете».
    //
    // Кнопок ровно шесть, и каждая ведёт к работающему действию: «Назад»,
    // «Импортировать» (M46), «Открыть» экспорт (M49), два юридических
    // документа (`05§14`, шаг 4 критического пути) и «Удалить». Экспорт и
    // импорт добавлены пакетом работ M46–M49, документы — шагом 4; до
    // своих пакетов работ ни тех, ни других здесь не было именно потому,
    // что вести им было некуда.
    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('settings', 'dataPrivacy.import.action') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('settings', 'dataPrivacy.export.action') }),
    ).toBeInTheDocument();
  });

  it('открывает оба юридических документа — по отдельному маршруту на каждый (05§14)', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'dataPrivacy' });
    render(
      <AppProvider host={testHost(INDEXEDDB)} controller={controller}>
        <DataPrivacy />
      </AppProvider>,
    );

    const buttons = screen.getAllByRole('button', {
      name: t('settings', 'dataPrivacy.legal.title'),
    });
    expect(buttons).toHaveLength(2);

    await user.click(buttons[0]!);
    expect(controller.getState().screen).toBe('legalPrivacyPolicy');

    controller.goTo('dataPrivacy');
    await user.click(
      screen.getAllByRole('button', { name: t('settings', 'dataPrivacy.legal.title') })[1]!,
    );
    expect(controller.getState().screen).toBe('legalUserAgreement');
  });

  it('«Назад» возвращает в хаб настроек', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'dataPrivacy' });
    render(
      <AppProvider host={testHost(INDEXEDDB)} controller={controller}>
        <DataPrivacy />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: t('settings', 'dataPrivacy.back.label') }));

    expect(controller.getState().screen).toBe('settings');
  });
});
