import type { Temporal } from '@js-temporal/polyfill';

import { isReminderAfterDeadline } from '../temporal/predicates.js';
import { buildResult, makeIssue, type ValidationIssue, type ValidationResult } from './types.js';

/**
 * Правило 34 (предупреждение): напоминание назначено после дедлайна
 * (`01§5`). Отдельный модуль от `task.ts`, потому что `reminders` —
 * самостоятельная сущность схемы (`02§2`), не поле `Task`; `Reminder.localRuleJson`
 * намеренно непрозрачен (см. `entities/reminder.ts`), поэтому валидатор
 * принимает уже распознанные дату/время explicit-напоминания, а не сырой
 * JSON — их разбор из `localRuleJson` не относится к валидатору (эту форму
 * определит команда, которая создаёт explicit reminder).
 *
 * Только `explicit`-напоминания несут собственную дату/время — `deadline_
 * approaching`/`deadline_missed` вычисляются от дедлайна по построению и не
 * могут оказаться "после" него в этом смысле (`01§18`), поэтому это правило
 * применимо только к explicit reminder.
 */
export interface ExplicitReminderValidationInput {
  readonly date: Temporal.PlainDate;
  readonly time: Temporal.PlainTime | null;
}

export interface ReminderTaskDeadline {
  readonly deadlineDate: Temporal.PlainDate | null;
  readonly deadlineTime: Temporal.PlainTime | null;
}

export function validateExplicitReminder(
  reminder: ExplicitReminderValidationInput,
  deadline: ReminderTaskDeadline,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (
    deadline.deadlineDate !== null &&
    isReminderAfterDeadline(
      reminder.date,
      reminder.time,
      deadline.deadlineDate,
      deadline.deadlineTime,
    )
  ) {
    issues.push(makeIssue(34, 'TEMPORAL_CONFLICT', 'warning', 'date'));
  }
  return buildResult(issues);
}
