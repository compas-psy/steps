import { type ReactElement, useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Popover } from '../../../src/components/overlay/index.js';

function PopoverHarness(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      anchor={
        <button type="button" onClick={() => setOpen(true)}>
          Фильтры
        </button>
      }
      aria-label="Панель фильтров"
    >
      <button type="button">Применить</button>
    </Popover>
  );
}

describe('Popover', () => {
  it('панель не в DOM, пока open=false', () => {
    render(
      <Popover open={false} onClose={() => {}} anchor={<span>Якорь</span>}>
        Содержимое
      </Popover>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Якорь')).toBeInTheDocument();
  });

  it('якорь рендерится как есть (не клонируется, не получает синтетических обработчиков)', () => {
    render(
      <Popover open={false} onClose={() => {}} anchor={<button type="button">Триггер</button>}>
        Содержимое
      </Popover>,
    );
    const anchorButton = screen.getByRole('button', { name: 'Триггер' });
    expect(anchorButton).not.toHaveAttribute('aria-describedby');
  });

  it('открытие переносит фокус внутрь панели, Escape закрывает и возвращает фокус на якорь', async () => {
    const user = userEvent.setup();
    render(<PopoverHarness />);

    const anchor = screen.getByRole('button', { name: 'Фильтры' });
    anchor.focus();
    await user.click(anchor);

    const panel = await screen.findByRole('dialog', { name: 'Панель фильтров' });
    const applyButton = screen.getByRole('button', { name: 'Применить' });
    expect(applyButton).toHaveFocus();
    expect(panel.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(anchor).toHaveFocus();
  });
});
