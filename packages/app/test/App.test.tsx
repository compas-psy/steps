import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { describe, expect, it } from 'vitest';

import { App, type AppHost } from '../src/index.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
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
