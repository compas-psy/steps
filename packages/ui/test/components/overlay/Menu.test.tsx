import { type ReactElement, useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Menu, type MenuSectionData } from '../../../src/components/overlay/index.js';

function buildSections(onDelete: () => void): MenuSectionData[] {
  return [
    {
      key: 'frequent',
      items: [
        { key: 'complete', label: 'Выполнить' },
        { key: 'reschedule', label: 'Перепланировать' },
      ],
    },
    {
      key: 'rare',
      items: [{ key: 'labels', label: 'Метки' }],
    },
    {
      key: 'destructive',
      items: [{ key: 'delete', label: 'Удалить', variant: 'destructive', onSelect: onDelete }],
    },
  ];
}

function MenuHarness({ onDelete }: { readonly onDelete: () => void }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Открыть меню
      </button>
      <Menu open={open} onClose={() => setOpen(false)} sections={buildSections(onDelete)} />
    </>
  );
}

describe('Menu', () => {
  it('не рендерится, пока open=false', () => {
    render(<Menu open={false} onClose={() => {}} sections={buildSections(() => {})} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('рендерит секции с разделителями и единственный destructive-пункт визуально отличается', () => {
    render(<Menu open onClose={() => {}} sections={buildSections(() => {})} />);

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    // Секций 3 → между ними 2 разделителя.
    expect(screen.getAllByRole('separator')).toHaveLength(2);

    const deleteItem = screen.getByRole('menuitem', { name: 'Удалить' });
    expect(deleteItem.className).toMatch(/--destructive/);
    const completeItem = screen.getByRole('menuitem', { name: 'Выполнить' });
    expect(completeItem.className).toMatch(/--default/);
  });

  it('открытие переносит фокус на первый пункт; ArrowDown/ArrowUp двигают фокус по пунктам с зацикливанием', async () => {
    const user = userEvent.setup();
    render(<Menu open onClose={() => {}} sections={buildSections(() => {})} />);

    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(items[0]).toHaveFocus();

    // Зацикливание вверх с первого пункта — на последний.
    await user.keyboard('{ArrowUp}');
    expect(items[3]).toHaveFocus();
  });

  it('выбор пункта вызывает onSelect и закрывает меню; Escape закрывает и возвращает фокус на триггер', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<MenuHarness onDelete={onDelete} />);

    const trigger = screen.getByRole('button', { name: 'Открыть меню' });
    trigger.focus();
    await user.click(trigger);

    await user.click(screen.getByRole('menuitem', { name: 'Удалить' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
