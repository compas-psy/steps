import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Tabs, type TabItem } from '../../../src/components/navigation/index.js';

const ITEMS: readonly TabItem[] = [
  { value: 'list', label: 'Список', panel: <p>Содержимое списка</p> },
  { value: 'board', label: 'Доска', panel: <p>Содержимое доски</p> },
  { value: 'archive', label: 'Архив', disabled: true, panel: <p>Архив</p> },
];

function ControlledTabs({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('list');
  return (
    <Tabs
      items={ITEMS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      label="Вид проекта"
    />
  );
}

describe('Tabs', () => {
  it('рендерится как tablist/tab/tabpanel с корректной связкой ролей', () => {
    render(<ControlledTabs />);

    const tablist = screen.getByRole('tablist', { name: 'Вид проекта' });
    expect(tablist).toBeInTheDocument();

    const listTab = screen.getByRole('tab', { name: 'Список' });
    expect(listTab).toHaveAttribute('aria-selected', 'true');

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Содержимое списка');
    expect(panel).toHaveAttribute('aria-labelledby', listTab.id);
    expect(listTab).toHaveAttribute('aria-controls', panel.id);
  });

  it('roving tabindex: в tab-порядке только активная вкладка', () => {
    render(<ControlledTabs />);
    expect(screen.getByRole('tab', { name: 'Список' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Доска' })).toHaveAttribute('tabindex', '-1');
  });

  it('клик по вкладке переключает выбор и показанную панель', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledTabs onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: 'Доска' }));

    expect(onChange).toHaveBeenCalledWith('board');
    expect(screen.getByRole('tab', { name: 'Доска' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Содержимое доски');
  });

  it('стрелка вправо переключает на следующую вкладку и переносит фокус', async () => {
    const user = userEvent.setup();
    render(<ControlledTabs />);

    screen.getByRole('tab', { name: 'Список' }).focus();
    await user.keyboard('{ArrowRight}');

    const board = screen.getByRole('tab', { name: 'Доска' });
    expect(board).toHaveAttribute('aria-selected', 'true');
    expect(board).toHaveFocus();
  });

  it('стрелка влево от первой вкладки циклически огибает отключённую и попадает на последнюю доступную', async () => {
    const user = userEvent.setup();
    render(<ControlledTabs />);

    screen.getByRole('tab', { name: 'Список' }).focus();
    await user.keyboard('{ArrowLeft}');

    // «Архив» отключён — стрелочная навигация пропускает его (ARIA APG),
    // фокус попадает на ближайшую доступную вкладку перед ним.
    expect(screen.getByRole('tab', { name: 'Доска' })).toHaveFocus();
  });

  it('отключённая вкладка помечена disabled и не активируется по клику', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledTabs onChange={onChange} />);

    const archive = screen.getByRole('tab', { name: 'Архив' });
    expect(archive).toBeDisabled();

    await user.click(archive);
    expect(onChange).not.toHaveBeenCalled();
  });
});
