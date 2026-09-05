/**
 * Категория Time (`01§4`): "в 11", "11:00", "в 9:30", "утром/днём/вечером"
 * → 09:00/14:00/19:00 по умолчанию. `TIME_PATTERNS` переиспользуется
 * Deadline для anchored-матчинга времени после "до".
 *
 * "в " перед часами-с-двоеточием — опциональная часть паттерна и, если
 * есть, входит в диапазон чипа: так у "встреча в 11" после вычистки
 * заголовка не остаётся висящего одинокого предлога "в" (не требование
 * ТЗ буквально, но прямое следствие того, что грамматика для "в 11" без
 * двоеточия обязана требовать "в" — единообразия ради оба варианта времени
 * ведут себя одинаково относительно предлога).
 */

import { Temporal } from '@js-temporal/polyfill';

import type { TimeChipValue } from '../../types.js';
import type { PatternDef, MatchOutcome } from '../candidates.js';
import { WORD_BOUNDARY_AFTER, WORD_BOUNDARY_BEFORE } from '../text.js';

function valid(time: Temporal.PlainTime): MatchOutcome<TimeChipValue> {
  return { kind: 'valid', value: { time } };
}

const INVALID_TIME: MatchOutcome<TimeChipValue> = { kind: 'invalid', reason: 'invalidDate' };

function tryBuildTime(hour: number, minute: number): Temporal.PlainTime | null {
  try {
    return new Temporal.PlainTime(hour, minute);
  } catch {
    return null;
  }
}

/**
 * Родительный уточнитель части суток после часа — «9 утра», «7 вечера»,
 * «2 ночи», «5 дня».
 *
 * Без него «в 7 вечера» разбиралось как 07:00: слово «вечера» не входило ни
 * в один паттерн, оставалось в названии задачи («Позвонить вечера») и,
 * главное, не влияло на час — напоминание вставало на двенадцать часов
 * раньше задуманного. Золотой корпус закреплял это как ожидаемое поведение
 * (`combined-21`), поэтому дефект и дожил до установленной сборки.
 *
 * Раскладка 12→24 — не механическое «+12», а то, как эти слова
 * употребляются в русском:
 *   утра  1–11 → как есть,      12 → 00 («12 утра» = полночь);
 *   дня   1–11 → +12,           12 → 12 (полдень);
 *   вечера 1–11 → +12,          12 → 12;
 *   ночи  1–4  → как есть,      12 → 00,  5–11 → +12 («11 ночи» = 23:00).
 * Час больше 12 с уточнителем («в 19 вечера») остаётся как есть: человек
 * уже назвал 24-часовое время, переносить его некуда.
 */
type Daypart = 'утра' | 'дня' | 'вечера' | 'ночи';

function applyDaypart(hour: number, daypart: Daypart): number {
  if (hour > 12) return hour;
  switch (daypart) {
    case 'утра':
      return hour === 12 ? 0 : hour;
    case 'дня':
    case 'вечера':
      return hour === 12 ? 12 : hour + 12;
    case 'ночи':
      if (hour === 12) return 0;
      return hour <= 4 ? hour : hour + 12;
  }
}

/**
 * «дня» стоит особняком: это одновременно уточнитель части суток («в 5
 * дня») и родительный падеж единицы «день» («отпуск 3 дня», «через 3 дня»).
 * Поэтому для него предлог «в» ОБЯЗАТЕЛЕН, а для остальных трёх — нет.
 * Найдено корпусом ложных срабатываний: без этого различия «Через… 3 дня
 * выйти на связь» начинало читаться как время 15:00.
 *
 * С двоеточием такой многозначности нет вовсе («3:00 дня» — только время),
 * поэтому там разрешены все четыре без предлога.
 */
const DAYPART_ALTERNATION = 'утра|дня|вечера|ночи';
const DAYPART_NO_PREPOSITION_NEEDED = 'утра|вечера|ночи';

