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
  /** Родительный падеж — «до пятницы», см. `weekdayByGenitive`. */
  readonly genitive: string;
  readonly everyPrefix: 'каждый' | 'каждую' | 'каждое';
}

export const WEEKDAYS: readonly WeekdayEntry[] = [
  { iso: 1, accusative: 'понедельник', genitive: 'понедельника', everyPrefix: 'каждый' },
  { iso: 2, accusative: 'вторник', genitive: 'вторника', everyPrefix: 'каждый' },
  { iso: 3, accusative: 'среду', genitive: 'среды', everyPrefix: 'каждую' },
  { iso: 4, accusative: 'четверг', genitive: 'четверга', everyPrefix: 'каждый' },
  { iso: 5, accusative: 'пятницу', genitive: 'пятницы', everyPrefix: 'каждую' },
  { iso: 6, accusative: 'субботу', genitive: 'субботы', everyPrefix: 'каждую' },
  { iso: 7, accusative: 'воскресенье', genitive: 'воскресенья', everyPrefix: 'каждое' },
];

export function weekdayByAccusative(word: string): WeekdayEntry | undefined {
  return WEEKDAYS.find((w) => w.accusative === word);
}

/** Родительный падеж нужен ровно одной конструкции — «до пятницы»
 * (`matchers/deadline.ts`). Самостоятельным днём недели он НЕ считается:
 * «пятницы» посреди фразы — обычное слово, не дата. */
export function weekdayByGenitive(word: string): WeekdayEntry | undefined {
  return WEEKDAYS.find((w) => w.genitive === word);
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
