/**
 * Разбор колонки `DATE` Todoist-экспорта.
 *
 * Todoist кладёт в неё ровно то, что человек ввёл: либо дату («2026-09-02»,
 * «Sep 2», «2 сент.»), либо ПРАВИЛО ПОВТОРА («every day», «каждый
 * понедельник»). Поэтому разбор двухступенчатый: сперва повтор, потом дата.
 *
 * `01§26` про часовые пояса дословно: «Todoist TIMEZONE is recorded in the
 * import report, but DATE wall-clock values are preserved as the user saw
 * them because SHAGI uses floating-local task time; no surprise conversion
 * during import». Поэтому здесь НЕТ ни одного преобразования пояса: «14:00»
 * остаётся «14:00», а TIMEZONE уходит в отчёт отдельным предупреждением.
 *
 * Нераспознанное значение — не молчаливая потеря: вызывающий код обязан
 * выдать предупреждение `date_not_recognized` с исходной строкой, и она же
 * попадает в блок метаданных описания. «No mapped content silently lost»
 * (`06 §6`).
 */
import type { RecurrenceRuleTemplate } from '@shagi/core';

export interface ParsedTodoistDate {
  readonly date: string | null;
  readonly time: string | null;
  readonly recurrence: RecurrenceRuleTemplate | null;
  /** Значение выглядело как повтор, но R1 его не выражает. */
  readonly recurrenceUnsupported: boolean;
  /** Значение непусто, но ни датой, ни повтором не оказалось. */
  readonly unrecognized: boolean;
}

const EMPTY: ParsedTodoistDate = {
  date: null,
  time: null,
  recurrence: null,
  recurrenceUnsupported: false,
  unrecognized: false,
};

/** Месяцы обоих языков, которые Todoist пишет в DATE в зависимости от
 * DATE_LANG. Список короткий и явный — угадывать локаль по системе нельзя,
 * файл мог быть выгружен на другом устройстве. */
const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  янв: 1,
  фев: 2,
  мар: 3,
  апр: 4,
  мая: 5,
  май: 5,
  июн: 6,
  июл: 7,
  авг: 8,
  сен: 9,
  окт: 10,
  ноя: 11,
  дек: 12,
};

const WEEKDAYS: Readonly<Record<string, number>> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
  пн: 1,
  вт: 2,
  ср: 3,
  чт: 4,
  пт: 5,
  сб: 6,
  вс: 7,
  понедельник: 1,
  вторник: 2,
  среда: 3,
  среду: 3,
  четверг: 4,
  пятница: 5,
  пятницу: 5,
  суббота: 6,
  субботу: 6,
  воскресенье: 7,
};

const UNIT_WORDS: Readonly<Record<string, 'day' | 'week' | 'month' | 'year'>> = {
  day: 'day',
  days: 'day',
  daily: 'day',
  week: 'week',
  weeks: 'week',
  weekly: 'week',
  month: 'month',
  months: 'month',
  monthly: 'month',
  year: 'year',
  years: 'year',
  yearly: 'year',
  день: 'day',
  дня: 'day',
  дней: 'day',
  ежедневно: 'day',
  неделя: 'week',
  неделю: 'week',
  недели: 'week',
  недель: 'week',
  еженедельно: 'week',
  месяц: 'month',
  месяца: 'month',
  месяцев: 'month',
  ежемесячно: 'month',
  год: 'year',
  года: 'year',
  лет: 'year',
  ежегодно: 'year',
};

const RECURRENCE_MARKERS = [
  'every',
  'каждый',
  'каждую',
  'каждые',
  'каждое',
  'ежедневно',
  'еженедельно',
  'ежемесячно',
  'ежегодно',
];

function two(value: number): string {
  return String(value).padStart(2, '0');
}

/** `HH:MM` из хвоста строки, если он там есть. */
function extractTime(value: string): { rest: string; time: string | null } {
  const match = /(?:^|[\s,])(\d{1,2}):(\d{2})(?::\d{2})?\s*$/.exec(value);
  if (match === null) return { rest: value, time: null };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return { rest: value, time: null };
  return { rest: value.slice(0, match.index).trim(), time: `${two(hour)}:${two(minute)}` };
}

function parseRecurrence(lowered: string): ParsedTodoistDate | null {
  if (!RECURRENCE_MARKERS.some((marker) => lowered.startsWith(marker))) return null;

  // «ежедневно»/«еженедельно»/... — единственным словом.
  const single = UNIT_WORDS[lowered];
  if (single !== undefined) {
    return { ...EMPTY, recurrence: { unit: single, interval: 1 } };
  }

  const words = lowered
    .split(/[\s,]+/)
    .filter((word) => word.length > 0)
    .slice(1);
  const intervalWord = words.find((word) => /^\d+$/.test(word));
  const interval = intervalWord === undefined ? 1 : Number(intervalWord);
  if (interval < 1) return { ...EMPTY, recurrenceUnsupported: true };

  const unitWord = words.find((word) => UNIT_WORDS[word] !== undefined);
  if (unitWord !== undefined) {
    return { ...EMPTY, recurrence: { unit: UNIT_WORDS[unitWord] as 'day', interval } };
  }

  // «every monday» / «каждый понедельник» — недельный повтор с днём недели.
  const weekdayWord = words.find((word) => WEEKDAYS[word] !== undefined);
  if (weekdayWord !== undefined) {
    return {
      ...EMPTY,
      recurrence: { unit: 'week', interval, byWeekday: [WEEKDAYS[weekdayWord] as 1] },
    };
  }
  // Похоже на повтор, но выразить нечем — «every! другое».
  return { ...EMPTY, recurrenceUnsupported: true };
}

function parseDate(value: string): { date: string } | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso !== null) {
    const [, year, month, day] = iso as unknown as [string, string, string, string];
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return { date: `${year}-${month}-${day}` };
    }
    return null;
  }
  // «2 сент. 2026 г.» / «Sep 2 2026» / «2 Sep» — день, месяц словом, год
  // необязателен (Todoist опускает текущий год).
  const cleaned = value
    .replaceAll(/[.,]/g, ' ')
    .replaceAll(/\s+г\s*$/gi, ' ')
    .trim();
  const tokens = cleaned.split(/\s+/).filter((token) => token.length > 0);
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  for (const token of tokens) {
    const lowered = token.toLowerCase();
    const monthKey = Object.keys(MONTHS).find((key) => lowered.startsWith(key));
    if (monthKey !== undefined && month === null) {
      month = MONTHS[monthKey] as number;
      continue;
    }
    if (/^\d{4}$/.test(token)) {
      year ??= Number(token);
      continue;
    }
    if (/^\d{1,2}$/.test(token) && day === null) {
      day = Number(token);
      continue;
    }
  }
  if (day === null || month === null || day < 1 || day > 31) return null;
  // Без года Todoist подразумевает ближайший — но «ближайший» зависит от
  // часов, а импорт обязан быть детерминированным (то же правило, что у
  // всего домена). Год обязателен; без него значение считается
  // нераспознанным и попадает в предупреждение вместе с исходной строкой.
  if (year === null) return null;
  return { date: `${year}-${two(month)}-${two(day)}` };
}

export function parseTodoistDate(raw: string): ParsedTodoistDate {
  const value = raw.trim();
  if (value === '') return EMPTY;
  const lowered = value.toLowerCase();

  const recurrence = parseRecurrence(lowered);
  if (recurrence !== null) return recurrence;

  const { rest, time } = extractTime(value);
  const parsed = parseDate(rest.trim());
  if (parsed === null) return { ...EMPTY, time, unrecognized: true };
  return { ...EMPTY, date: parsed.date, time };
}
