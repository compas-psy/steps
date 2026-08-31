/**
 * `BoardColumn` — колонка Kanban-подобной доски (§10 «Organization»,
 * прототип `[R1][D][09] Project / Board` — 4 колонки «Идеи/Сделать/В
 * работе/Финал», каждая: капс-лок заголовок + счётчик, список карточек).
 *
 * Карточки приходят через `children` (обычно `BoardCard`), компонент не
 * знает про задачи/статусы — колонка это просто заголовок + список,
 * порядок и состав определяет вызывающий код.
 *
 * `isDropTarget` — визуальный флаг «сюда сейчас можно бросить карточку»;
 * какая колонка становится drop-целью при drag over — решает вызывающий
 * код (обработчик `onDragOver`/`onDrop` на самой колонке, проброшенный
 * через пропсы), сам компонент HTML5-DnD не реализует, только принимает
 * готовые обработчики — тот же принцип, что `ProjectRow` (см. его
 * заголовок файла).
 */
import type { DragEventHandler, ReactElement, ReactNode } from 'react';

import './BoardColumn.css';

export interface BoardColumnProps {
  readonly title: ReactNode;
  /** Счётчик карточек в колонке — уже отформатированный вызывающим кодом. */
  readonly count?: ReactNode;
  readonly children?: ReactNode;
  /** Визуальная подсветка активной drop-цели во время drag over. */
  readonly isDropTarget?: boolean;
  readonly onDragOver?: DragEventHandler<HTMLDivElement>;
  readonly onDrop?: DragEventHandler<HTMLDivElement>;
  readonly className?: string;
}

export function BoardColumn({
  title,
  count,
  children,
  isDropTarget = false,
  onDragOver,
  onDrop,
  className,
}: BoardColumnProps): ReactElement {
  return (
    <div
      data-testid="board-column"
      className={[
        'shagi-board-column',
        isDropTarget ? 'shagi-board-column--drop-target' : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="shagi-board-column__header">
        <span className="shagi-board-column__title">{title}</span>
        {count !== undefined && <span className="shagi-board-column__count">{count}</span>}
      </div>
      <div className="shagi-board-column__cards">{children}</div>
    </div>
  );
}
