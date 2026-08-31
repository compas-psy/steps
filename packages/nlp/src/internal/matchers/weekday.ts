/**
 * Категория Weekday (`01§4`): "в пятницу" = ближайшая пятница ВКЛЮЧАЯ
 * сегодня; "в следующую пятницу" = пятница СЛЕДУЮЩЕЙ календарной недели —
 * два разных значения (см. `internal/temporal-rules.ts`), не опечатка.
 */

import type { DateChipValue, ChipCategory } from '../../types.js';
import type { PatternDef, WorkingCandidate, MatchContext } from '../candidates.js';
import { scanCategory } from '../candidates.js';
import type { ProtectedRange } from '../text.js';
import { WORD_BOUNDARY_AFTER, WORD_BOUNDARY_BEFORE } from '../text.js';
import { WEEKDAYS, weekdayByAccusative } from '../dictionaries.js';
import {
  resolveWeekdayNearestIncludingToday,
  resolveWeekdayNextCalendarWeek,
} from '../temporal-rules.js';

const CATEGORY: ChipCategory = 'weekday';
const weekdayAlternation = WEEKDAYS.map((w) => w.accusative).join('|');

const NEXT_WEEK_PATTERN: PatternDef<DateChipValue> = {
  regex: new RegExp(
    `${WORD_BOUNDARY_BEFORE}в\\s+следующ(?:ую|ий|ее)\\s+(${weekdayAlternation})${WORD_BOUNDARY_AFTER}`,
    'uy',
  ),
  resolve: (m, ctx) => {
    const entry = weekdayByAccusative(m[1] as string);
    if (entry === undefined) {
      return { kind: 'invalid', reason: 'invalidDate' };
    }
    return {
      kind: 'valid',
      value: { date: resolveWeekdayNextCalendarWeek(ctx.now.date, entry.iso) },
    };
  },
};

const NEAREST_PATTERN: PatternDef<DateChipValue> = {
  regex: new RegExp(
    `${WORD_BOUNDARY_BEFORE}в\\s+(${weekdayAlternation})${WORD_BOUNDARY_AFTER}`,
    'uy',
  ),
  resolve: (m, ctx) => {
    const entry = weekdayByAccusative(m[1] as string);
    if (entry === undefined) {
      return { kind: 'invalid', reason: 'invalidDate' };
    }
    return {
      kind: 'valid',
      value: { date: resolveWeekdayNearestIncludingToday(ctx.now.date, entry.iso) },
    };
  },
};

/** Порядок важен только для читаемости — `matchAt` в любом случае берёт
 * самое длинное совпадение, а "следующую X" длиннее "X" на той же
 * начальной позиции, так что конфликтов нет при любом порядке списка. */
export const WEEKDAY_PATTERNS: readonly PatternDef<DateChipValue>[] = [
  NEXT_WEEK_PATTERN,
  NEAREST_PATTERN,
];

export function matchWeekdayCandidates(
  textLower: string,
  protectedRanges: readonly ProtectedRange[],
  ctx: MatchContext,
): WorkingCandidate[] {
  return scanCategory(CATEGORY, WEEKDAY_PATTERNS, textLower, protectedRanges, ctx);
}
