/**
 * Категория Duration (`01§4`): "15 мин", "45 минут", "1 час", "1 ч 30 мин",
 * "полтора часа". Значение приводится через `makeDurationMinutes`
 * (`@shagi/core`) — тот же smart-constructor 1..1440, что и у домена,
 * вместо собственной копии диапазона.
 */

import { makeDurationMinutes } from '@shagi/core';

import type { DurationChipValue } from '../../types.js';
import type { PatternDef, MatchOutcome } from '../candidates.js';
import { WORD_BOUNDARY_AFTER, WORD_BOUNDARY_BEFORE } from '../text.js';

function valid(minutes: number): MatchOutcome<DurationChipValue> {
  try {
    return { kind: 'valid', value: { minutes: makeDurationMinutes(minutes) } };
  } catch {
    // Вне диапазона 1..1440 (например, гипотетические "2000 минут") —
    // синтаксически похоже на длительность, но семантически невалидно;
    // та же temporal-валидация шага 6, просто не про даты.
    return { kind: 'invalid', reason: 'invalidDate' };
  }
}

const HOUR_UNIT = '(?:часов|часа|час|ч)';
const MINUTE_UNIT = '(?:минут|минуты|мин)';

export const DURATION_PATTERNS: readonly PatternDef<DurationChipValue>[] = [
  {
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}полтора\\s+часа${WORD_BOUNDARY_AFTER}`, 'uy'),
    resolve: () => valid(90),
  },
  {
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}полчаса${WORD_BOUNDARY_AFTER}`, 'uy'),
    resolve: () => valid(30),
  },
  {
    // "1 ч 30 мин" — комбинированная форма проверяется как отдельный,
    // самый длинный вариант; `matchAt` выбирает его вместо "1 ч" +
    // отдельного, уже не связанного с ним "30 мин".
    regex: new RegExp(
      `${WORD_BOUNDARY_BEFORE}(\\d{1,3})\\s*${HOUR_UNIT}\\.?\\s+(\\d{1,2})\\s*${MINUTE_UNIT}\\.?${WORD_BOUNDARY_AFTER}`,
      'uy',
    ),
    resolve: (m) => valid(Number(m[1]) * 60 + Number(m[2])),
  },
  {
    regex: new RegExp(
      `${WORD_BOUNDARY_BEFORE}(\\d{1,3})\\s*${HOUR_UNIT}\\.?${WORD_BOUNDARY_AFTER}`,
      'uy',
    ),
    resolve: (m) => valid(Number(m[1]) * 60),
  },
  {
    regex: new RegExp(
      `${WORD_BOUNDARY_BEFORE}(\\d{1,4})\\s*${MINUTE_UNIT}\\.?${WORD_BOUNDARY_AFTER}`,
      'uy',
    ),
    resolve: (m) => valid(Number(m[1])),
  },
];
