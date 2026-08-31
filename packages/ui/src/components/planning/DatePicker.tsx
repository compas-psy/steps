/**
 * `DatePicker` — календарная сетка выбора даты (E03.5). Работает с простыми
 * числами `CalendarDate`/`CalendarMonth` (`internal/calendarMath.ts`), не
 * `Temporal.PlainDate` — `packages/ui` не зависит от `@js-temporal/polyfill`
 * (пакет работ, раздел «Критическая архитектурная граница»). Единственная
 * арифметика месяца/дня недели живёт в `internal/calendarMath.ts` и нигде
 * не пересекается с temporal-моделью продукта.
 *
 * Локализация — целиком забота вызывающего кода: `weekdayLabels`
 * (7 подписей, уже в порядке, начинающемся с `weekStartsOn`) и
 * `monthLabels` (12 подписей) приходят пропсами, не хардкожены здесь —
 * компонент не «знает», что неделя начинается с понедельника, хотя ТЗ
 * (§8, `01_PRODUCT_BEHAVIOR_R1.md`) это требует: он получает это как
 * `weekStartsOn` снаружи.
 *
 * Доступность (§15): контейнер — `role="grid"` с обязательным `label`;
 * недели — `role="row"`; дни — `role="gridcell"` (кнопка) с `aria-selected`
 * на выбранной дате. Клавиатурная навигация — по образцу roving tabIndex
 * `SegmentedControl.tsx`, расширенному на два измерения: стрелки двигают
 * ТОЛЬКО клавиатурный фокус (визуальное «выделение» ячейки) в пределах
 * видимого месяца, реальный выбор фиксирует `Enter`/`Space`, вызывая
 * `onSelect` — так `value` (управляемый пропс) не меняется без явного
 * подтверждения, а фокус можно свободно листать. `PageUp`/`PageDown`
 * переключают видимый месяц, перенося фокус на тот же день (зажатый в
 * границах нового месяца). Выбранная дата дополнительно объявляется через
 * скрытый `aria-live`-регион — `aria-selected` в гриде не везде читается
 * скринридером как факт смены значения (в отличие от единственного
 * `role="option"`/`radio"`), явный live-регион не даёт полагаться на это.
 */
import { type KeyboardEvent, type ReactElement, useEffect, useRef, useState } from 'react';

import { IconButton } from '../IconButton.js';
import {
  type CalendarDate,
  type CalendarMonth,
  addMonths,
  clampDayInMonth,
  daysInMonth,
  isSameCalendarDate,
  leadingBlankCells,
} from './internal/calendarMath.js';
import './DatePicker.css';

export type { CalendarDate, CalendarMonth } from './internal/calendarMath.js';

type WeekdayLabels = readonly [string, string, string, string, string, string, string];
type MonthLabels = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

export interface DatePickerProps {
  /** Выбранная дата или `null` — ничего не выбрано. */
  readonly value: CalendarDate | null;
  /** Месяц/год, который сейчас показывает сетка (управляемый пропс — сам
   * компонент не хранит «текущий показанный месяц» неконтролируемо). */
  readonly visibleMonth: CalendarMonth;
  readonly onVisibleMonthChange: (month: CalendarMonth) => void;
  readonly onSelect: (date: CalendarDate) => void;
  /** Дата «сегодня» для визуальной отметки (`aria-current="date"`) —
   * приходит готовым `{ year, month, day }`, компонент её не вычисляет. */
  readonly today?: CalendarDate;
  /** 0=воскресенье…6=суббота — тот же индекс, что и `Date.getDay()`. */
  readonly weekStartsOn: number;
  readonly weekdayLabels: WeekdayLabels;
  readonly monthLabels: MonthLabels;
  /** Доступное имя сетки (`aria-label`). */
  readonly label: string;
  readonly previousMonthLabel: string;
  readonly nextMonthLabel: string;
  readonly className?: string;
}

