import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NLPToken } from '../../../src/components/capture/index.js';

describe('NLPToken', () => {
  it('рендерит текст фрагмента и несёт класс-модификатор по kind (стиль по значению enum, не по смыслу)', () => {
    render(<NLPToken kind="date">27 авг</NLPToken>);
    expect(screen.getByText('27 авг')).toBeInTheDocument();
    expect(document.querySelector('.shagi-nlp-token--date')).toBeInTheDocument();
  });

  it('разные kind получают разный класс-модификатор (date vs priority)', () => {
    const { rerender } = render(<NLPToken kind="date">27 авг</NLPToken>);
    expect(document.querySelector('.shagi-nlp-token--date')).toBeInTheDocument();

    rerender(<NLPToken kind="priority">Важно</NLPToken>);
    expect(document.querySelector('.shagi-nlp-token--date')).not.toBeInTheDocument();
    expect(document.querySelector('.shagi-nlp-token--priority')).toBeInTheDocument();
  });

  it('removable требует крестик с доступным именем и вызывает onRemove', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <NLPToken kind="project" removable removeLabel="Убрать проект «Ремонт»" onRemove={onRemove}>
        Ремонт
      </NLPToken>,
    );

    const removeButton = screen.getByRole('button', { name: 'Убрать проект «Ремонт»' });
    await user.click(removeButton);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('без onEdit и removable — статичный, не кнопка', () => {
    render(<NLPToken kind="time">09:00</NLPToken>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('onEdit делает токен кликабельной кнопкой (редактирование по клику)', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <NLPToken kind="time" onEdit={onEdit}>
        09:00
      </NLPToken>,
    );

    const token = screen.getByRole('button', { name: '09:00' });
    await user.click(token);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
