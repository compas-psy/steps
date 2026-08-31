/**
 * `SegmentedControl` — по образцу СИМПАС (`?13`), см. `SegmentedControl.css`.
 *
 * Доступность: группа — `role="radiogroup"` с обязательным `label`
 * (доступное имя группы приносит вызывающий код, не сам пакет — ТЗ §3),
 * каждый сегмент — `role="radio"` с roving `tabIndex` (в tab-порядке
 * только активный сегмент, остальные достижимы стрелками — стандартный
 * паттерн ARIA APG для radiogroup, а не набор независимых кнопок).
 */
import { type KeyboardEvent, type ReactElement, type ReactNode, useRef } from 'react';

import type { IconName } from '../icons/index.js';
import { Icon } from './Icon.js';
import './SegmentedControl.css';

export interface SegmentOption<V extends string = string> {
  readonly value: V;
  readonly label: ReactNode;
  /** Декоративная иконка перед подписью. */
  readonly icon?: IconName;
}

export type SegmentedControlAccent = 'forest' | 'gold';

export interface SegmentedControlProps<V extends string = string> {
  readonly options: readonly SegmentOption<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  readonly accent?: SegmentedControlAccent;
  /** Доступное имя группы (`aria-label`) — обязателен: `radiogroup` без
   * имени неразличим для скринридера. */
  readonly label: string;
  readonly className?: string;
}

export function SegmentedControl<V extends string = string>({
  options,
  value,
  onChange,
  accent = 'forest',
  label,
  className,
}: SegmentedControlProps<V>): ReactElement {
  const groupRef = useRef<HTMLDivElement>(null);

  function focusOptionAt(index: number): void {
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.item(index)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const count = options.length;
    if (count === 0) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % count;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + count) % count;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = count - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      onChange(options[nextIndex]!.value);
      focusOptionAt(nextIndex);
    }
  }

  const classes = ['shagi-segmented', `shagi-segmented--${accent}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={groupRef} role="radiogroup" aria-label={label} className={classes}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className={[
              'shagi-segmented__option',
              active ? 'shagi-segmented__option--active' : null,
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.icon !== undefined && <Icon name={option.icon} size={16} />}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
