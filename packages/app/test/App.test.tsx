import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createUnavailablePlatform, type LocalPreferencesPort } from '@shagi/platform';
import { t } from '@shagi/i18n';

import { App, type AppHost } from '../src/index.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
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
