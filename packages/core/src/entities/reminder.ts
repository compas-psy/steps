import type { Uuid } from '../values.js';

export type ReminderKind = 'explicit' | 'deadline_approaching' | 'deadline_missed';

/**
 * `reminders` (`02§2`, `01§18`). Максимум 1 explicit на задачу в R1 UI —
 * §2 п.19, кросс-строчная проверка, забота валидатора.
 *
 * Нет `clocks`/`deleted_at` — в отличие от большинства сущностей, `02§2` их
 * для `reminders` не перечисляет: расписание пересчитывается локально на
 * каждый прогон reconciliation (`02§14`, `reconcileReminderSchedule`,
 * `@shagi/app`), а не мержится по полям синка.
 */
export interface Reminder {
  readonly id: Uuid;
  readonly taskId: Uuid;
  readonly kind: ReminderKind;
  /**
   * Параметризация правила: для `explicit` — заданные пользователем
   * дата/время (`01§18` "At configured local date/time"); для
   * `deadline_approaching`/`deadline_missed` — смещение от дедлайна,
   * рассчитанное по умолчаниям `01§18` в момент создания. Точная форма JSON
   * не зафиксирована в `02§2` за пределами имени поля — оставлена
   * непрозрачной, чтобы не изобретать контракт, которого нет в спеке;
   * конкретизация — задача команд, владеющих `reminders` (следующий пакет
   * работ).
   */
  readonly localRuleJson: Readonly<Record<string, unknown>>;
  readonly enabled: boolean;
  /** Синхронизируемый снимок ЖЕЛАЕМОГО расписания на момент последней
   * записи (`kind|firesAt|enabled|title`, `computeReminderFingerprint`,
   * `commands/reminder-fingerprint.ts`) — информационное поле, полезное
   * само по себе ("что, по мнению любого устройства, должно быть у этого
   * напоминания"). Reconciliation (`02§14`, `applyReconciliation`,
   * `@shagi/app`) это поле НИКОГДА не читает и не пишет — оно НЕ
   * доказательство того, что нативный планировщик какого-либо устройства
   * ему соответствует, не использовать его для такого вывода (Task A6;
   * подробности и разбор отклонённых альтернатив — `commands/
   * reminder-fingerprint.ts`). */
  readonly scheduledFingerprint: string;
}
