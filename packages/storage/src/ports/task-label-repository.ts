import type { TaskLabel, Uuid } from '@shagi/core';

/**
 * Только чтение — `task_labels` не имеет `deleted_at`/`id`, существование
 * связи вычисляется из HLC (`isTaskLabelActive`, `@shagi/core`). Одна пара
 * `(taskId, labelId)` — ровно одна строка на весь срок жизни связи:
 * повторное "добавление" после "удаления" обновляет `addHlc`/`removeHlc`
 * этой же строки, а не создаёт новую (OR-set по значению двух полей одной
 * записи, `02§8`, а не по множеству исторических версий) — поэтому "запись"
 * сюда через `applyMutation` это upsert по первичному ключу `(taskId, labelId)`.
 */
export interface TaskLabelRepository {
  /** Индекс `task_labels(task_id)` — включая мёртвые по HLC связи;
   * фильтрация активности — забота вызывающего (`isTaskLabelActive`). */
  listByTask(taskId: Uuid): Promise<readonly TaskLabel[]>;

  /** Индекс `task_labels(label_id)`. */
  listByLabel(labelId: Uuid): Promise<readonly TaskLabel[]>;

  /** Число активных (по HLC, `isTaskLabelActive`) связей задачи — прямой
   * вход для `TaskValidationContext.labelCount` (правило 18). */
  countActiveByTask(taskId: Uuid): Promise<number>;
}
