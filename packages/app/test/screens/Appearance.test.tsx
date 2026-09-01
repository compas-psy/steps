import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUnavailablePlatform, type LocalPreferencesPort } from '@shagi/platform';
import { t } from '@shagi/i18n';

import type { AppHost } from '../../src/App.js';
import { AppProvider } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { Appearance } from '../../src/screens/Appearance.js';

/** Управляемый фейк `localPreferences` (M42) — тот же контракт, что
 * `fakeNetworkStatus` в `OfflineBanner.test.tsx`: синхронное чтение/запись
 * поверх обычной `Map`, без реального `localStorage` (не тянуть браузерное
 * окружение в юнит-тест ради контракта из трёх методов). */
function fakeLocalPreferences(initial: Readonly<Record<string, string>> = {}): {
  readonly port: LocalPreferencesPort;
  readonly store: Map<string, string>;
} {
  const store = new Map(Object.entries(initial));
  return {
    store,
    port: {
      get: (key) => store.get(key) ?? null,
      set: (key, value) => {
        store.set(key, value);
      },
      remove: (key) => {
        store.delete(key);
      },
    },
  };
}

function testHost(localPreferences: LocalPreferencesPort | { kind: 'unavailable' }): AppHost {
  return {
    platform: { ...createUnavailablePlatform(), localPreferences },
    storageBackend: { kind: 'memory' },
  };
}

const THEME_KEY = 'shagi.preferences.theme';

describe('Appearance (M42)', () => {
  afterEach(() => {
    // Каждый тест этого файла реально трогает `document.documentElement`
    // (см. заголовок `Appearance.tsx`) — без сброса состояние утекло бы в
    // следующий тест, который ожидает дефолт «система».
    document.documentElement.removeAttribute('data-theme');
  });

  it('без сохранённого значения — выбран «Как в системе», атрибут не выставлен', () => {
    const { port } = fakeLocalPreferences();
    render(
      <AppProvider host={testHost(port)}>
        <Appearance />
      </AppProvider>,
    );

    expect(
      screen.getByRole('radio', { name: t('settings', 'appearance.options.system') }),
    ).toBeChecked();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('выбор «Тёмная» сразу выставляет data-theme="dark" и сохраняет выбор', async () => {
    const user = userEvent.setup();
    const { port, store } = fakeLocalPreferences();
    render(
      <AppProvider host={testHost(port)}>
        <Appearance />
      </AppProvider>,
    );

    await user.click(screen.getByRole('radio', { name: t('settings', 'appearance.options.dark') }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(store.get(THEME_KEY)).toBe('dark');
  });

  it('выбор «Светлая» сразу выставляет data-theme="light" и сохраняет выбор', async () => {
    const user = userEvent.setup();
    const { port, store } = fakeLocalPreferences();
    render(
      <AppProvider host={testHost(port)}>
        <Appearance />
      </AppProvider>,
    );

    await user.click(
      screen.getByRole('radio', { name: t('settings', 'appearance.options.light') }),
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(store.get(THEME_KEY)).toBe('light');
  });

  it('возврат к «Как в системе» снимает атрибут вовсе, не ставит его в отдельное значение', async () => {
    const user = userEvent.setup();
    const { port } = fakeLocalPreferences({ [THEME_KEY]: 'dark' });
    render(
      <AppProvider host={testHost(port)}>
        <Appearance />
      </AppProvider>,
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await user.click(
      screen.getByRole('radio', { name: t('settings', 'appearance.options.system') }),
    );

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('при монтировании с уже сохранённым значением — применяет его сразу', () => {
    const { port } = fakeLocalPreferences({ [THEME_KEY]: 'dark' });
    render(
      <AppProvider host={testHost(port)}>
        <Appearance />
      </AppProvider>,
    );

    expect(
      screen.getByRole('radio', { name: t('settings', 'appearance.options.dark') }),
    ).toBeChecked();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('`Unavailable` localPreferences — выбор применяется в рамках сессии, экран не падает', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider host={testHost({ kind: 'unavailable' })}>
        <Appearance />
      </AppProvider>,
    );

    await user.click(screen.getByRole('radio', { name: t('settings', 'appearance.options.dark') }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(
      screen.getByRole('radio', { name: t('settings', 'appearance.options.dark') }),
    ).toBeChecked();
  });

  it('«Назад» возвращает на экран Settings', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'appearance' });
    const { port } = fakeLocalPreferences();
    render(
      <AppProvider host={testHost(port)} controller={controller}>
        <Appearance />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: t('settings', 'appearance.back.label') }));

    expect(controller.getState().screen).toBe('settings');
  });
});
