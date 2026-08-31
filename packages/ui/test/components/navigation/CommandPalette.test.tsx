import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  CommandPalette,
  type CommandPaletteItem,
} from '../../../src/components/navigation/index.js';

const ITEMS: readonly CommandPaletteItem[] = [
  { value: 'today', label: 'Перейти к Сегодня' },
  { value: 'plan', label: 'Перейти к Плану' },
  { value: 'archive', label: 'Архив', disabled: true },
];

function Harness({ onSelect }: { onSelect?: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Открыть палитру
      </button>
      <CommandPalette
        open={open}
        items={ITEMS.filter((item) =>
          String(item.label).toLowerCase().includes(query.toLowerCase()),
        )}
        query={query}
        onQueryChange={setQuery}
        onSelect={(value) => {
          setSelected(value);
          onSelect?.(value);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
        label="Командная палитра"
        placeholder="Введите команду"
        closeLabel="Закрыть палитру"
        emptyState="Ничего не найдено"
      />
      {selected !== null && <p>Выбрано: {selected}</p>}
    </div>
  );
}

describe('CommandPalette', () => {
  it('закрыта — диалог отсутствует в DOM', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('открывается как role="dialog" с доступным именем, фокус сразу в поле ввода', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Открыть палитру' }));

    const dialog = screen.getByRole('dialog', { name: 'Командная палитра' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('поле ввода (role="combobox") имеет доступное имя через aria-label (axe: label)', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Открыть палитру' }));

    expect(screen.getByRole('combobox', { name: 'Командная палитра' })).toBeInTheDocument();
  });

  it('aria-controls на поле ввода указывает на реально существующий id listbox, когда items не пуст', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Открыть палитру' }));

    const input = screen.getByRole('combobox');
    const listbox = screen.getByRole('listbox');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
  });

  it('aria-controls указывает на существующий (но скрытый) listbox даже при пустом items — aria-expanded="true" требует валидный aria-controls (axe: aria-required-attr), а не его отсутствие', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Открыть палитру' }));
    await user.type(screen.getByRole('combobox'), 'нет такой команды');

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    // `getByRole('listbox')` не находит скрытый (`hidden`) элемент — id всё
    // равно в DOM и адресуем через `document.getElementById`.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    const controlsId = input.getAttribute('aria-controls');
    expect(controlsId).not.toBeNull();
    // eslint-disable-next-line testing-library/no-node-access -- проверяем именно то, что не проверяет getByRole: скрытый элемент с этим id реально существует в DOM (axe: aria-required-attr/aria-valid-attr-value смотрят на DOM, не на роль видимого дерева).
    expect(document.getElementById(controlsId as string)).toBeInTheDocument();
  });

  it('Escape закрывает диалог и возвращает фокус на элемент, который его открыл', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Открыть палитру' });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('клик по кнопке закрытия тоже закрывает диалог', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Открыть палитру' }));
    await user.click(screen.getByRole('button', { name: 'Закрыть палитру' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('клик по подложке вне панели закрывает диалог', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Открыть палитру' }));
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement!;

    fireEvent.mouseDown(backdrop, { target: backdrop });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ввод в поле фильтрует список через onQueryChange', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Открыть палитру' }));
    await user.type(screen.getByRole('combobox'), 'план');

    expect(screen.getByRole('option', { name: 'Перейти к Плану' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Перейти к Сегодня' })).not.toBeInTheDocument();
  });

  it('пустой результат показывает emptyState вместо списка', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Открыть палитру' }));
    await user.type(screen.getByRole('combobox'), 'нет такой команды');

    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Enter без движения стрелками выбирает первое совпадение', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Открыть палитру' }));
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith('today');
  });

  it('стрелка вниз двигает подсветку (aria-activedescendant), Enter выбирает подсвеченный пункт', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Открыть палитру' }));
    const input = screen.getByRole('combobox');
    const planOption = screen.getByRole('option', { name: 'Перейти к Плану' });

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', planOption.id);
    expect(planOption).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('plan');
  });

  it('отключённый пункт помечен aria-disabled и не выбирается по клику', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Открыть палитру' }));
    const archive = screen.getByRole('option', { name: 'Архив' });
    expect(archive).toHaveAttribute('aria-disabled', 'true');

    await user.click(archive);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('фокус-ловушка: Tab по последнему фокусируемому элементу возвращает на первый', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Открыть палитру' }));
    const input = screen.getByRole('combobox');
    const closeButton = screen.getByRole('button', { name: 'Закрыть палитру' });

    expect(input).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
  });

  it('фокус-ловушка: Shift+Tab с первого элемента переходит на последний', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Открыть палитру' }));
    const input = screen.getByRole('combobox');
    const closeButton = screen.getByRole('button', { name: 'Закрыть палитру' });

    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(closeButton).toHaveFocus();
  });
});
