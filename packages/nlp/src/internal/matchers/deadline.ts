/**
 * Категория Deadline (`01§4`): маркер "до <дата/время>" — единственный
 * синтаксис в R1, ничего другого не изобретаем.
 *
 * Устроен не через `scanCategory` (в отличие от всех прочих категорий),
 * потому что дата/время дедлайна матчатся не с начала текста, а ровно с
 * позиции сразу после "до " — это anchored-матчинг (`matchAt` по
 * фиксированной позиции), а не сплошное сканирование. Переиспользует
 * `DATE_PATTERNS`/`TIME_PATTERNS` из соседних категорий вместо копии
 * грамматики дат/времени — иначе "до 5 сентября" и "5 сентября" сами по
 * себе неизбежно разошлись бы при любом будущем изменении грамматики дат.
 *
 * Побочный эффект такого переиспользования: "5 сентября" внутри "до 5
 * сентября" отдельно находится и матчером категории Date тоже — это не
 * баг, а ожидаемое пересечение диапазонов, которое разрешает шаг 5
 * (`internal/resolve.ts`): полностью вложенный в принятый Deadline
 * кандидат тихо поглощается, а не попадает в список отклонённых —
 * пользователю нечего показывать как "неоднозначность", это просто
 * составная часть уже принятого дедлайна.
 *
 * Без даты/контекста дедлайн со временем ("до 11") подчиняется тому же
 * правилу Today/Tomorrow, что и голое время (`01§4`); при унаследованной
 * дате Composer — присоединяется к ней, даже если время уже прошло для
 * этой даты (то же правило, что и для обычного Time-чипа).
 */

import type { ChipCategory, DeadlineChipValue } from '../../types.js';
import type { MatchContext, WorkingCandidate } from '../candidates.js';
import { matchAt } from '../candidates.js';
import {
  isPositionProtected,
  skipSpaces,
  WORD_BOUNDARY_AFTER,
  WORD_BOUNDARY_BEFORE,
} from '../text.js';
import type { ProtectedRange } from '../text.js';
import { DATE_PATTERNS } from './date.js';
import { DEADLINE_TIME_PATTERNS } from './time.js';
import { resolveTodayOrTomorrowForTime } from '../temporal-rules.js';

const CATEGORY: ChipCategory = 'deadline';
const MARKER_REGEX = new RegExp(`${WORD_BOUNDARY_BEFORE}до${WORD_BOUNDARY_AFTER}`, 'uy');

export function matchDeadlineCandidates(
  textLower: string,
  protectedRanges: readonly ProtectedRange[],
  ctx: MatchContext,
): WorkingCandidate[] {
  const results: WorkingCandidate[] = [];
  let i = 0;
  while (i < textLower.length) {
    if (isPositionProtected(i, protectedRanges)) {
      i += 1;
      continue;
    }
    MARKER_REGEX.lastIndex = i;
    const marker = MARKER_REGEX.exec(textLower);
    if (marker === null || marker.index !== i) {
      i += 1;
      continue;
    }
    const afterMarker = skipSpaces(textLower, marker.index + marker[0].length);
    if (afterMarker === marker.index + marker[0].length) {
      // "до" без пробела дальше ("до5"?) — не похоже на маркер дедлайна,
      // пропускаем эту позицию и продолжаем сканирование.
      i += 1;
      continue;
    }

    const built = tryBuildDeadline(textLower, afterMarker, ctx);
    if (built === null) {
      // "до свидания", "до встречи" и т.п. — после "до" нет ни валидной
      // даты, ни времени: это не дедлайн, "до" остаётся обычным текстом.
      i = afterMarker;
      continue;
    }
    if (overlapsProtected(i, built.end, protectedRanges)) {
      i = built.end;
      continue;
    }
    results.push({
      category: CATEGORY,
      start: i,
      end: built.end,
      text: ctx.originalText.slice(i, built.end),
      outcome: built.outcome,
    });
    i = built.end;
  }
  return results;
}

function overlapsProtected(start: number, end: number, ranges: readonly ProtectedRange[]): boolean {
  return ranges.some((r) => start < r.end && r.start < end);
}

interface Built {
  readonly end: number;
  readonly outcome:
    | { readonly kind: 'valid'; readonly value: DeadlineChipValue }
    | { readonly kind: 'invalid'; readonly reason: 'invalidDate' };
}

function tryBuildDeadline(textLower: string, pos: number, ctx: MatchContext): Built | null {
  const datePart = matchAt(DATE_PATTERNS, textLower, pos, ctx);
  if (datePart !== null) {
    if (datePart.outcome.kind === 'invalid') {
      return { end: datePart.end, outcome: { kind: 'invalid', reason: 'invalidDate' } };
    }
    const afterDate = skipSpaces(textLower, datePart.end);
    const timePart =
      afterDate > datePart.end ? matchAt(DEADLINE_TIME_PATTERNS, textLower, afterDate, ctx) : null;
    if (timePart === null) {
      return {
        end: datePart.end,
        outcome: {
          kind: 'valid',
          value: { date: datePart.outcome.value.date, time: null, dateOrigin: 'explicit' },
        },
      };
    }
    if (timePart.outcome.kind === 'invalid') {
      return { end: timePart.end, outcome: { kind: 'invalid', reason: 'invalidDate' } };
    }
    return {
      end: timePart.end,
      outcome: {
        kind: 'valid',
        value: {
          date: datePart.outcome.value.date,
          time: timePart.outcome.value.time,
          dateOrigin: 'explicit',
        },
      },
    };
  }

  const timeOnly = matchAt(DEADLINE_TIME_PATTERNS, textLower, pos, ctx);
  if (timeOnly === null) {
    return null;
  }
  if (timeOnly.outcome.kind === 'invalid') {
    return { end: timeOnly.end, outcome: { kind: 'invalid', reason: 'invalidDate' } };
  }
  const time = timeOnly.outcome.value.time;
  const inheritedDate = ctx.inherited?.date;
  const date =
    inheritedDate !== undefined
      ? inheritedDate
      : resolveTodayOrTomorrowForTime(ctx.now.date, ctx.now.time, time);
  return {
    end: timeOnly.end,
    outcome: {
      kind: 'valid',
      value: { date, time, dateOrigin: inheritedDate !== undefined ? 'inherited' : 'implied' },
    },
  };
}
