import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Switch } from '../../src/index.js';

describe('Switch', () => {
  it('имеет роль switch и видимый label', () => {
    render(<Switch label="Уведомления по будильнику" />);
    expect(screen.getByRole('switch', { name: 'Уведомления по будильнику' })).toBeInTheDocument();
  });

  it('переключается по клику', async () => {
    const user = userEvent.setup();
    render(<Switch label="Аналитика" />);

    const toggle = screen.getByRole('switch', { name: 'Аналитика' });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    expect(toggle).toBeChecked();
  });

  it('переключается с клавиатуры (Space)', async () => {
    const user = userEvent.setup();
    render(<Switch label="Синхронизация" />);

    const toggle = screen.getByRole('switch', { name: 'Синхронизация' });
    toggle.focus();
    await user.keyboard(' ');

    expect(toggle).toBeChecked();
  });

  it('disabled — недоступен для взаимодействия', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch label="Недоступно" disabled onChange={onChange} />);

    const toggle = screen.getByRole('switch', { name: 'Недоступно' });
    expect(toggle).toBeDisabled();

    await user.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });
});
