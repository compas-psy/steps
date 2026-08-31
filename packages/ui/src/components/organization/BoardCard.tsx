/**
 * `BoardCard` — карточка задачи на доске (§10 «Organization»: «компактная,
 * drag-состояние»; §11 Task states «Dragging»).
 *
 * Композиция поверх `Card` (`../Card.js`), а не новая реализация
 * интерактивности: `Card.interactive` уже даёт доступную кнопку с
 * правильной клавиатурой (Enter/Space, WAI-ARIA «div как кнопка», см.
 * заголовок `Card.tsx`) — `BoardCard` лишь добавляет компактный padding и
 * board-специфичные модификаторы `selected`/`dragging` поверх.
 *
 * `meta` — необязательный слот под строку метаданных (например `Priority`/
 * `Label` компактно под заголовком, как P2-бейдж в прототипе) — компонент
 * не решает, что там рендерить.
 */
import type { ReactElement, ReactNode } from 'react';

import { Card } from '../Card.js';
import './BoardCard.css';

export interface BoardCardProps {
  readonly children: ReactNode;
  /** Слот метаданных под заголовком (приоритет/метки/срок). */
  readonly meta?: ReactNode;
  readonly selected?: boolean;
  /** Визуальное состояние во время нативного HTML5 drag. */
  readonly dragging?: boolean;
  readonly onClick?: () => void;
  readonly className?: string;
}

export function BoardCard({
  children,
  meta,
  selected = false,
  dragging = false,
  onClick,
  className,
}: BoardCardProps): ReactElement {
  return (
    <div
      data-testid="board-card"
      className={[
        'shagi-board-card',
        selected ? 'shagi-board-card--selected' : null,
        dragging ? 'shagi-board-card--dragging' : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Card interactive={onClick !== undefined} onClick={onClick} padding="sm">
        <div className="shagi-board-card__title">{children}</div>
        {meta !== undefined && <div className="shagi-board-card__meta">{meta}</div>}
      </Card>
    </div>
  );
}
