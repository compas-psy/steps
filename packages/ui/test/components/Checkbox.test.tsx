import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from '../../src/index.js';

describe('Checkbox', () => {
  it('видимый label связан с полем через нативный <label>', () => {
    render(<Checkbox label="Уведомления" />);
    expect(screen.getByRole('checkbox', { name: 'Уведомления' })).toBeInTheDocument();
  });

  it('переключается по клику на подпись', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Показывать завершённые" />);

    const checkbox = screen.getByRole('checkbox', { name: 'Показывать завершённые' });
    expect(checkbox).not.toBeChecked();

    await user.click(screen.getByText('Показывать завершённые'));
    expect(checkbox).toBeChecked();
  });

  it('controlled checked отражается в DOM', () => {
    render(<Checkbox label="Отмечено" checked readOnly />);
    expect(screen.getByRole('checkbox', { name: 'Отмечено' })).toBeChecked();
  });

  it('disabled — недоступен для взаимодействия', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="Недоступно" disabled onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox', { name: 'Недоступно' });
    expect(checkbox).toBeDisabled();

    await user.click(checkbox);
    expect(onChange).not.toHaveBeenCalled();
  });
});
