import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Toast } from '../../../src/components/feedback/index.js';

describe('Toast', () => {
  it('обычный тост — role=status, aria-live=polite', () => {
    render(<Toast message="Задача сохранена" />);
    const toast = screen.getByRole('status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(toast).toHaveTextContent('Задача сохранена');
  });

  it('вариант error — role=alert, aria-live=assertive', () => {
    render(<Toast message="Не удалось сохранить" variant="error" />);
    const toast = screen.getByRole('alert');
    expect(toast).toHaveAttribute('aria-live', 'assertive');
  });

  it('кнопка закрытия рендерится только при onDismiss+dismissLabel и вызывает обработчик', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { rerender } = render(<Toast message="Уведомление" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<Toast message="Уведомление" onDismiss={onDismiss} dismissLabel="Закрыть" />);
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('action-слот рендерится рядом с сообщением', () => {
    render(<Toast message="Задача перенесена" action={<a href="#">Отменить</a>} />);
    expect(screen.getByRole('link', { name: 'Отменить' })).toBeInTheDocument();
  });
});
