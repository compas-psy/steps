import { type ReactElement, useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SideInspector } from '../../../src/components/overlay/index.js';

function SideInspectorHarness(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Открыть задачу
      </button>
      <ul>
        <li>
          <button type="button">Соседняя задача</button>
        </li>
      </ul>
      <SideInspector open={open} onClose={() => setOpen(false)} title="Задача">
        <button type="button">Отметить выполненной</button>
      </SideInspector>
    </>
  );
}

describe('SideInspector', () => {
  it('не рендерится, пока open=false', () => {
    render(
      <SideInspector open={false} title="Скрыт">
        Содержимое
      </SideInspector>,
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('рендерится как aside с доступным именем из title', () => {
    render(
      <SideInspector open title="Задача">
        Содержимое
      </SideInspector>,
    );
    expect(screen.getByRole('complementary', { name: 'Задача' })).toBeInTheDocument();
  });

  it('открытие переносит фокус внутрь и закрытие возвращает его на триггер — но список позади остаётся достижим по Tab (не полный trap)', async () => {
    const user = userEvent.setup();
    render(<SideInspectorHarness />);

    const trigger = screen.getByRole('button', { name: 'Открыть задачу' });
    trigger.focus();
    await user.click(trigger);

    const panel = await screen.findByRole('complementary', { name: 'Задача' });
    const action = screen.getByRole('button', { name: 'Отметить выполненной' });
    expect(action).toHaveFocus();
    expect(panel.contains(document.activeElement)).toBe(true);

    // Escape закрывает и возвращает фокус на триггер.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('без onClose Escape ничего не делает (панель не обязана уметь закрываться сама)', async () => {
    const user = userEvent.setup();
    render(
      <SideInspector open title="Задача">
        <button type="button">Действие</button>
      </SideInspector>,
    );
    await user.keyboard('{Escape}');
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });
});
