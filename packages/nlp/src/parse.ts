/**
 * Оркестратор всего конвейера (`01§4`, шаги 1-9). Чистая функция: одинаковый
 * вход — одинаковый выход, без сети и ML-инференса (CLAUDE.md, package.json
 * описание пакета).
 */

import type { AnyRejectedCandidate, ParseQuickAddInput, ParseQuickAddResult } from './types.js';
import { findProtectedRanges, normalizeNfkc } from './internal/text.js';
import type { MatchContext, WorkingCandidate } from './internal/candidates.js';
import { matchDeadlineCandidates } from './internal/matchers/deadline.js';
import { matchWeekdayCandidates } from './internal/matchers/weekday.js';
import {
  matchDateCandidates,
  matchDurationCandidates,
  matchLabelCandidates,
  matchPriorityCandidates,
  matchProjectCandidates,
  matchRecurrenceCandidates,
  matchTimeCandidates,
} from './internal/matchers/entry-points.js';
import { enforceSingleSlotGroups, resolveOverlaps } from './internal/resolve.js';
import { buildTitle, toAcceptedChips, withSynthesizedDateChip } from './internal/assemble.js';

export function parseQuickAdd(input: ParseQuickAddInput): ParseQuickAddResult {
  const normalized = normalizeNfkc(input.text);
  const protectedRanges = findProtectedRanges(normalized);
  const textLower = normalized.toLowerCase();

  const ctx: MatchContext = {
    now: input.now,
    inherited: input.inherited,
    originalText: normalized,
  };

  // Шаги 3-4: кандидаты каждой категории независимо. Порядок в массиве не
  // влияет на результат — весь precedence разрешается на шаге 5.
  const raw: WorkingCandidate[] = [
    ...matchDeadlineCandidates(textLower, protectedRanges, ctx),
    ...matchRecurrenceCandidates(textLower, protectedRanges, ctx),
    ...matchDateCandidates(textLower, protectedRanges, ctx),
    ...matchWeekdayCandidates(textLower, protectedRanges, ctx),
    ...matchTimeCandidates(textLower, protectedRanges, ctx),
    ...matchDurationCandidates(textLower, protectedRanges, ctx),
    ...matchProjectCandidates(textLower, protectedRanges, ctx),
    ...matchLabelCandidates(textLower, protectedRanges, ctx),
    ...matchPriorityCandidates(textLower, protectedRanges, ctx),
  ];

  // Шаг 5, уровень 1: пересечения диапазонов символов.
  const overlapResolved = resolveOverlaps(raw);
  // Шаг 5, уровень 2: конкуренция за один логический слот задачи без
  // пересечения диапазонов (см. `internal/resolve.ts`).
  const slotResolved = enforceSingleSlotGroups(overlapResolved.accepted);

  const rejected: AnyRejectedCandidate[] = [...overlapResolved.rejected, ...slotResolved.rejected]
    .map((r) => ({
      decision: 'rejected' as const,
      category: r.category,
      span: r.span,
      reason: r.reason,
    }))
    .toSorted((a, b) => a.span.start - b.span.start) as AnyRejectedCandidate[];

  // Шаг 7: приведение к типизированным чипам + синтез Date-чипа по правилу
  // "Time-only без даты" (`01§4`).
  const explicitChips = toAcceptedChips(slotResolved.accepted);
  const chips = withSynthesizedDateChip(explicitChips, input.now, input.inherited);

  // Шаг 9: заголовок после вычистки принятых служебных токенов.
  const title = buildTitle(normalized, chips);

  return { title, chips, rejected };
}
