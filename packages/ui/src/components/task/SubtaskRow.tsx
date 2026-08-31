/**
 * `SubtaskRow` — то же, что `TaskRow`, но для подзадачи (пакет работ
 * E03.4): визуально компактнее и с отступом вложенности. Композиция поверх
 * `TaskRow`, а не отдельная реализация — подзадача разделяет весь набор
 * состояний/иконок/ARIA-логики родителя (§11 не выделяет для подзадач
 * отдельный список состояний), меняется только геометрия (`.css`).
 */
import type { ReactElement } from 'react';

import { TaskRow, type TaskRowProps } from './TaskRow.js';
import './SubtaskRow.css';

export type SubtaskRowProps = TaskRowProps;

export function SubtaskRow({ className, ...rest }: SubtaskRowProps): ReactElement {
  return (
    <TaskRow {...rest} className={['shagi-subtask-row', className].filter(Boolean).join(' ')} />
  );
}
