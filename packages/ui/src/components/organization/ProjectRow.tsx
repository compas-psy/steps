/**
 * `ProjectRow` — строка проекта в списке (§10 «Organization», §9 «Sidebar:
 * … → Проекты»). Структурный паттерн — тот же, что пункт `Sidebar`
 * (`<li><button>…</button></li>`, `navigation/Sidebar.tsx`): список строк
 * проектов рендерит вызывающий код в `<ul>`, `ProjectRow` — один пункт.
 *
 * Состояния §11 «Default/Hover/Pressed/Focus/Selected/Dragging»:
 * - Hover/Pressed/Focus — CSS-псевдоклассы кнопки, не требуют пропсов;
 * - Selected — булев пропс, структурная разница через класс на кнопке
 *   (жирнее подпись + заливка, не только цвет — тот же приём, что
 *   `Sidebar.item--active`, §11 «state never color-only»);
 * - Dragging — булев пропс, класс на `<li>` (не на кнопке): во время
 *   нативного HTML5 drag браузер снимает «снимок» перетаскиваемого узла —
 *   визуальный эффект (прозрачность/тень) должен жить на контейнере
 *   списка, а не только на внутренней кнопке.
 *
 * Drag-переупорядочивание — вне периметра этого компонента (ТЗ этого
 * пакета работ: «никакой бизнес-логики… drag-and-drop
 * reordering-алгоритм»). `ProjectRow` лишь помечает `<li draggable>` и
 * прокидывает нативные `onDragStart/onDragEnd/onDragOver/onDrop` наружу —
 * расчёт нового порядка (индексы, вставка) делает вызывающий код
 * (`packages/app`), ровно как `Chip.onClick`/`Menu.onClose` не содержат
 * логики того, что произойдёт по клику.
 *
 * Маркер цвета — контролируемый enum `MarkerColor` (7 значений §4.1),
 * default `'forest'` (§4.1: «Default forest»), не свободный hex/color
 * picker.
 */
import {
  type DragEventHandler,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from 'react';

import type { MarkerColor } from './internal/markerColor.js';
import './ProjectRow.css';

export interface ProjectRowProps {
  readonly name: ReactNode;
  /** Маркер цвета проекта (§4.1 «R1 Project marker palette»). По умолчанию forest. */
  readonly color?: MarkerColor;
  /** Счётчик задач проекта — уже отформатированный вызывающим кодом (i18n/plural). */
  readonly taskCount?: ReactNode;
  readonly selected?: boolean;
  /** Визуальное состояние во время нативного HTML5 drag — см. заголовок файла. */
  readonly dragging?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: MouseEventHandler<HTMLButtonElement>;
  readonly draggable?: boolean;
  readonly onDragStart?: DragEventHandler<HTMLLIElement>;
  readonly onDragEnd?: DragEventHandler<HTMLLIElement>;
  readonly onDragOver?: DragEventHandler<HTMLLIElement>;
  readonly onDrop?: DragEventHandler<HTMLLIElement>;
  readonly className?: string;
}

export function ProjectRow({
  name,
  color = 'forest',
  taskCount,
  selected = false,
  dragging = false,
  disabled = false,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  className,
}: ProjectRowProps): ReactElement {
  return (
    <li
      className={['shagi-project-row', dragging ? 'shagi-project-row--dragging' : null, className]
        .filter(Boolean)
        .join(' ')}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <button
        type="button"
        className={[
          'shagi-project-row__button',
          selected ? 'shagi-project-row__button--selected' : null,
        ]
          .filter(Boolean)
          .join(' ')}
        disabled={disabled}
        onClick={onClick}
      >
        <span
          data-testid="project-row-marker"
          aria-hidden="true"
          className={`shagi-project-row__marker shagi-project-row__marker--${color}`}
        />
        <span className="shagi-project-row__name">{name}</span>
        {taskCount !== undefined && <span className="shagi-project-row__count">{taskCount}</span>}
      </button>
    </li>
  );
}