export function DatePicker({
  value,
  visibleMonth,
  onVisibleMonthChange,
  onSelect,
  today,
  weekStartsOn,
  weekdayLabels,
  monthLabels,
  label,
  previousMonthLabel,
  nextMonthLabel,
  className,
}: DatePickerProps): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusedDay, setFocusedDay] = useState<number>(() =>
    value !== null && value.year === visibleMonth.year && value.month === visibleMonth.month
      ? value.day
      : 1,
  );

  // Видимый месяц сменился (клавиатурная навигация `PageUp`/`PageDown`,
  // клик по стрелке или внешний контроль вызывающим кодом) — держим
  // клавиатурный фокус на дне выбранной даты, если она попадает в этот
  // месяц, иначе зажимаем прежний день в границах нового месяца. `value`/
  // `focusedDay` читаются намеренно без объявления зависимостью: эффект
  // должен реагировать именно на смену видимого месяца, а не пересчитывать
  // фокус при любом изменении выбранной даты внутри уже показанного месяца
  // (это уже делает обработчик выбора). Ячейки грида переиспользуют один и
  // тот же DOM-узел между рендерами (ключ — позиция в неделе, не число),
  // поэтому фокус браузера обычно переживает смену месяца сам по себе; явный
  // перенос ниже — подстраховка на случай, когда позиция фокуса в новом
  // месяце оказывается пустой ячейкой (например уходит с 31 числа).
  useEffect(() => {
    const nextFocusedDay =
      value !== null && value.year === visibleMonth.year && value.month === visibleMonth.month
        ? value.day
        : clampDayInMonth(focusedDay, visibleMonth.year, visibleMonth.month);
    if (nextFocusedDay !== focusedDay) setFocusedDay(nextFocusedDay);
    if (gridRef.current?.contains(document.activeElement)) {
      focusDayCell(nextFocusedDay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- см. пояснение выше
  }, [visibleMonth.year, visibleMonth.month]);

  function focusDayCell(day: number): void {
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus();
  }

  function moveFocus(nextDay: number): void {
    const clamped = clampDayInMonth(nextDay, visibleMonth.year, visibleMonth.month);
    setFocusedDay(clamped);
    focusDayCell(clamped);
  }

  function changeMonth(delta: number): void {
    const nextMonth = addMonths(visibleMonth, delta);
    const nextDay = clampDayInMonth(focusedDay, nextMonth.year, nextMonth.month);
    // Оба обновления батчатся в один коммит — эффект выше видит уже
    // согласованные `visibleMonth`/`focusedDay` и при необходимости
    // подстраховочно переносит DOM-фокус (см. комментарий там).
    onVisibleMonthChange(nextMonth);
    setFocusedDay(nextDay);
  }

  function handleCellKeyDown(event: KeyboardEvent<HTMLButtonElement>, day: number): void {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        moveFocus(day + 1);
        return;
      case 'ArrowLeft':
        event.preventDefault();
        moveFocus(day - 1);
        return;
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(day + 7);
        return;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(day - 7);
        return;
      case 'Home':
        event.preventDefault();
        moveFocus(1);
        return;
      case 'End':
        event.preventDefault();
        moveFocus(daysInMonth(visibleMonth.year, visibleMonth.month));
        return;
      case 'PageUp':
        event.preventDefault();
        changeMonth(-1);
        return;
      case 'PageDown':
        event.preventDefault();
        changeMonth(1);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        onSelect({ year: visibleMonth.year, month: visibleMonth.month, day });
        return;
      default:
        return;
    }
  }

  const blanks = leadingBlankCells(visibleMonth.year, visibleMonth.month, weekStartsOn);
  const totalDays = daysInMonth(visibleMonth.year, visibleMonth.month);
  const cells: (number | null)[] = [
    ...Array.from({ length: blanks }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  const orderedWeekdayLabels = Array.from({ length: 7 }, (_, index) => {
    const sourceIndex = (weekStartsOn + index) % 7;
    return weekdayLabels[sourceIndex]!;
  });

  const selectedAnnouncement =
    value !== null ? `${value.day} ${monthLabels[value.month - 1]!} ${value.year}` : '';

  const classes = ['shagi-date-picker', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <div className="shagi-date-picker__header">
        <IconButton
          icon="chevron"
          label={previousMonthLabel}
          className="shagi-date-picker__nav shagi-date-picker__nav--prev"
          onClick={() => changeMonth(-1)}
        />
        <span className="shagi-date-picker__title">
          {monthLabels[visibleMonth.month - 1]} {visibleMonth.year}
        </span>
        <IconButton
          icon="chevron"
          label={nextMonthLabel}
          className="shagi-date-picker__nav shagi-date-picker__nav--next"
          onClick={() => changeMonth(1)}
        />
      </div>

      <div ref={gridRef} role="grid" aria-label={label} className="shagi-date-picker__grid">
        <div role="row" className="shagi-date-picker__weekday-row">
          {orderedWeekdayLabels.map((weekdayLabel, index) => (
            <span key={index} role="columnheader" className="shagi-date-picker__weekday">
              {weekdayLabel}
            </span>
          ))}
        </div>

        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} role="row" className="shagi-date-picker__week">
            {week.map((day, dayIndex) => {
              if (day === null) {
                return (
                  <span
                    key={dayIndex}
                    role="gridcell"
                    aria-hidden="true"
                    className="shagi-date-picker__cell shagi-date-picker__cell--empty"
                  />
                );
              }
              const cellDate: CalendarDate = {
                year: visibleMonth.year,
                month: visibleMonth.month,
                day,
              };
              const selected = isSameCalendarDate(value, cellDate);
              const isToday = today !== undefined && isSameCalendarDate(today, cellDate);
              const isFocusTarget = day === focusedDay;
              return (
                <button
                  key={dayIndex}
                  type="button"
                  role="gridcell"
                  data-day={day}
                  aria-selected={selected}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={`${day} ${monthLabels[visibleMonth.month - 1]} ${visibleMonth.year}`}
                  tabIndex={isFocusTarget ? 0 : -1}
                  className={[
                    'shagi-date-picker__cell',
                    selected ? 'shagi-date-picker__cell--selected' : null,
                    isToday ? 'shagi-date-picker__cell--today' : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    setFocusedDay(day);
                    onSelect(cellDate);
                  }}
                  onKeyDown={(event) => handleCellKeyDown(event, day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <span className="shagi-date-picker__announce" aria-live="polite">
        {selectedAnnouncement}
      </span>
    </div>
  );
}
