import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedControl } from '../../src/index.js';

const OPTIONS = [
  { value: 'list', label: 'Список' },
  { value: 'board', label: 'Доска' },
] as const;

function ControlledSegmented({
  onChange,
}: {
  onChange?: (value: (typeof OPTIONS)[number]['value']) => void;
}) {
  const [value, setValue] = useState<(typeof OPTIONS)[number]['value']>('list');
  return (
    <SegmentedControl
      options={OPTIONS}
      value={value}
      label="Вид проекта"
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('SegmentedControl', () => {
  it('рендерится как radiogroup с доступным именем и radio-опциями', () => {
    render(<ControlledSegmented />);
    expect(screen.getByRole('radiogroup', { name: 'Вид проекта' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Список' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Доска' })).toHaveAttribute('aria-checked', 'false');
  });

  it('клик по опции переключает выбор', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledSegmented onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: 'Доска' }));

    expect(onChange).toHaveBeenCalledWith('board');
    expect(screen.getByRole('radio', { name: 'Доска' })).toHaveAttribute('aria-checked', 'true');
  });

  it('roving tabindex: в tab-порядке только активная опция', () => {
    render(<ControlledSegmented />);
    expect(screen.getByRole('radio', { name: 'Список' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Доска' })).toHaveAttribute('tabindex', '-1');
  });

  it('стрелка вправо переключает на следующую опцию и переносит фокус', async () => {
    const user = userEvent.setup();
    render(<ControlledSegmented />);

    screen.getByRole('radio', { name: 'Список' }).focus();
    await user.keyboard('{ArrowRight}');

    const board = screen.getByRole('radio', { name: 'Доска' });
    expect(board).toHaveAttribute('aria-checked', 'true');
    expect(board).toHaveFocus();
  });
});
