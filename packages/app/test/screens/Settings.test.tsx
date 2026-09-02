import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';

import type { AppHost } from '../../src/App.js';
import { AppProvider } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { Settings } from '../../src/screens/Settings.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

describe('Settings (M41)', () => {
  it('рендерит заголовок и РОВНО две строки хаба (честный UI — никаких заглушек)', () => {
    render(
      <AppProvider host={testHost()}>
        <Settings />
      </AppProvider>,
    );

    expect(
      screen.getByRole('heading', { name: t('settings', 'root.pageTitle') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('settings', 'root.appearance.title') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('settings', 'root.dataPrivacy.title') }),
    ).toBeInTheDocument();
    // Ровно две строки-перехода плюс «Назад» — и ни одной заглушки сверх
    // того. Проверка обязана падать на первой же строке, дописанной «на
    // будущее»: именно ради этого она считает кнопки, а не ищет знакомые.
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('клик по строке «Оформление» ведёт на экран appearance', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'settings' });
    render(
      <AppProvider host={testHost()} controller={controller}>
        <Settings />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: t('settings', 'root.appearance.title') }));

    expect(controller.getState().screen).toBe('appearance');
  });

  it('клик по строке «Данные и конфиденциальность» ведёт на экран dataPrivacy', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'settings' });
    render(
      <AppProvider host={testHost()} controller={controller}>
        <Settings />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: t('settings', 'root.dataPrivacy.title') }));

    expect(controller.getState().screen).toBe('dataPrivacy');
  });

  it('«Назад» возвращает на экран, с которого Settings был открыт (settingsReturnScreen)', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'todayEmpty' });
    controller.openSettings();
    expect(controller.getState().settingsReturnScreen).toBe('todayEmpty');
    render(
      <AppProvider host={testHost()} controller={controller}>
        <Settings />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: t('settings', 'root.back.label') }));

    expect(controller.getState().screen).toBe('todayEmpty');
    expect(controller.getState().settingsReturnScreen).toBeNull();
  });
});
