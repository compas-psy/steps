/**
 * Общий примитив для шагов 3-4 конвейера (лексер + кандидаты сущностей):
 * один и тот же "попробовать паттерн по фиксированной позиции" механизм
 * используется и для сплошного сканирования текста каждой категорией
 * (`scanCategory`), и для точечного anchored-матчинга внутри Deadline
 * (`до <дата/время>` — там дата/время матчатся не с начала текста, а с
 * позиции сразу после "до "). Одна реализация вместо двух — иначе
 * `matchers/deadline.ts` держал бы собственную копию паттернов дат/времени
 * и они бы неизбежно разошлись.
 */

import type { NowContext, InheritedContext, ChipCategory, RejectionReason } from '../types.js';
import { isPositionProtected, overlapsAnyProtectedRange, type ProtectedRange } from './text.js';

export interface MatchContext {
  readonly now: NowContext;
  readonly inherited?: InheritedContext | undefined;
  /** Текст ДО lowercase — матчинг паттернов идёт по lowercase-версии (чтобы
   * не дублировать каждый паттерн с `i`-флагом на кириллице), но значения
   * вроде имени `#проекта`/`@метки` обязаны сохранить регистр, как набрал
   * пользователь — поэтому резолверам отдельно доступен оригинал. */
  readonly originalText: string;
}

export type MatchOutcome<V> =
  | { readonly kind: 'valid'; readonly value: V }
  | { readonly kind: 'invalid'; readonly reason: RejectionReason };

export interface PatternDef<V> {
  /** Обязаны быть флаги `u` (юникод-классы/lookbehind) и `y` (sticky —
   * матчинг ровно с `lastIndex`, без сканирования вперёд). */
  readonly regex: RegExp;
  readonly resolve: (match: RegExpExecArray, ctx: MatchContext) => MatchOutcome<V>;
}

export interface MatchAt<V> {
  readonly end: number;
  readonly text: string;
  readonly outcome: MatchOutcome<V>;
}

/** Кандидат до разрешения приоритета (шаг 5) — "сырое" совпадение одной
 * категории с ещё не приведённым к публичному типу значением. */
export interface WorkingCandidate {
  readonly category: ChipCategory;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly outcome: MatchOutcome<unknown>;
}

/**
 * Пробует все паттерны категории ровно в позиции `pos` (не сканирует
 * дальше). Из нескольких одновременно подошедших берёт самый длинный —
 * например, для дедлайна "до 5 сентября" вариант с полной календарной
 * датой должен победить более короткий частичный вариант, если бы он тоже
 * матчился с той же позиции.
 */
export function matchAt<V>(
  patterns: readonly PatternDef<V>[],
  textLower: string,
  pos: number,
  ctx: MatchContext,
): MatchAt<V> | null {
  let best: MatchAt<V> | null = null;
  for (const pattern of patterns) {
    pattern.regex.lastIndex = pos;
    const m = pattern.regex.exec(textLower);
    if (m === null || m.index !== pos) {
      continue;
    }
    const len = m[0].length;
    if (best === null || len > best.end - pos) {
      best = {
        end: pos + len,
        text: ctx.originalText.slice(pos, pos + len),
        outcome: pattern.resolve(m, ctx),
      };
    }
  }
  return best;
}

/**
 * Сплошное сканирование всего текста одной категорией паттернов (шаг 3-4
 * для Date/Weekday/Time/Duration/Recurrence/Project/Label/Priority —
 * Deadline устроен иначе, см. `matchers/deadline.ts`). Позиции внутри
 * protected-диапазонов (шаг 2) пропускаются целиком.
 */
export function scanCategory<V>(
  category: ChipCategory,
  patterns: readonly PatternDef<V>[],
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
    const found = matchAt(patterns, textLower, i, ctx);
    if (found !== null && !overlapsAnyProtectedRange(i, found.end, protectedRanges)) {
      results.push({
        category,
        start: i,
        end: found.end,
        text: found.text,
        outcome: found.outcome,
      });
      i = found.end;
      continue;
    }
    i += 1;
  }
  return results;
}
