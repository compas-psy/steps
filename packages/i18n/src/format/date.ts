/**
 * Даты/время через слой локали — SPEC/00 §13.1 («Date/time formatting uses
 * locale layer, never handwritten month strings in domain logic») и §5
 * («Default locale: ru-RU; Monday-first; 24-hour time»).
 *
 * Домен ШАГОВ работает на `Temporal` (`@shagi/core`, §5), не на `Date` —
 * `Date` в доменной логике запрещён ТЗ. Поэтому этот слой принимает
 * `Temporal.PlainDate`/`PlainTime`/`Instant`, а не `Date`: у вызывающего
 * кода просто нет способа собрать дату строкой руками и обойти `Intl`.
 *
 * `Temporal.*.prototype.toLocaleString` в `@js-temporal/polyfill` сам
 * делегирует в `Intl.DateTimeFormat` — переиспользуем его вместо ручной
 * дороги "достать поля → собрать `Intl.DateTimeFormat` вручную".
 *
 * Неделя с понедельника не требует отдельного форматирования: ISO
 * `Temporal.PlainDate#dayOfWeek` уже даёт понедельник=1…воскресенье=7
 * (см. `startOfWeek`/`weekdayName` ниже) — это ровно тот порядок, который
 * требует §5, без какого-либо особого кода.
 */
import { Temporal } from '@js-temporal/polyfill';

export const DEFAULT_LOCALE = 'ru-RU' as const;

/** 24-часовой формат: `hourCycle: 'h23'` — не полагаемся на дефолт локали переопределить неявно. */
const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};

export interface FormatDateOptions {
  readonly locale?: string;
  readonly weekday?: 'long' | 'short' | 'narrow';
  readonly day?: 'numeric' | '2-digit';
  readonly month?: 'long' | 'short' | '2-digit' | 'numeric' | 'narrow';
  readonly year?: 'numeric' | '2-digit';
}

/** Дата планирования/дедлайна/фокуса — плавает вместе с локальным временем устройства, без часового пояса. */
export function formatDate(date: Temporal.PlainDate, options: FormatDateOptions = {}): string {
  const { locale = DEFAULT_LOCALE, weekday, day = 'numeric', month = 'long', year } = options;
  const dateTimeOptions: Intl.DateTimeFormatOptions = { day, month };
  if (weekday !== undefined) dateTimeOptions.weekday = weekday;
  if (year !== undefined) dateTimeOptions.year = year;
  return date.toLocaleString(locale, dateTimeOptions);
}

export interface FormatTimeOptions {
  readonly locale?: string;
}

/** Локальное время задачи (planned/deadline) — всегда 24-часовое (§5). */
export function formatTime(time: Temporal.PlainTime, options: FormatTimeOptions = {}): string {
  const { locale = DEFAULT_LOCALE } = options;
  return time.toLocaleString(locale, TIME_OPTIONS);
}

export interface FormatInstantOptions extends FormatDateOptions {
  readonly includeDate?: boolean;
}

/**
 * Момент времени (created/updated/completed, §5) — `timeZone` обязателен:
 * `Instant` сам по себе не несёт представления "в котором часовом поясе
 * показать", а домен не хардкодит его молча.
 */
export function formatInstant(
  instant: Temporal.Instant,
  timeZone: string,
  options: FormatInstantOptions = {},
): string {
  const {
    locale = DEFAULT_LOCALE,
    includeDate = true,
    weekday,
    day = 'numeric',
    month = 'long',
    year,
  } = options;
  const dateTimeOptions: Intl.DateTimeFormatOptions = { timeZone, ...TIME_OPTIONS };
  if (includeDate) {
    dateTimeOptions.day = day;
    dateTimeOptions.month = month;
    if (weekday !== undefined) dateTimeOptions.weekday = weekday;
    if (year !== undefined) dateTimeOptions.year = year;
  }
  return instant.toLocaleString(locale, dateTimeOptions);
}

/** ISO: понедельник=1 … воскресенье=7 (см. заголовок файла). */
export const WEEKDAY_MONDAY = 1;
export const WEEKDAY_SUNDAY = 7;

/** Опорный, заведомо-верный понедельник для получения названия дня недели по ISO-номеру. */
const WEEKDAY_ANCHOR_MONDAY = Temporal.PlainDate.from('2024-01-01');

/** Название дня недели по ISO-номеру (понедельник=1…воскресенье=7), а не хардкод списка строк в домене. */
export function weekdayName(
  dayOfWeek: number,
  style: 'long' | 'short' | 'narrow' = 'long',
  locale: string = DEFAULT_LOCALE,
): string {
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < WEEKDAY_MONDAY || dayOfWeek > WEEKDAY_SUNDAY) {
    throw new RangeError(
      `weekdayName: dayOfWeek должен быть 1..7 (ISO, понедельник=1), получено ${String(dayOfWeek)}`,
    );
  }
  const date = WEEKDAY_ANCHOR_MONDAY.add({ days: dayOfWeek - WEEKDAY_MONDAY });
  return date.toLocaleString(locale, { weekday: style });
}

/** Понедельник той недели, в которую попадает `date` (SPEC §5/§16.1: неделя с понедельника). */
export function startOfWeek(date: Temporal.PlainDate): Temporal.PlainDate {
  return date.subtract({ days: date.dayOfWeek - WEEKDAY_MONDAY });
}
