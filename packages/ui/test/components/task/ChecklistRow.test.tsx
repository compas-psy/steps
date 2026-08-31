import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChecklistRow } from '../../../src/components/task/index.js';

describe('ChecklistRow', () => {
  it('видимый текст пункта связан с чекбоксом через нативный label', () => {
    render(<ChecklistRow label="Паспорт" checked={false} />);
    expect(screen.getByRole('checkbox', { name: 'Паспорт' })).toBeInTheDocument();
  });

  it('переключается кликом по тексту и вызывает onCheckedChange', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<ChecklistRow label="Билеты" checked={false} onCheckedChange={onCheckedChange} />);

    await user.click(screen.getByText('Билеты'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('checked — модификатор-класс зачёркивания текста присутствует (не только цвет)', () => {
    const { container } = render(<ChecklistRow label="Готово" checked />);
    expect(
      container.querySelector('.shagi-checklist-row--checked .shagi-checkbox__label'),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Готово' })).toBeChecked();
  });

  it('disabled недоступен для взаимодействия', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <ChecklistRow
        label="Недоступно"
        checked={false}
        disabled
        onCheckedChange={onCheckedChange}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Недоступно' });
    expect(checkbox).toBeDisabled();
    await user.click(checkbox);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('trailing-слот рендерится (например кнопка удаления пункта)', () => {
    render(
      <ChecklistRow
        label="Пункт"
        checked={false}
        trailing={<button type="button">Удалить</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
  });
});
