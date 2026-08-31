/**
 * Шаг 5 конвейера — детерминированный precedence при конфликтующих
 * кандидатах. Два независимых уровня конфликта:
 *
 * 1. Пересечение диапазонов символов (`resolveOverlaps`) — например,
 *    "5 сентября" внутри "до 5 сентября" пересекается с самим Deadline-
 *    кандидатом. Разрешается жадным проходом слева направо: раньше
 *    начинающийся и/или более приоритетная категория выигрывает; всё, что
 *    целиком вложено в принятый Deadline, тихо поглощается (это не
 *    "неоднозначность" для пользователя, а составная часть уже принятого
 *    чипа); остальные проигравшие идут в отклонённые с причиной
 *    `overlapLostPrecedence`.
 * 2. Конкуренция за один и тот же логический "слот" задачи БЕЗ пересечения
 *    диапазонов (`enforceSingleSlotGroups`) — например, "5 сентября ...
 *    в пятницу" в одном тексте: оба матчатся в разных местах текста, но у
 *    задачи только одна Planned Date. Здесь порядок другой: побеждает то,
 *    что раньше НАЧИНАЕТСЯ в тексте, проигравшее — `ambiguousReading`
 *    (это настоящая двусмысленность, а не техническое поглощение).
 *
 * Метки (`label`) — единственная категория, которой разрешено несколько
 * принятых чипов одновременно (задача может нести несколько меток).
 */

import type { ChipCategory, RejectionReason, SourceSpan } from '../types.js';
import type { WorkingCandidate } from './candidates.js';
import { rangesOverlap } from './text.js';

/** Ниже число — выше приоритет при разрешении конфликта РАВНОЙ длины и
 * начальной позиции (на практике решает исход редко: пересечения почти
 * всегда разной длины/позиции и потому уже разрешены сортировкой). */
const CATEGORY_PRIORITY: Record<ChipCategory, number> = {
  deadline: 0,
  recurrence: 1,
  date: 2,
  weekday: 3,
  time: 4,
  duration: 5,
  project: 6,
  label: 7,
  priority: 8,
};

export interface RejectedSpan {
  readonly category: ChipCategory;
  readonly span: SourceSpan;
  readonly reason: RejectionReason;
}

export interface AcceptedWorkingCandidate extends WorkingCandidate {
  readonly outcome: { kind: 'valid'; value: unknown };
}

export interface ResolveOutput {
  readonly accepted: readonly AcceptedWorkingCandidate[];
  readonly rejected: readonly RejectedSpan[];
}

function toSpan(c: WorkingCandidate): SourceSpan {
  return { start: c.start, end: c.end, text: c.text };
}

/**
 * Валидные и невалидные кандидаты идут ЧЕРЕЗ ОДИН проход, а не раздельно:
 * если бы невалидный Deadline ("до 30 февраля") обрабатывался отдельно от
 * вложенного в него невалидного Date ("30 февраля"), пользователь увидел бы
 * ДВА отклонённых кандидата про одну и ту же проблему. В едином проходе
 * Deadline (начинается раньше) первым застолбит свой диапазон — валидный он
 * или нет, — и вложенный Date будет молча поглощён им же, как и в
 * полностью валидном случае.
 */
export function resolveOverlaps(candidates: readonly WorkingCandidate[]): ResolveOutput {
  const sorted = candidates.toSorted((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    const pa = CATEGORY_PRIORITY[a.category];
    const pb = CATEGORY_PRIORITY[b.category];
    if (pa !== pb) {
      return pa - pb;
    }
    return b.end - b.start - (a.end - a.start);
  });

  interface Occupied {
    readonly start: number;
    readonly end: number;
    readonly category: ChipCategory;
  }
  const occupied: Occupied[] = [];
  const accepted: AcceptedWorkingCandidate[] = [];
  const rejected: RejectedSpan[] = [];

  for (const candidate of sorted) {
    const blocking = occupied.find((o) =>
      rangesOverlap(o.start, o.end, candidate.start, candidate.end),
    );
    if (blocking === undefined) {
      occupied.push({ start: candidate.start, end: candidate.end, category: candidate.category });
      if (candidate.outcome.kind === 'valid') {
        accepted.push(candidate as AcceptedWorkingCandidate);
      } else {
        rejected.push({
          category: candidate.category,
          span: toSpan(candidate),
          reason: candidate.outcome.reason,
        });
      }
      continue;
    }
    const isAbsorbedByDeadline =
      blocking.category === 'deadline' &&
      candidate.start >= blocking.start &&
      candidate.end <= blocking.end;
    if (isAbsorbedByDeadline) {
      continue;
    }
    const reason =
      candidate.outcome.kind === 'invalid' ? candidate.outcome.reason : 'overlapLostPrecedence';
    rejected.push({ category: candidate.category, span: toSpan(candidate), reason });
  }

  return { accepted, rejected };
}

/** Категории, объединённые правилом "у задачи только одно значение этого
 * слота" (`01§4`, `02§2` — Planned Date/Planned Time/Deadline/Duration/
 * Recurrence/Project/Priority каждое ровно одно поле на Task). Date и
 * Weekday — один и тот же слот "дата задачи" под разными именами
 * категории. */
const SINGLE_SLOT_GROUPS: readonly (readonly ChipCategory[])[] = [
  ['date', 'weekday'],
  ['time'],
  ['deadline'],
  ['duration'],
  ['recurrence'],
  ['project'],
  ['priority'],
];

export function enforceSingleSlotGroups(
  accepted: readonly AcceptedWorkingCandidate[],
): ResolveOutput {
  const kept: AcceptedWorkingCandidate[] = [];
  const demoted: RejectedSpan[] = [];

  for (const group of SINGLE_SLOT_GROUPS) {
    const members = accepted
      .filter((c) => group.includes(c.category))
      .toSorted((a, b) => a.start - b.start);
    members.forEach((candidate, index) => {
      if (index === 0) {
        kept.push(candidate);
      } else {
        demoted.push({
          category: candidate.category,
          span: toSpan(candidate),
          reason: 'ambiguousReading',
        });
      }
    });
  }

  // Метки — единственная категория без слот-ограничения, проходят как есть.
  for (const candidate of accepted) {
    if (candidate.category === 'label') {
      kept.push(candidate);
    }
  }

  return { accepted: kept.toSorted((a, b) => a.start - b.start), rejected: demoted };
}
