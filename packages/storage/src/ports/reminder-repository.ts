import type { Reminder, Uuid } from '@shagi/core';

/** Только чтение — см. `task-repository.ts`. `Reminder` не несёт
 * `deleted_at`/`clocks` (`@shagi/core`, `entities/reminder.ts`) — удаление
 * жёсткое, не tombstone. */
export interface ReminderRepository {
  listByTask(taskId: Uuid): Promise<readonly Reminder[]>;

  /** Прямой вход для `TaskValidationContext.explicitReminderCount`
   * (правило 19) — считает только `kind='explicit'`. */
  countExplicitByTask(taskId: Uuid): Promise<number>;

  /**
   * Все включённые напоминания рабочего пространства, вне зависимости от
   * задачи (`02§14` reconciliation, Task A3 `@shagi/app`). Без этого метода
   * реконсиляция была бы вынуждена сначала перечислить ВСЕ задачи (которых
   * на порядок больше, чем включённых напоминаний), а для каждой дёргать
   * `listByTask` — N+1 по задачам. Здесь N+1 остаётся только по
   * напоминаниям (запрос задачи/проекта на каждое), что на порядки дешевле,
   * т.к. `enabled`-напоминаний обычно единицы даже при сотнях задач.
   */
  listAllEnabled(): Promise<readonly Reminder[]>;
}
