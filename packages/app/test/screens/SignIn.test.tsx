/**
 * `SignIn` (M03) — экран об аккаунте и синхронизации.
 *
 * Тесты переписаны вместе с самим экраном: раньше они проверяли, что форма
 * входа честно показывает ошибку ПОСЛЕ попытки. Это и было дефектом —
 * продукт предлагал действие, заведомо зная, что оно не сработает. Теперь
 * проверяется то, что действительно важно для человека: он узнаёт правду
 * до всякого действия и не может попасть в тупик.
 */
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

function renderSignIn(): ReturnType<typeof createAppController> {
  const controller = createAppController({ screen: 'signIn' });
  render(
    <AppProvider host={testHost()} controller={controller}>
      <SignIn />
    </AppProvider>,
  );
  return controller;
}

describe('SignIn (M03)', () => {
  it('говорит об отсутствии аккаунта сразу, не дожидаясь попытки входа', () => {
    renderSignIn();
    expect(screen.getByText(t('onboarding', 'signIn.description'))).toBeInTheDocument();
  });

  it('не показывает нерабочую форму входа: ни поля почты, ни кнопки «Войти через Яндекс»', () => {
    renderSignIn();
    // Ровно то, что владелец назвал недопустимым: элементы управления,
    // которые выглядят как рабочая авторизация, но ею не являются.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(t('onboarding', 'signIn.yandexLabel'))).toBeNull();
    expect(screen.queryByText(t('onboarding', 'signIn.continueLabel'))).toBeNull();
  });

  it('объясняет, что данные локальны и переносятся экспортом', () => {
    renderSignIn();
    expect(screen.getByText(t('onboarding', 'signIn.whatWorks'))).toBeInTheDocument();
  });

  it('единственное действие экрана уводит в локальный режим — тупика нет', async () => {
    const user = userEvent.setup();
    const controller = renderSignIn();

    await user.click(screen.getByRole('button', { name: t('onboarding', 'signIn.backLabel') }));

    expect(controller.getState().screen).toBe('firstTask');
    expect(controller.getState().localMode).toBe(true);
  });
});
