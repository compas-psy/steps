import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TaskCheckbox } from '../../../src/components/task/index.js';

describe('TaskCheckbox', () => {
  it('доступное имя приходит через label (не видимый текст)', () => {
    render(<TaskCheckbox label="Купить билеты" checked={false} onChange={() => {}} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Купить билеты' });
    expect(checkbox).toBeInTheDocument();
    // Компонент не рендерит текст подписи в DOM — только aria-label.
    expect(screen.queryByText('Купить билеты')).not.toBeInTheDocument();
  });

  it('controlled checked отражается в DOM', () => {
    render(<TaskCheckbox label="Отмечено" checked readOnly />);
    expect(screen.getByRole('checkbox', { name: 'Отмечено' })).toBeChecked();
  });

  it('переключается по клику и вызывает onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TaskCheckbox label="Переключаемое" checked={false} onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: 'Переключаемое' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('disabled — недоступен для взаимодействия', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TaskCheckbox label="Недоступно" checked={false} disabled onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox', { name: 'Недоступно' });
    expect(checkbox).toBeDisabled();
    await user.click(checkbox);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('focus — визуальный класс золотого контура присутствует', () => {
    const { container } = render(
      <TaskCheckbox label="Главное" checked={false} onChange={() => {}} focus />,
    );
    expect(container.querySelector('.shagi-task-checkbox--focus')).toBeInTheDocument();
  });
});
