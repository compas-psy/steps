import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OtpInput } from '../../../src/components/account/index.js';

describe('OtpInput', () => {
  it('рендерит по одной ячейке на каждый символ длины кода', () => {
    render(<OtpInput length={6} value="" onChange={vi.fn()} label="Код подтверждения" />);
    expect(screen.getAllByRole('textbox')).toHaveLength(6);
  });

  it('ввод цифры в пустую ячейку сообщает onChange с обновлённым значением и переводит фокус на следующую', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OtpInput length={4} value="" onChange={onChange} label="Код подтверждения" />);
    const cells = screen.getAllByRole('textbox');
    await user.type(cells[0]!, '5');
    expect(onChange).toHaveBeenCalledWith('5');
  });

  it('после заполнения первой ячейки фокус переходит на вторую', async () => {
    const user = userEvent.setup();
    render(<OtpInput length={4} value="" onChange={vi.fn()} label="Код подтверждения" />);
    const cells = screen.getAllByRole('textbox');
    await user.type(cells[0]!, '5');
    expect(cells[1]).toHaveFocus();
  });

  it('Backspace в пустой ячейке возвращает фокус на предыдущую', async () => {
    const user = userEvent.setup();
    render(<OtpInput length={4} value="12" onChange={vi.fn()} label="Код подтверждения" />);
    const cells = screen.getAllByRole('textbox');
    cells[2]!.focus();
    await user.keyboard('{Backspace}');
    expect(cells[1]).toHaveFocus();
  });

  it('вставка полного кода одним действием заполняет все ячейки и вызывает onComplete', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onComplete = vi.fn();
    render(
      <OtpInput
        length={6}
        value=""
        onChange={onChange}
        onComplete={onComplete}
        label="Код подтверждения"
      />,
    );
    const cells = screen.getAllByRole('textbox');
    cells[0]!.focus();
    await user.paste('123456');
    expect(onChange).toHaveBeenCalledWith('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('вставка кода короче длины не вызывает onComplete', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <OtpInput
        length={6}
        value=""
        onChange={vi.fn()}
        onComplete={onComplete}
        label="Код подтверждения"
      />,
    );
    const cells = screen.getAllByRole('textbox');
    cells[0]!.focus();
    await user.paste('123');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('loading отключает все ячейки', () => {
    render(<OtpInput length={4} value="" onChange={vi.fn()} label="Код подтверждения" loading />);
    for (const cell of screen.getAllByRole('textbox')) {
      expect(cell).toBeDisabled();
    }
  });

  it('error связывает сообщение об ошибке с группой через aria-describedby', () => {
    render(
      <OtpInput
        length={4}
        value=""
        onChange={vi.fn()}
        label="Код подтверждения"
        error
        errorMessage="Неверный код"
      />,
    );
    expect(screen.getByText('Неверный код')).toBeInTheDocument();
    expect(screen.getByRole('group')).toHaveAttribute('aria-describedby');
  });

  it('группа ячеек доступна по aria-label из label', () => {
    render(<OtpInput length={4} value="" onChange={vi.fn()} label="Код подтверждения" />);
    expect(screen.getByRole('group', { name: 'Код подтверждения' })).toBeInTheDocument();
  });
});
