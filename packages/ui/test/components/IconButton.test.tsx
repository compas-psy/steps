import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IconButton } from '../../src/index.js';

describe('IconButton', () => {
  it('доступное имя приходит из обязательного label, не из иконки', () => {
    render(<IconButton icon="close" label="Закрыть" />);
    const button = screen.getByRole('button', { name: 'Закрыть' });
    expect(button).toHaveAccessibleName('Закрыть');
    // Иконка внутри декоративна — не дублирует имя кнопки своим aria-label.
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('вызывает onClick по клику', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton icon="delete" label="Удалить" onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled — недоступна для взаимодействия', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton icon="delete" label="Удалить" disabled onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Удалить' });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading — сообщает aria-busy и гасит клик', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton icon="sync" label="Синхронизировать" loading onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Синхронизировать' });
    expect(button).toHaveAttribute('aria-busy', 'true');

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
