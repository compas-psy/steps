/**
 * `TimePicker` — выбор времени (часы:минуты). Работает с простыми числами
 * `{ hour: 0–23, minute: 0–59 }`, не `Temporal.PlainTime` — та же граница,
 * что и у `DatePicker.tsx` (перевод в/из доменной temporal-модели —
 * ответственность вызывающего кода). Цифры часов/минут рендерятся как
 * есть (`String(n).padStart(2, '0')`) — это не форматирование под locale
 * (12/24-часовой формат, AM/PM), а обязательный паддинг разрядов у самого
 * числа, без которого сетка минут визуально «прыгает» (9 vs 09).
 *
 * Два независимых списка (`role="listbox"`) — по образцу, который ARIA APG
 * называет «grid analog» для линейных наборов дискретных значений (в
 * отличие от `DatePicker`, тут нет естественной двумерной сетки: часы и
 * минуты — два независимых измерения одного значения, не строки/столбцы
 * одной таблицы). Доступность — тот же принцип, что у `DatePicker`:
 * стрелки `ArrowUp`/`ArrowDown` двигают ТОЛЬКО клавиатурный фокус внутри
 * списка, `Enter`/`Space` фиксирует выбор (`onSelect`), `Home`/`End`
 * прыгают к первому/последнему значению списка.
 */
import { type KeyboardEvent, type ReactElement, useRef, useState } from 'react';

import './TimePicker.css';

export interface TimeValue {
  readonly hour: number; // 0–23
  readonly minute: number; // 0–59
}

export interface TimePickerProps {
  readonly value: TimeValue | null;
  readonly onSelect: (time: TimeValue) => void;
  /** Шаг минут в списке (по умолчанию 5 — 12 пунктов вместо 60). */
  readonly minuteStep?: number;
  /** Доступное имя всего компонента (обёртки над обоими списками). */
  readonly label: string;
  readonly hourListLabel: string;
  readonly minuteListLabel: string;
  readonly className?: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

interface DialProps {
  readonly label: string;
  readonly values: readonly number[];
  readonly selected: number | null;
  readonly onCommit: (value: number) => void;
}

function Dial({ label, values, selected, onCommit }: DialProps): ReactElement {
  const listRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(() => {
    if (selected === null) return 0;
    const index = values.indexOf(selected);
    return index === -1 ? 0 : index;
  });

  function focusOptionAt(index: number): void {
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]').item(index)?.focus();
  }

  function moveFocus(index: number): void {
    const clamped = Math.min(Math.max(index, 0), values.length - 1);
    setFocusedIndex(clamped);
    focusOptionAt(clamped);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(index + 1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(index - 1);
        return;
      case 'Home':
        event.preventDefault();
        moveFocus(0);
        return;
      case 'End':
        event.preventDefault();
        moveFocus(values.length - 1);
        return;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const value = values[index];
        if (value !== undefined) onCommit(value);
        return;
      }
      default:
        return;
    }
  }

  return (
    <div ref={listRef} role="listbox" aria-label={label} className="shagi-time-picker__dial">
      {values.map((value, index) => {
        const isSelected = value === selected;
        const isFocusTarget = index === focusedIndex;
        return (
          <button
            key={value}
            type="button"
            role="option"
            aria-selected={isSelected}
            tabIndex={isFocusTarget ? 0 : -1}
            className={[
              'shagi-time-picker__option',
              isSelected ? 'shagi-time-picker__option--selected' : null,
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              setFocusedIndex(index);
              onCommit(value);
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {pad2(value)}
          </button>
        );
      })}
    </div>
  );
}

export function TimePicker({
  value,
  onSelect,
  minuteStep = 5,
  label,
  hourListLabel,
  minuteListLabel,
  className,
}: TimePickerProps): ReactElement {
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const minuteCount = Math.ceil(60 / minuteStep);
  const minutes = Array.from({ length: minuteCount }, (_, index) => index * minuteStep);

  const classes = ['shagi-time-picker', className].filter(Boolean).join(' ');

  return (
    <div role="group" aria-label={label} className={classes}>
      <Dial
        label={hourListLabel}
        values={hours}
        selected={value?.hour ?? null}
        onCommit={(hour) => onSelect({ hour, minute: value?.minute ?? 0 })}
      />
      <span className="shagi-time-picker__separator" aria-hidden="true">
        :
      </span>
      <Dial
        label={minuteListLabel}
        values={minutes}
        selected={value?.minute ?? null}
        onCommit={(minute) => onSelect({ hour: value?.hour ?? 0, minute })}
      />
    </div>
  );
}
