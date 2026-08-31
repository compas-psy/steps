import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../src/index.js';

describe('Button', () => {
  it('рендерит переданный текст и роль button', () => {
    render(<Button>Сохранить</Button>);
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeInTheDocument();
  });

  it('вызывает onClick по клику', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Отправить</Button>);

    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled — недоступна для взаимодействия (атрибут и обработчик не вызывается)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Недоступно
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Недоступно' });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading — сообщает aria-busy и гасит клик, но остаётся в tab-порядке', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Сохранение
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Сохранение' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('поддерживает все варианты без падения рендера', () => {
    const variants = ['primary', 'accent', 'secondary', 'ghost', 'destructive'] as const;
    for (const variant of variants) {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole('button', { name: variant })).toBeInTheDocument();
      unmount();
    }
  });
});
