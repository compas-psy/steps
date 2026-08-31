import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TimePicker, type TimeValue } from '../../../src/components/planning/index.js';

function ControlledTimePicker({
  initialValue = null,
  onSelect,
}: {
  initialValue?: TimeValue | null;
  onSelect?: (time: TimeValue) => void;
}) {
  const [value, setValue] = useState<TimeValue | null>(initialValue);
  return (
    <TimePicker
      value={value}
      onSelect={(time) => {
        setValue(time);
        onSelect?.(time);
      }}
      label="Выбор времени"
      hourListLabel="Часы"
      minuteListLabel="Минуты"
    />
  );
}

describe('TimePicker', () => {
  it('рендерится как группа с двумя listbox — часы и минуты', () => {
    render(<ControlledTimePicker />);
    expect(screen.getByRole('group', { name: 'Выбор времени' })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Часы' })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Минуты' })).toBeInTheDocument();
  });

  it('часы отрендерены как 24 пункта с ведущим нулём, минуты — с шагом по умолчанию 5', () => {
    render(<ControlledTimePicker />);
    const hourList = screen.getByRole('listbox', { name: 'Часы' });
    const minuteList = screen.getByRole('listbox', { name: 'Минуты' });

    expect(within(hourList).getByRole('option', { name: '00' })).toBeInTheDocument();
    expect(within(hourList).getByRole('option', { name: '23' })).toBeInTheDocument();
    expect(within(hourList).getAllByRole('option')).toHaveLength(24);

    expect(within(minuteList).getByRole('option', { name: '05' })).toBeInTheDocument();
    expect(within(minuteList).queryByRole('option', { name: '07' })).not.toBeInTheDocument();
    expect(within(minuteList).getAllByRole('option')).toHaveLength(12);
  });

  it('клик по часу и по минуте вызывает onSelect с обеими частями времени', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ControlledTimePicker onSelect={onSelect} />);

    await user.click(screen.getByRole('option', { name: '09' }));
    expect(onSelect).toHaveBeenLastCalledWith({ hour: 9, minute: 0 });

    await user.click(screen.getByRole('option', { name: '30' }));
    expect(onSelect).toHaveBeenLastCalledWith({ hour: 9, minute: 30 });
  });

  it('стрелка вниз двигает клавиатурный фокус на следующий пункт списка часов', async () => {
    const user = userEvent.setup();
    render(<ControlledTimePicker initialValue={{ hour: 9, minute: 0 }} />);
    const hourList = screen.getByRole('listbox', { name: 'Часы' });

    within(hourList).getByRole('option', { name: '09' }).focus();
    await user.keyboard('{ArrowDown}');

    expect(within(hourList).getByRole('option', { name: '10' })).toHaveFocus();
  });

  it('Enter на сфокусированном пункте реально выбирает значение', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ControlledTimePicker initialValue={{ hour: 9, minute: 0 }} onSelect={onSelect} />);

    screen.getByRole('option', { name: '09' }).focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onSelect).toHaveBeenCalledWith({ hour: 11, minute: 0 });
    expect(screen.getByRole('option', { name: '11' })).toHaveAttribute('aria-selected', 'true');
  });
});
