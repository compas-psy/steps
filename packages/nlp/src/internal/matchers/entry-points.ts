/**
 * Точки входа сплошного сканирования (шаг 3-4) для категорий, у которых нет
 * собственной специфики поверх `scanCategory` (Date, Time, Duration,
 * Recurrence, Project, Label, Priority — Weekday и Deadline устроены
 * иначе и живут в собственных файлах). Один файл вместо девяти
 * трёхстрочных — специфика каждой категории уже целиком выражена в её
 * списке `*_PATTERNS`.
 */

import type { WorkingCandidate, MatchContext } from '../candidates.js';
import { scanCategory } from '../candidates.js';
import type { ProtectedRange } from '../text.js';
import { DATE_PATTERNS } from './date.js';
import { TIME_PATTERNS } from './time.js';
import { DURATION_PATTERNS } from './duration.js';
import { RECURRENCE_PATTERNS } from './recurrence.js';
import { PROJECT_PATTERNS, LABEL_PATTERNS, PRIORITY_PATTERNS } from './tags.js';

export function matchDateCandidates(
  textLower: string,
  protectedRanges: readonly ProtectedRange[],
  ctx: MatchContext,
): WorkingCandidate[] {
  return scanCategory('date', DATE_PATTERNS, textLower, protectedRanges, ctx);
}

export function matchTimeCandidates(
  textLower: string,
  protectedRanges: readonly ProtectedRange[],
  ctx: MatchContext,
): WorkingCandidate[] {
  return scanCategory('time', TIME_PATTERNS, textLower, protectedRanges, ctx);
}

export function matchDurationCandidates(
  textLower: string,
  protectedRanges: readonly ProtectedRange[],
  ctx: MatchContext,
): WorkingCandidate[] {
  return scanCategory('duration', DURATION_PATTERNS, textLower, protectedRanges, ctx);
}

export function matchRecurrenceCandidates(
  textLower: string,
  protectedRanges: readonly ProtectedRange[],
  ctx: MatchContext,
): WorkingCandidate[] {
  return scanCategory('recurrence', RECURRENCE_PATTERNS, textLower, protectedRanges, ctx);
}

export function matchProjectCandidates(
  textLower: string,
  protectedRanges: readonly ProtectedRange[],
  ctx: MatchContext,
): WorkingCandidate[] {
  return scanCategory('project', PROJECT_PATTERNS, textLower, protectedRanges, ctx);
}

export function matchLabelCandidates(
  textLower: string,
  protectedRanges: readonly ProtectedRange[],
  ctx: MatchContext,
): WorkingCandidate[] {
  return scanCategory('label', LABEL_PATTERNS, textLower, protectedRanges, ctx);
}

export function matchPriorityCandidates(
  textLower: string,
  protectedRanges: readonly ProtectedRange[],
  ctx: MatchContext,
): WorkingCandidate[] {
  return scanCategory('priority', PRIORITY_PATTERNS, textLower, protectedRanges, ctx);
}
