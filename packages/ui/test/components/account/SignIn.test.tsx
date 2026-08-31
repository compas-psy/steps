import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SignIn } from '../../../src/components/account/index.js';

function renderSignIn(overrides: Partial<Parameters<typeof SignIn>[0]> = {}) {
  const props = {
    email: '',
    onEmailChange: vi.fn(),
    onContinue: vi.fn(),
    onYandexSignIn: vi.fn(),
    onContinueLocal: vi.fn(),
    emailLabel: 'Email',
    continueLabel: 'Продолжить',
    yandexLabel: 'Войти через Яндекс',
    continueLocalLabel: 'Продолжить без входа',
    ...overrides,
  };
  render(<SignIn {...props} />);
  return props;
}

describe('SignIn', () => {
  it('рендерит поле email, кнопку продолжения, вход через Яндекс и локальный режим', () => {
    renderSignIn();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти через Яндекс' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Продолжить без входа' })).toBeInTheDocument();
  });

  it('ввод в поле email вызывает onEmailChange', async () => {
    const user = userEvent.setup();
    const props = renderSignIn();
    await user.type(screen.getByLabelText('Email'), 'a');
    expect(props.onEmailChange).toHaveBeenCalledWith('a');
  });

  it('отправка формы с непустым email вызывает onContinue', async () => {
    const user = userEvent.setup();
    const props = renderSignIn({ email: 'user@example.com' });
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(props.onContinue).toHaveBeenCalledTimes(1);
  });

  it('кнопка продолжения отключена, пока email пуст', () => {
    renderSignIn({ email: '' });
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
  });

  it('клик по кнопке Яндекса вызывает onYandexSignIn', async () => {
    const user = userEvent.setup();
    const props = renderSignIn();
    await user.click(screen.getByRole('button', { name: 'Войти через Яндекс' }));
    expect(props.onYandexSignIn).toHaveBeenCalledTimes(1);
  });

  it('клик по «продолжить локально» вызывает onContinueLocal', async () => {
    const user = userEvent.setup();
    const props = renderSignIn();
    await user.click(screen.getByRole('button', { name: 'Продолжить без входа' }));
    expect(props.onContinueLocal).toHaveBeenCalledTimes(1);
  });

  it('loading блокирует продолжение и вход через Яндекс, но не локальный режим', () => {
    renderSignIn({ email: 'user@example.com', loading: true });
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Войти через Яндекс' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Продолжить без входа' })).toBeEnabled();
  });

  it('rateLimited блокирует продолжение, но не локальный режим', () => {
    renderSignIn({ email: 'user@example.com', rateLimited: true });
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Продолжить без входа' })).toBeEnabled();
  });

  it('errorMessage рендерится и связывается с полем email через aria-describedby', () => {
    renderSignIn({ errorMessage: 'Некорректный email' });
    expect(screen.getByText('Некорректный email')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby');
  });

  it('«продолжить локально» никогда не отключается блокировкой формы (offline-first по спеке)', () => {
    renderSignIn({ loading: true, rateLimited: true, errorMessage: 'Ошибка' });
    expect(screen.getByRole('button', { name: 'Продолжить без входа' })).toBeEnabled();
  });
});
