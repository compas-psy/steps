import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Textarea } from '../../src/index.js';

describe('Textarea', () => {
  it('рендерит многострочное поле с доступным именем', () => {
    render(<Textarea aria-label="Описание" />);
    expect(screen.getByRole('textbox', { name: 'Описание' })).toBeInTheDocument();
  });

  it('принимает многострочный ввод', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Заметка" />);
    const field = screen.getByRole('textbox', { name: 'Заметка' });

    await user.type(field, 'строка первая{enter}строка вторая');

    expect(field).toHaveValue('строка первая\nстрока вторая');
  });

  it('disabled — недоступно для ввода', () => {
    render(<Textarea aria-label="Заблокировано" disabled />);
    expect(screen.getByRole('textbox', { name: 'Заблокировано' })).toBeDisabled();
  });

  it('errorMessage связывается программно через aria-describedby и aria-invalid', () => {
    render(<Textarea aria-label="Комментарий" errorMessage="Слишком длинно" />);

    const field = screen.getByRole('textbox', { name: 'Комментарий' });
    expect(field).toHaveAttribute('aria-invalid', 'true');

    const describedBy = field.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Слишком длинно');
  });
});
