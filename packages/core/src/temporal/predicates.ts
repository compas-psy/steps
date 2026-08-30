import { Temporal } from '@js-temporal/polyfill';

import type { DurationMinutes } from '../values.js';
import { effectiveDeadlineDateTime } from './deadline.js';

/**
 * Предикаты temporal-модели (конспект §2, §3; `01§5`) — блокирующие и
 * warning-проверки как чистые функции. Они возвращают `boolean`, а не
 * решение "reject/save-with-warning" — решение, что делать с результатом
 * (отклонить, показать предупреждение), принимает будущий общий валидатор
 * (`00§7.1`, `02§11.1`), который не входит в этот пакет работ. Здесь —
 * только сама temporal-семантика, применимая и к валидатору, и к любому UI,
 * которому нужно показать live-подсказку до сохранения.
 */

/** §2 п.3, блокирующий: `planned_date < available_from`. Граница
 * включительна — план ровно в день доступности не конфликтует. */
export function isAvailableFromConflict(
  plannedDate: Temporal.PlainDate | null,
  availableFrom: Temporal.PlainDate | null,
): boolean {
  if (plannedDate === null || availableFrom === null) {
    return false;
  }
  return Temporal.PlainDate.compare(plannedDate, availableFrom) < 0;
}

/** §2 п.4, блокирующий: `deadline < начало дня available_from`. Сравнение
 * идёт по дате дедлайна (не по эффективному concу дня) — начало дня
 * `available_from`, а не миллисекунда, названа в спеке буквально. */
export function isDeadlineBeforeAvailableFrom(
  deadlineDate: Temporal.PlainDate | null,
  _deadlineTime: Temporal.PlainTime | null,
  availableFrom: Temporal.PlainDate | null,
): boolean {
  if (deadlineDate === null || availableFrom === null) {
    return false;
  }
  return Temporal.PlainDate.compare(deadlineDate, availableFrom) < 0;
}

/** §2 п.32, warning: `planned > deadline`. Сравнение — по эффективному
 * моменту дедлайна (date-only → конец дня), planned — по своему
 * плавающему локальному времени (отсутствие времени = начало дня). */
export function isPlannedAfterDeadline(
  plannedDate: Temporal.PlainDate | null,
  plannedTime: Temporal.PlainTime | null,
  deadlineDate: Temporal.PlainDate | null,
  deadlineTime: Temporal.PlainTime | null,
): boolean {
  if (plannedDate === null || deadlineDate === null) {
    return false;
  }
  const plannedDateTime = plannedDate.toPlainDateTime(
    plannedTime ?? Temporal.PlainTime.from('00:00'),
  );
  const effectiveDeadline = effectiveDeadlineDateTime(deadlineDate, deadlineTime);
  return Temporal.PlainDateTime.compare(plannedDateTime, effectiveDeadline) > 0;
}

/** §2 п.33, warning: `planned_time + duration` заканчивается после
 * дедлайна. Без planned_time или без duration сравнивать нечего — предмет
 * предупреждения не возникает (валидная комбинация §2 п.35: Duration без
 * Time не участвует в этом расчёте). */
export function doesDurationCrossDeadline(
  plannedDate: Temporal.PlainDate | null,
  plannedTime: Temporal.PlainTime | null,
  durationMin: DurationMinutes | null,
  deadlineDate: Temporal.PlainDate | null,
  deadlineTime: Temporal.PlainTime | null,
): boolean {
  if (
    plannedDate === null ||
    plannedTime === null ||
    durationMin === null ||
    deadlineDate === null
  ) {
    return false;
  }
  const start = plannedDate.toPlainDateTime(plannedTime);
  const end = start.add({ minutes: durationMin });
  const effectiveDeadline = effectiveDeadlineDateTime(deadlineDate, deadlineTime);
  return Temporal.PlainDateTime.compare(end, effectiveDeadline) > 0;
}

/** §2 п.34, warning: напоминание назначено после дедлайна. */
export function isReminderAfterDeadline(
  reminderDate: Temporal.PlainDate,
  reminderTime: Temporal.PlainTime | null,
  deadlineDate: Temporal.PlainDate,
  deadlineTime: Temporal.PlainTime | null,
): boolean {
  const reminderDateTime = reminderDate.toPlainDateTime(
    reminderTime ?? Temporal.PlainTime.from('00:00'),
  );
  const effectiveDeadline = effectiveDeadlineDateTime(deadlineDate, deadlineTime);
  return Temporal.PlainDateTime.compare(reminderDateTime, effectiveDeadline) > 0;
}
