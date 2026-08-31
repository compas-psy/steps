import { type ReactElement, useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { BottomSheet } from '../../../src/components/overlay/index.js';

function BottomSheetHarness(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Открыть шторку
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Заголовок шторки">
        <button type="button">Первая</button>
        <button type="button">Вторая</button>
      </BottomSheet>
    </>
  );
}

describe('BottomSheet', () => {
  it('не рендерится, пока open=false', () => {
    render(
      <BottomSheet open={false} onClose={() => {}} title="Скрыт">
        Содержимое
      </BottomSheet>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('открытая шторка имеет доступную роль и имя из title', () => {
    render(
      <BottomSheet open onClose={() => {}} title="Заголовок шторки">
        Содержимое
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Заголовок шторки' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('настоящий фокус-trap: открытие переносит фокус внутрь, Tab циклится, Escape закрывает, фокус возвращается на триггер', async () => {
    const user = userEvent.setup();
    render(<BottomSheetHarness />);

    const trigger = screen.getByRole('button', { name: 'Открыть шторку' });
    trigger.focus();
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Заголовок шторки' });
    const first = screen.getByRole('button', { name: 'Первая' });
    const second = screen.getByRole('button', { name: 'Вторая' });

    expect(first).toHaveFocus();

    await user.tab();
    expect(second).toHaveFocus();

    // Tab с последнего элемента списка обязан вернуть фокус к началу
    // диалога, а не выпустить его наружу.
    await user.tab();
    expect(first).toHaveFocus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
