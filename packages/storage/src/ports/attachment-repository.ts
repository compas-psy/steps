import type { Attachment, Uuid } from '@shagi/core';

/** Только чтение — см. `task-repository.ts`. `Attachment` не несёт
 * `deleted_at`; `state='deleted'` — собственный жизненный цикл вложения
 * (`@shagi/core`, `entities/attachment.ts`), не общий tombstone-механизм
 * этого пакета (`../tombstone/tombstone.ts`). */
export interface AttachmentRepository {
  listByTask(taskId: Uuid): Promise<readonly Attachment[]>;

  /** Прямой вход для `TaskValidationContext.attachmentCount` (правило 21)
   * — считает вложения вне состояния `'deleted'`. */
  countActiveByTask(taskId: Uuid): Promise<number>;
}
