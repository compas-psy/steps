// eslint-disable-next-line import/no-unassigned-import -- побочный эффект: регистрирует indexedDB в globalThis, присваивать нечего
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUnavailablePlatform, type PlatformCapabilitiesRegistry } from '@shagi/platform';
import { t } from '@shagi/i18n';

import type { AppHost } from '../../src/App.js';
import { AppProvider } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { DataPrivacy } from '../../src/screens/DataPrivacy.js';
import { ONBOARDING_DONE_KEY } from '../../src/state/onboarding.js';
import type { StorageBackend } from '../../src/state/storage-backend.js';

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
    // Кнопок ровно четыре, и каждая ведёт к работающему действию: «Назад»,
    // «Импортировать» (M46), «Открыть» экспорт (M49) и «Удалить». Экспорт
    // и импорт добавлены пакетом работ M46–M49 — до него их здесь не было
    // именно потому, что вести им было некуда.
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('settings', 'dataPrivacy.import.action') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('settings', 'dataPrivacy.export.action') }),
    ).toBeInTheDocument();
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
