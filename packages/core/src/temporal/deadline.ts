import { Temporal } from '@js-temporal/polyfill';

/** Конец локальных суток для date-only дедлайна (конспект §2, §3: "истекает
 * в 23:59:59.999") — правило интерпретации при классификации, не
 * блокирующий инвариант. */
const END_OF_DAY = Temporal.PlainTime.from('23:59:59.999');

/**
 * Момент, в который дедлайн фактически истекает, в плавающем локальном
 * времени. Дедлайн со временем использует это время буквально; date-only
 * дедлайн эквивалентен концу локальных суток (`01§5`).
 */
export function effectiveDeadlineDateTime(
  deadlineDate: Temporal.PlainDate,
  deadlineTime: Temporal.PlainTime | null,
): Temporal.PlainDateTime {
  return deadlineDate.toPlainDateTime(deadlineTime ?? END_OF_DAY);
}

/**
 * `now` (плавающее локальное "текущее" время) строго позже эффективного
 * дедлайна. Задача без дедлайна не может быть просрочена.
 */
export function isDeadlinePassed(
  deadlineDate: Temporal.PlainDate | null,
  deadlineTime: Temporal.PlainTime | null,
  now: Temporal.PlainDateTime,
): boolean {
  if (deadlineDate === null) {
    return false;
  }
  const effective = effectiveDeadlineDateTime(deadlineDate, deadlineTime);
  return Temporal.PlainDateTime.compare(now, effective) > 0;
}
