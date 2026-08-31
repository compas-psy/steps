import type { ChecklistItem, Uuid } from '@shagi/core';

/** Только чтение — см. `task-repository.ts`. */
export interface ChecklistItemRepository {
  /** Живые пункты задачи, упорядочены по `rank`. */
  listByTask(taskId: Uuid): Promise<readonly ChecklistItem[]>;

  /** Прямой вход для `TaskValidationContext.checklistItemCount` (правило 17). */
  countActiveByTask(taskId: Uuid): Promise<number>;
}
