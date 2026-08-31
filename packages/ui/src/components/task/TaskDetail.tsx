/**
 * `TaskDetail` — контейнер полной карточки задачи (пакет работ E03.4).
 * Компонует уже готовые примитивы через именованные слоты (`header`,
 * `metadata`, `subtasks`, `checklist`, `actions`) — не хардкодит структуру
 * экрана (заголовки секций «Подзадачи»/«Чек-лист» и т.п. — продуктовый
 * текст, дело `packages/app` + `@shagi/i18n`, ТЗ §3). Секции разделяет
 * `../Divider.tsx` (E03.1), только когда обе стороны раздела реально
 * заданы — раздел не рисуется вокруг пустоты.
 */
import type { ReactElement, ReactNode } from 'react';

import { Divider } from '../Divider.js';
import './TaskDetail.css';

export interface TaskDetailProps {
  /** Заголовок карточки — обычно композиция `TaskCheckbox` + заголовок +
   * `TaskMenu`, собранная вызывающим кодом. */
  readonly header: ReactNode;
  /** Слот `TaskMetadata`. */
  readonly metadata?: ReactNode;
  /** Список `SubtaskRow`, уже собранный вызывающим кодом (включая
   * заголовок секции, если он нужен продукту). */
  readonly subtasks?: ReactNode;
  /** Список `ChecklistRow`. */
  readonly checklist?: ReactNode;
  /** Действия — кнопки/меню в подвале карточки. */
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function TaskDetail({
  header,
  metadata,
  subtasks,
  checklist,
  actions,
  className,
}: TaskDetailProps): ReactElement {
  return (
    <div className={['shagi-task-detail', className].filter(Boolean).join(' ')}>
      <div className="shagi-task-detail__header">{header}</div>
      {metadata !== undefined && <div className="shagi-task-detail__metadata">{metadata}</div>}
      {subtasks !== undefined && (
        <div className="shagi-task-detail__section">
          <Divider />
          <div className="shagi-task-detail__subtasks">{subtasks}</div>
        </div>
      )}
      {checklist !== undefined && (
        <div className="shagi-task-detail__section">
          <Divider />
          <div className="shagi-task-detail__checklist">{checklist}</div>
        </div>
      )}
      {actions !== undefined && (
        <div className="shagi-task-detail__section">
          <Divider />
          <div className="shagi-task-detail__actions">{actions}</div>
        </div>
      )}
    </div>
  );
}
