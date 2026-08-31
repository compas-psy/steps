import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { QuickAdd } from '../../../src/components/capture/index.js';

function ControlledQuickAdd({
  onSubmit,
  loading = false,
}: {
  readonly onSubmit: (value: string) => void;
  readonly loading?: boolean;
}) {
  const [value, setValue] = useState('');
  return (
    <QuickAdd
      value={value}
      onChange={setValue}
      onSubmit={() => onSubmit(value)}
      label="Быстрое добавление задачи"
      submitLabel="Добавить"
      placeholder="Купить молоко завтра в 9"
      loading={loading}
    />
  );
}

describe('QuickAdd', () => {
  it('поле ввода доступно по label, значение и placeholder идут через пропсы', () => {
    render(<ControlledQuickAdd onSubmit={vi.fn()} />);
    const field = screen.getByRole('textbox', { name: 'Быстрое добавление задачи' });
    expect(field).toHaveAttribute('placeholder', 'Купить молоко завтра в 9');
  });

  it('кнопка отправки — icon-only с обязательным доступным именем (submitLabel)', () => {
    render(<ControlledQuickAdd onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Добавить' })).toBeInTheDocument();
  });

  it('пустое значение — кнопка отправки недоступна, Enter не вызывает onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ControlledQuickAdd onSubmit={onSubmit} />);

    expect(screen.getByRole('button', { name: 'Добавить' })).toBeDisabled();

    const field = screen.getByRole('textbox', { name: 'Быстрое добавление задачи' });
    await user.click(field);
    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ввод текста и Enter вызывает onSubmit с текущим значением', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ControlledQuickAdd onSubmit={onSubmit} />);

    const field = screen.getByRole('textbox', { name: 'Быстрое добавление задачи' });
    await user.type(field, 'Купить молоко');
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('Купить молоко');
  });

  it('клик по кнопке отправки тоже вызывает onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ControlledQuickAdd onSubmit={onSubmit} />);

    const field = screen.getByRole('textbox', { name: 'Быстрое добавление задачи' });
    await user.type(field, 'Купить хлеб');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(onSubmit).toHaveBeenCalledWith('Купить хлеб');
  });

  it('loading — кнопка занята (aria-busy) и недоступна для повторного клика', () => {
    render(<ControlledQuickAdd onSubmit={vi.fn()} loading />);
    const button = screen.getByRole('button', { name: 'Добавить' });
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('errorMessage связывается с полем программно через aria-describedby (§15)', () => {
    render(
      <QuickAdd
        value="?"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        label="Быстрое добавление задачи"
        submitLabel="Добавить"
        errorMessage="Не удалось распознать дату"
      />,
    );
    const field = screen.getByRole('textbox', { name: 'Быстрое добавление задачи' });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const describedBy = field.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Не удалось распознать дату');
  });
});
