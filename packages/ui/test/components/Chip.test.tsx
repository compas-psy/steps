import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Chip } from '../../src/index.js';

describe('Chip', () => {
  it('статичный чип без onClick/selected рендерится как обычный текст, не как кнопка', () => {
    render(<Chip>27 авг</Chip>);
    expect(screen.getByText('27 авг')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('переключаемый чип — button с aria-pressed', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Chip selected={false} onClick={onClick}>
        Сегодня
      </Chip>,
    );

    const chip = screen.getByRole('button', { name: 'Сегодня' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    await user.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('removable требует и remove-кнопку с доступным именем, и вызывает onRemove', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <Chip removable removeLabel="Удалить метку «Срочно»" onRemove={onRemove}>
        Срочно
      </Chip>,
    );

    const removeButton = screen.getByRole('button', { name: 'Удалить метку «Срочно»' });
    await user.click(removeButton);

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('disabled чип-кнопка недоступна для взаимодействия', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Chip selected onClick={onClick} disabled>
        Недоступно
      </Chip>,
    );

    const chip = screen.getByRole('button', { name: 'Недоступно' });
    expect(chip).toBeDisabled();

    await user.click(chip);
    expect(onClick).not.toHaveBeenCalled();
  });
});
