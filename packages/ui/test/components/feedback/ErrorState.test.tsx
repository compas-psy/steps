import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ErrorState } from '../../../src/components/feedback/index.js';

describe('ErrorState', () => {
  it('role=alert, title/description/action — пропсы', () => {
    render(
      <ErrorState
        icon={<svg aria-hidden="true" />}
        title="Не удалось загрузить"
        description="Проверьте соединение и попробуйте снова"
        action={<button type="button">Повторить</button>}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Не удалось загрузить');
    expect(alert).toHaveTextContent('Проверьте соединение и попробуйте снова');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('действие повтора — обычный слот, вызывающий код сам решает обработчик', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ErrorState
        title="Ошибка"
        action={
          <button type="button" onClick={onRetry}>
            Повторить
          </button>
        }
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
