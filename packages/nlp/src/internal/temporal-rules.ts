/**
 * Чистые Temporal-вычисления грамматики (`01§4` "Date shortcut semantics",
 * "Weekday"). Никакого `Date` — только `@js-temporal/polyfill`, как и весь
 * остальной домен (CLAUDE.md "Время").
 *
 * ISO-нумерация дня недели домена (`Temporal.PlainDate#dayOfWeek`):
 * 1=понедельник .. 7=воскресенье. Используется и здесь, и в
 * `RecurrenceChipValue.byWeekday` — единая система на весь пакет.
 *
 * `resolveWeekend`/`resolveNextWeekMonday` **перенесены в `@shagi/core`**
 * (`packages/core/src/temporal/date-shortcuts.ts`, пакет работ E08.2): та же
 * арифметика понадобилась UI-редактору Planned Date
 * (`packages/app/src/screens/TaskDetail.tsx`, шорткаты «Выходные»/
 * «Следующая неделя»), а этот файл лежит в `internal/` — не экспортируется
 * из публичной точки входа `@shagi/nlp`, значит для UI не было законного
 * пути их переиспользовать. `packages/nlp` уже зависит от `@shagi/core`
 * (`package.json`), перенос не создаёт цикл. Реэкспорт ниже сохраняет старый
 * путь импорта для `matchers/date.ts`/`matchers/weekday.ts`/
 * `matchers/deadline.ts` без изменений в них.
 */

import { Temporal } from '@js-temporal/polyfill';
import { resolveNextWeekMonday, resolveWeekend } from '@shagi/core';

// Реэкспорт под тем же именем — `resolveWeekdayNextCalendarWeek` ниже тоже
// использует `resolveNextWeekMonday` (локальная ссылка, не только реэкспорт).
export { resolveNextWeekMonday, resolveWeekend };

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