export const TIME_PATTERNS: readonly PatternDef<TimeChipValue>[] = [
  {
    // "в 9:30 утра" — уточнитель поглощается чипом и правит час.
    regex: new RegExp(
      `${WORD_BOUNDARY_BEFORE}(?:в\\s+)?(\\d{1,2}):(\\d{2})\\s+(${DAYPART_ALTERNATION})${WORD_BOUNDARY_AFTER}`,
      'uy',
    ),
    resolve: (m) => {
      const built = tryBuildTime(applyDaypart(Number(m[1]), m[3] as Daypart), Number(m[2]));
      return built === null ? INVALID_TIME : valid(built);
    },
  },
  {
    // "9 утра" — предлог "в" НЕ обязателен: многозначность голого числа,
    // ради которой он требуется ниже, снимает сам уточнитель.
    regex: new RegExp(
      `${WORD_BOUNDARY_BEFORE}(?:в\\s+)?(\\d{1,2})\\s+(${DAYPART_NO_PREPOSITION_NEEDED})${WORD_BOUNDARY_AFTER}`,
      'uy',
    ),
    resolve: (m) => {
      const built = tryBuildTime(applyDaypart(Number(m[1]), m[2] as Daypart), 0);
      return built === null ? INVALID_TIME : valid(built);
    },
  },
  {
    // "в 5 дня" — предлог обязателен, см. `DAYPART_ALTERNATION`.
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}в\\s+(\\d{1,2})\\s+дня${WORD_BOUNDARY_AFTER}`, 'uy'),
    resolve: (m) => {
      const built = tryBuildTime(applyDaypart(Number(m[1]), 'дня'), 0);
      return built === null ? INVALID_TIME : valid(built);
    },
  },
  {
    // "11:00", "в 9:30" — двоеточие делает синтаксис однозначным без
    // предлога, но предлог, если есть, поглощается тем же чипом.
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}(?:в\\s+)?(\\d{1,2}):(\\d{2})(?!\\d)`, 'uy'),
    resolve: (m) => {
      const built = tryBuildTime(Number(m[1]), Number(m[2]));
      return built === null ? INVALID_TIME : valid(built);
    },
  },
  {
    // "в 11" — только час, предлог обязателен: голое число само по себе
    // слишком многозначно (количество, номер пункта и т.п.), см. корпус
    // ложных срабатываний.
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}в\\s+(\\d{1,2})${WORD_BOUNDARY_AFTER}`, 'uy'),
    resolve: (m) => {
      const built = tryBuildTime(Number(m[1]), 0);
      return built === null ? INVALID_TIME : valid(built);
    },
  },
  {
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}утром${WORD_BOUNDARY_AFTER}`, 'uy'),
    resolve: () => valid(new Temporal.PlainTime(9, 0)),
  },
  {
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}(?:днём|днем)${WORD_BOUNDARY_AFTER}`, 'uy'),
    resolve: () => valid(new Temporal.PlainTime(14, 0)),
  },
  {
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}вечером${WORD_BOUNDARY_AFTER}`, 'uy'),
    resolve: () => valid(new Temporal.PlainTime(19, 0)),
  },
];

/**
 * Голый час без предлога "в" и без двоеточия — валиден ТОЛЬКО как часть
 * Deadline ("до 11"), где сам маркер "до" уже снимает многозначность,
 * которая и была причиной требовать "в" для самостоятельной категории
 * Time. Намеренно не входит в `TIME_PATTERNS`/`matchTimeCandidates`
 * (сплошное сканирование всего текста) — иначе "Купить 5 яблок" начал бы
 * читаться как время "05:00".
 */
const DEADLINE_BARE_HOUR: PatternDef<TimeChipValue> = {
  regex: new RegExp(`${WORD_BOUNDARY_BEFORE}(\\d{1,2})${WORD_BOUNDARY_AFTER}`, 'uy'),
  resolve: (m) => {
    const built = tryBuildTime(Number(m[1]), 0);
    return built === null ? INVALID_TIME : valid(built);
  },
};

export const DEADLINE_TIME_PATTERNS: readonly PatternDef<TimeChipValue>[] = [
  ...TIME_PATTERNS,
  DEADLINE_BARE_HOUR,
];
