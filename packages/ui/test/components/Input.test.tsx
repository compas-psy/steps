import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Input } from '../../src/index.js';

describe('Input', () => {
  it('рендерит поле с доступным именем через aria-label', () => {
    render(<Input aria-label="Название задачи" />);
    expect(screen.getByRole('textbox', { name: 'Название задачи' })).toBeInTheDocument();
  });

  it('принимает ввод и вызывает onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input aria-label="Поиск" onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Поиск' }), 'привет');

    expect(onChange).toHaveBeenCalled();
  });

  it('disabled — недоступно для ввода', () => {
    render(<Input aria-label="Заблокировано" disabled />);
    expect(screen.getByRole('textbox', { name: 'Заблокировано' })).toBeDisabled();
  });

  it('errorMessage связывается программно через aria-describedby и aria-invalid', () => {
    render(<Input aria-label="Дедлайн" errorMessage="Некорректная дата" />);

    const field = screen.getByRole('textbox', { name: 'Дедлайн' });
    expect(field).toHaveAttribute('aria-invalid', 'true');

    const describedBy = field.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const message = document.getElementById(describedBy!);
    expect(message).toHaveTextContent('Некорректная дата');
  });

  it('leading/trailing узлы декоративны (не мешают доступному имени поля)', () => {
    render(<Input aria-label="С иконками" leading={<span>L</span>} trailing={<span>T</span>} />);
    expect(screen.getByRole('textbox', { name: 'С иконками' })).toBeInTheDocument();
  });
});
