import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { SignIn } from '../../src/screens/SignIn.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

describe('SignIn (M03)', () => {
  it('попытка входа по email показывает честную ошибку «функция появится позже», не притворяется загрузкой', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'signIn' });
    render(
      <AppProvider host={testHost()} controller={controller}>
        <SignIn />
      </AppProvider>,
    );

    await user.type(
      screen.getByLabelText(t('onboarding', 'signIn.emailLabel')),
      'user@example.com',
    );
    await user.click(screen.getByRole('button', { name: t('onboarding', 'signIn.continueLabel') }));

    expect(screen.getByText(t('onboarding', 'signIn.unavailableError'))).toBeInTheDocument();
    // Никуда не перешли — реальной аутентификации нет.
    expect(controller.getState().screen).toBe('signIn');
  });

  it('попытка входа через Яндекс тоже честно показывает ошибку, а не молчит', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'signIn' });
    render(
      <AppProvider host={testHost()} controller={controller}>
        <SignIn />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: t('onboarding', 'signIn.yandexLabel') }));

    expect(screen.getByText(t('onboarding', 'signIn.unavailableError'))).toBeInTheDocument();
  });

  it('«Продолжить локально» реально работает и не блокируется состоянием формы', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'signIn' });
    render(
      <AppProvider host={testHost()} controller={controller}>
        <SignIn />
      </AppProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: t('onboarding', 'signIn.continueLocalLabel') }),
    );

    expect(controller.getState()).toEqual({
      screen: 'firstTask',
      localMode: true,
      selectedProjectId: null,
      selectedTaskId: null,
      returnScreen: null,
      settingsReturnScreen: null,
      quickAdd: null,
    });
  });
});
