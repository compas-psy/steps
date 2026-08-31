import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TaskMenu } from '../../../src/components/task/index.js';

describe('TaskMenu', () => {
  it('не рендерится, пока open=false', () => {
    render(<TaskMenu open={false} onClose={() => {}} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('собирает секции в порядке частые → редкие → destructive, с разделителями между ними', () => {
    const onDelete = vi.fn();
    render(
      <TaskMenu
        open
        onClose={() => {}}
        frequentActions={[
          { key: 'complete', label: 'Выполнить' },
          { key: 'reschedule', label: 'Перепланировать' },
        ]}
        rareActions={[{ key: 'labels', label: 'Метки' }]}
        destructiveAction={{ key: 'delete', label: 'Удалить', onSelect: onDelete }}
      />,
    );

    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Выполнить',
      'Перепланировать',
      'Метки',
      'Удалить',
    ]);
    // Три секции → два разделителя (тот же паттерн, что базовый Menu).
    expect(screen.getAllByRole('separator')).toHaveLength(2);
  });

  it('destructiveAction всегда получает variant=destructive без явного указания вызывающим кодом', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <TaskMenu
        open
        onClose={() => {}}
        destructiveAction={{ key: 'delete', label: 'Удалить', onSelect: onDelete }}
      />,
    );

    const deleteItem = screen.getByRole('menuitem', { name: 'Удалить' });
    expect(deleteItem.className).toMatch(/--destructive/);

    await user.click(deleteItem);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('пустые секции (не заданы) не создают лишних разделителей', () => {
    render(
      <TaskMenu
        open
        onClose={() => {}}
        frequentActions={[{ key: 'complete', label: 'Выполнить' }]}
      />,
    );
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(screen.queryAllByRole('separator')).toHaveLength(0);
  });
});
