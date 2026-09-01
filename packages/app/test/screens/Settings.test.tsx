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
  it('рендерит заголовок и РОВНО одну строку «Оформление» (честный UI — никаких заглушек)', () => {
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
    // Ровно одна строка-переход — единственная кнопка со строкой каталога,
    // распознаваемой по совпадению текста «Оформление», не считая «Назад».
    expect(
      screen.getAllByRole('button').filter((button) => button.textContent?.includes('Оформление')),
    ).toHaveLength(1);
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
