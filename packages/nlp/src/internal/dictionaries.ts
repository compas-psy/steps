/**
 * Словари русской грамматики (`01§4`). Вынесены отдельно от матчеров —
 * используются и категорией Weekday ("в пятницу"), и категорией Recurrence
 * ("каждую пятницу"), и Deadline (через переиспользование паттернов
 * Date/Time) одинаково.
 */

/** ISO-номер дня недели (1=понедельник..7=воскресенье, как
 * `Temporal.PlainDate#dayOfWeek`) → словоформы. Винительный падеж
 * (`accusative`) — форма после "в"/"в следующую" ("в пятницу", а не
 * "в пятница"); согласование рода для "каждый/каждую/каждое"
 * (`everyPrefix`) обязательно разное для м./ж./ср. рода дня недели.
 */
export interface WeekdayEntry {
  readonly iso: number;
  readonly accusative: string;
  readonly everyPrefix: 'каждый' | 'каждую' | 'каждое';
}

export const WEEKDAYS: readonly WeekdayEntry[] = [
  { iso: 1, accusative: 'понедельник', everyPrefix: 'каждый' },
  { iso: 2, accusative: 'вторник', everyPrefix: 'каждый' },
  { iso: 3, accusative: 'среду', everyPrefix: 'каждую' },
  { iso: 4, accusative: 'четверг', everyPrefix: 'каждый' },
  { iso: 5, accusative: 'пятницу', everyPrefix: 'каждую' },
  { iso: 6, accusative: 'субботу', everyPrefix: 'каждую' },
  { iso: 7, accusative: 'воскресенье', everyPrefix: 'каждое' },
];

export function weekdayByAccusative(word: string): WeekdayEntry | undefined {
  return WEEKDAYS.find((w) => w.accusative === word);
}

/** Родительный падеж месяца ("5 сентября") — индекс 0 = январь (1). */
export const MONTHS_GENITIVE: readonly string[] = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export function monthGenitiveIndex(word: string): number {
  return MONTHS_GENITIVE.indexOf(word);
}
