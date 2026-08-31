import type { TaskLink, Uuid } from '@shagi/core';

/** Только чтение — см. `task-repository.ts`. `TaskLink` не несёт
 * `deleted_at` — удаление жёсткое. */
export interface TaskLinkRepository {
  listByTask(taskId: Uuid): Promise<readonly TaskLink[]>;

  /** Прямой вход для `TaskValidationContext.linkCount` (правило 20). */
  countByTask(taskId: Uuid): Promise<number>;
}
