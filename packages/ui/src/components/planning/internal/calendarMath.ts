/**
 * Чистая календарная арифметика для `DatePicker` (E03.5). Единственное
 * место в пакете, где `Date` вообще упоминается — не нарушение запрета на
 * нативный `Date` в доменной логике (ТЗ §5, `CLAUDE.md`), потому что здесь
 * нет доменной логики: длина месяца и день недели 1 числа — общеизвестная
 * календарная математика (григорианский календарь), она нигде не
 * пересекается с temporal-моделью продукта (`PlainDate`/`Instant`,
 * @js-temporal/polyfill), которую этому пакету запрещено импортировать
 * (пакет работ E03.5, раздел «Критическая архитектурная граница»).
 * `Date.UTC`/локальный конструктор `Date` допустимы именно и только здесь.
 *
 * `CalendarDate`/`CalendarMonth` — простые числа (`{ year, month, day }`,
 * месяц 1–12), не `Temporal.PlainDate`: `packages/ui` не зависит от
 * `@js-temporal/polyfill`, перевод в/из доменной temporal-модели —
 * ответственность вызывающего кода (`packages/app`).
 */

export interface CalendarMonth {
  readonly year: number;
  readonly month: number; // 1–12
}

export interface CalendarDate extends CalendarMonth {
  readonly day: number;
}

/** Число дней в месяце — учитывает високосный год автоматически (день 0
 * следующего месяца = последний день текущего). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** День недели 1 числа месяца: 0=воскресенье…6=суббота (`Date.getDay()`). */
export function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

/**
 * Число «пустых» ячеек перед 1 числом при старте недели с `weekStartsOn`
 * (0=воскресенье…6=суббота — тот же нуль-based индекс, что и у
 * `Date.getDay()`, чтобы вызывающему коду не нужно было это пересчитывать).
 * Компонент не хардкодит день начала недели — оба аргумента приходят снаружи.
 */
export function leadingBlankCells(year: number, month: number, weekStartsOn: number): number {
  const firstDay = firstWeekdayOfMonth(year, month);
  return (firstDay - weekStartsOn + 7) % 7;
}

/** Зажимает день числа в границах `[1, длина месяца]` — используется при
 * переносе клавиатурного фокуса между месяцами разной длины. */
export function clampDayInMonth(day: number, year: number, month: number): number {
  const max = daysInMonth(year, month);
  return Math.min(Math.max(day, 1), max);
}

/** Сдвигает `{ year, month }` на `delta` месяцев (может быть отрицательным),
 * корректно переходя через границу года. */
export function addMonths(base: CalendarMonth, delta: number): CalendarMonth {
  const totalMonthsFromEpoch = base.month - 1 + delta;
  const year = base.year + Math.floor(totalMonthsFromEpoch / 12);
  const month = ((totalMonthsFromEpoch % 12) + 12) % 12;
  return { year, month: month + 1 };
}

export function isSameCalendarDate(a: CalendarDate | null, b: CalendarDate | null): boolean {
  if (a === null || b === null) return a === b;
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
