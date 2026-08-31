import type { Reminder, Uuid } from '@shagi/core';

/** Только чтение — см. `task-repository.ts`. `Reminder` не несёт
 * `deleted_at`/`clocks` (`@shagi/core`, `entities/reminder.ts`) — удаление
 * жёсткое, не tombstone. */
export interface ReminderRepository {
  listByTask(taskId: Uuid): Promise<readonly Reminder[]>;

  /** Прямой вход для `TaskValidationContext.explicitReminderCount`
   * (правило 19) — считает только `kind='explicit'`. */
  countExplicitByTask(taskId: Uuid): Promise<number>;
}
