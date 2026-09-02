// eslint-disable-next-line import/no-unassigned-import -- побочный эффект: регистрирует indexedDB в globalThis, присваивать нечего
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';

import type { AppHost } from '../../src/App.js';
import { AppProvider } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { DataPrivacy } from '../../src/screens/DataPrivacy.js';
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

  it('не рисует ни одного нерабочего действия: только «Назад» и ни одного тумблера', () => {
    render(
      <AppProvider host={testHost(INDEXEDDB)}>
        <DataPrivacy />
      </AppProvider>,
    );

    // Экспорт, удаление данных и тумблер согласия из макета M51 в R1 не
    // реализованы (см. заголовок `DataPrivacy.tsx`). Пока их нет — их не
    // должно быть и на экране: тест обязан покраснеть на первой же строке,
    // дописанной «чтобы было как в макете».
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
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
