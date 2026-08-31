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

export const TIME_PATTERNS: readonly PatternDef<TimeChipValue>[] = [
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
