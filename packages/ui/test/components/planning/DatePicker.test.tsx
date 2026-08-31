import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  type CalendarDate,
  type CalendarMonth,
  DatePicker,
} from '../../../src/components/planning/index.js';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
const MONTH_LABELS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

function ControlledDatePicker({
  initialValue = { year: 2026, month: 8, day: 15 },
  onSelect,
  onVisibleMonthChange,
}: {
  initialValue?: CalendarDate | null;
  onSelect?: (date: CalendarDate) => void;
  onVisibleMonthChange?: (month: CalendarMonth) => void;
}) {
  const [value, setValue] = useState<CalendarDate | null>(initialValue);
  const [visibleMonth, setVisibleMonth] = useState<CalendarMonth>({ year: 2026, month: 8 });

  return (
    <DatePicker
      value={value}
      visibleMonth={visibleMonth}
      onVisibleMonthChange={(month) => {
        setVisibleMonth(month);
        onVisibleMonthChange?.(month);
      }}
      onSelect={(date) => {
        setValue(date);
        onSelect?.(date);
      }}
      weekStartsOn={1}
      weekdayLabels={WEEKDAY_LABELS}
      monthLabels={MONTH_LABELS}
      label="Выбор даты"
      previousMonthLabel="Предыдущий месяц"
      nextMonthLabel="Следующий месяц"
    />
  );
}

describe('DatePicker', () => {
  it('рендерится как grid с доступным именем и заголовком видимого месяца', () => {
    render(<ControlledDatePicker />);
    expect(screen.getByRole('grid', { name: 'Выбор даты' })).toBeInTheDocument();
    expect(screen.getByText('Август 2026')).toBeInTheDocument();
  });

  it('клик по ячейке дня вызывает onSelect и помечает её как выбранную', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ControlledDatePicker onSelect={onSelect} />);

    const cell20 = screen.getByRole('gridcell', { name: '20 Август 2026' });
    await user.click(cell20);

    expect(onSelect).toHaveBeenCalledWith({ year: 2026, month: 8, day: 20 });
    expect(cell20).toHaveAttribute('aria-selected', 'true');
  });

  it('стрелка вправо двигает клавиатурный фокус на следующий день, не меняя выбор', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ControlledDatePicker onSelect={onSelect} />);

    const cell15 = screen.getByRole('gridcell', { name: '15 Август 2026' });
    cell15.focus();
    await user.keyboard('{ArrowRight}');

    const cell16 = screen.getByRole('gridcell', { name: '16 Август 2026' });
    expect(cell16).toHaveFocus();
    expect(cell16).toHaveAttribute('aria-selected', 'false');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Enter на сфокусированной ячейке реально выбирает дату', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ControlledDatePicker onSelect={onSelect} />);

    const cell15 = screen.getByRole('gridcell', { name: '15 Август 2026' });
    cell15.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{Enter}');

    expect(onSelect).toHaveBeenCalledWith({ year: 2026, month: 8, day: 17 });
    const cell17 = screen.getByRole('gridcell', { name: '17 Август 2026' });
    expect(cell17).toHaveAttribute('aria-selected', 'true');
  });

  it('стрелка вниз двигает фокус на 7 дней вперёд', async () => {
    const user = userEvent.setup();
    render(<ControlledDatePicker />);

    const cell15 = screen.getByRole('gridcell', { name: '15 Август 2026' });
    cell15.focus();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('gridcell', { name: '22 Август 2026' })).toHaveFocus();
  });

  it('Home/End переносят фокус на первый/последний день месяца', async () => {
    const user = userEvent.setup();
    render(<ControlledDatePicker />);

    const cell15 = screen.getByRole('gridcell', { name: '15 Август 2026' });
    cell15.focus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('gridcell', { name: '1 Август 2026' })).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('gridcell', { name: '31 Август 2026' })).toHaveFocus();
  });

  it('кнопки навигации переключают видимый месяц (заголовок и подписи ячеек)', async () => {
    const user = userEvent.setup();
    const onVisibleMonthChange = vi.fn();
    render(<ControlledDatePicker onVisibleMonthChange={onVisibleMonthChange} />);

    await user.click(screen.getByRole('button', { name: 'Следующий месяц' }));

    expect(onVisibleMonthChange).toHaveBeenCalledWith({ year: 2026, month: 9 });
    expect(screen.getByText('Сентябрь 2026')).toBeInTheDocument();
  });

  it('объявляет выбранную дату через скрытый aria-live-регион', async () => {
    const user = userEvent.setup();
    render(<ControlledDatePicker />);

    const cell20 = screen.getByRole('gridcell', { name: '20 Август 2026' });
    await user.click(cell20);

    expect(screen.getByText('20 Август 2026')).toBeInTheDocument();
  });
});
