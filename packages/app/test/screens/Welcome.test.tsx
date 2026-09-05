import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { Welcome } from '../../src/screens/Welcome.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

describe('Welcome (M02)', () => {
  it('«Начать» уходит в локальный режим — continueLocally() → firstTask + localMode', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'welcome' });
    render(
      <AppProvider host={testHost()} controller={controller}>
        <Welcome />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: t('onboarding', 'welcome.startLocal') }));

    expect(controller.getState()).toEqual({
      screen: 'firstTask',
      localMode: true,
      selectedProjectId: null,
      selectedTaskId: null,
      returnScreen: null,
      settingsReturnScreen: null,
      quickAdd: null,
      dataVersion: 0,
    });
  });

  it('входа по аккаунту здесь нет — бэкенда не существует, тупика быть не должно', () => {
    // Раньше здесь стояла кнопка «Войти», которая вела на экран, умеющий
    // только сказать «этого пока нет». Продукт предлагал действие, заведомо
    // зная, что оно не сработает. Локальный режим — основной и
    // единственный путь этой версии, и приветствие говорит именно это.
    render(
      <AppProvider host={testHost()} controller={createAppController({ screen: 'welcome' })}>
        <Welcome />
      </AppProvider>,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(t('onboarding', 'welcome.startLocal'));
  });
});
