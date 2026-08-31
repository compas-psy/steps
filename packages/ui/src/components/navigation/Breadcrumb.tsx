/**
 * `Breadcrumb` — навигационная хлебная крошка (§10 «Navigation»). Паттерн
 * ARIA APG «Breadcrumb»: `nav[aria-label]` → `ol` → `li`, последний пункт —
 * текущая страница (`aria-current="page"`, не кликабелен), остальные —
 * кнопки, разделитель — декоративная иконка `chevron` (`aria-hidden`,
 * повёрнута на 90° CSS-трансформом — тот же приём «один глиф, поворот у
 * потребителя», что описан в комментарии к самой иконке в `icons/contours.ts`).
 */
import type { ReactElement, ReactNode } from 'react';

import { Icon } from '../Icon.js';
import './Breadcrumb.css';

export interface BreadcrumbItem<V extends string = string> {
  readonly value: V;
  readonly label: ReactNode;
}

export interface BreadcrumbProps<V extends string = string> {
  /** Упорядоченный путь, последний элемент — текущая страница. */
  readonly items: readonly BreadcrumbItem<V>[];
  /** Клик по любому пункту, кроме последнего (текущего). */
  readonly onSelect: (value: V) => void;
  /** Доступное имя лендмарка `nav`. */
  readonly label: string;
  readonly className?: string;
}

export function Breadcrumb<V extends string = string>({
  items,
  onSelect,
  label,
  className,
}: BreadcrumbProps<V>): ReactElement {
  const lastIndex = items.length - 1;

  return (
    <nav aria-label={label} className={['shagi-breadcrumb', className].filter(Boolean).join(' ')}>
      <ol className="shagi-breadcrumb__list">
        {items.map((item, index) => {
          const isCurrent = index === lastIndex;
          return (
            <li key={item.value} className="shagi-breadcrumb__item">
              {isCurrent ? (
                <span className="shagi-breadcrumb__current" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <button
                  type="button"
                  className="shagi-breadcrumb__link"
                  onClick={() => onSelect(item.value)}
                >
                  {item.label}
                </button>
              )}
              {!isCurrent && (
                <span className="shagi-breadcrumb__separator" aria-hidden="true">
                  <Icon name="chevron" size={14} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
