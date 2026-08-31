/**
 * Чистые Temporal-вычисления грамматики (`01§4` "Date shortcut semantics",
 * "Weekday"). Никакого `Date` — только `@js-temporal/polyfill`, как и весь
 * остальной домен (CLAUDE.md "Время").
 *
 * ISO-нумерация дня недели домена (`Temporal.PlainDate#dayOfWeek`):
 * 1=понедельник .. 7=воскресенье. Используется и здесь, и в
 * `RecurrenceChipValue.byWeekday` — единая система на весь пакет.
 */

import { Temporal } from '@js-temporal/polyfill';

/**
 * "Выходные → today if Saturday/Sunday, otherwise nearest Saturday"
 * (`01_PRODUCT_BEHAVIOR_R1.md` §4 "Date shortcut semantics" — источник
 * приоритетнее конспекта `.ultraplan/research/01-domain.md`, где то же
 * правило сформулировано менее точно как "ближайшая суббота": если сегодня
 * уже выходной, "выходные" значит именно сегодня, а не следующую субботу).
 */
export function resolveWeekend(today: Temporal.PlainDate): Temporal.PlainDate {
  const dow = today.dayOfWeek;
  if (dow === 6 || dow === 7) {
    return today;
  }
  const daysUntilSaturday = 6 - dow;
  return today.add({ days: daysUntilSaturday });
}

/** "Следующая неделя → next Monday, never current Monday" — даже если
 * сегодня понедельник, результат на 7 дней вперёд, а не сегодня. */
export function resolveNextWeekMonday(today: Temporal.PlainDate): Temporal.PlainDate {
  const dow = today.dayOfWeek;
  const daysUntilMonday = (8 - dow) % 7 || 7;
  return today.add({ days: daysUntilMonday });
}

/** "в пятницу" = ближайшая пятница ВКЛЮЧАЯ сегодня — если сегодня и есть
 * искомый день недели, результат = сегодня. */
export function resolveWeekdayNearestIncludingToday(
  today: Temporal.PlainDate,
  targetIso: number,
): Temporal.PlainDate {
  const dow = today.dayOfWeek;
  const diff = (targetIso - dow + 7) % 7;
  return today.add({ days: diff });
}

/**
 * "в следующую пятницу" = день недели следующей КАЛЕНДАРНОЙ недели — не
 * "через 7+ дней от ближайшей", а буквально тот же день на неделе, что
 * начинается со `resolveNextWeekMonday`. Отличие принципиально: если
 * сегодня среда, "в следующую пятницу" — это через 9 дней (пятница недели,
 * начинающейся в ближайший понедельник), а не через 2 дня (это была бы
 * просто "в пятницу").
 */
export function resolveWeekdayNextCalendarWeek(
  today: Temporal.PlainDate,
  targetIso: number,
): Temporal.PlainDate {
  const monday = resolveNextWeekMonday(today);
  return monday.add({ days: targetIso - 1 });
}

/** Время с точностью до минуты — секунды/доли, если каким-то образом
 * попали в `now.time`, не участвуют в сравнении "ещё не наступило /
 * уже прошло" (`01§4` "Time-only без даты" сравнивает с "текущей локальной
 * минутой" буквально). */
function toMinutePrecision(time: Temporal.PlainTime): Temporal.PlainTime {
  return new Temporal.PlainTime(time.hour, time.minute);
}

/**
 * Правило Today/Tomorrow для time-only ввода (`01§4`): время ещё не
 * наступило сегодня (>= текущей минуты) → Сегодня; уже прошло → Завтра.
 * Используется и для обычного Time-чипа без даты, и для time-only Deadline
 * без контекста даты — правило одно и то же в обоих местах спецификации.
 */
export function resolveTodayOrTomorrowForTime(
  today: Temporal.PlainDate,
  nowTime: Temporal.PlainTime,
  candidateTime: Temporal.PlainTime,
): Temporal.PlainDate {
  const isStillAhead =
    Temporal.PlainTime.compare(toMinutePrecision(candidateTime), toMinutePrecision(nowTime)) >= 0;
  return isStillAhead ? today : today.add({ days: 1 });
}
