/**
 * Шаги 7 и 9 конвейера: приведение принятых сырых кандидатов к типизированным
 * `AcceptedChip`, синтез неявного/унаследованного Date-чипа для правила
 * "Time-only без даты" (`01§4`), и итоговый заголовок после вычистки
 * принятых служебных токенов (решение `?10`).
 */

import { hasReadableContent, normalizeTitleWhitespace, unicodeLength } from '@shagi/core';
import type { Temporal } from '@js-temporal/polyfill';

import type {
  AnyAcceptedChip,
  ChipCategory,
  ChipValueByCategory,
  InheritedContext,
  NowContext,
  TitleResult,
} from '../types.js';
import type { AcceptedWorkingCandidate } from './resolve.js';
import { resolveTodayOrTomorrowForTime } from './temporal-rules.js';

export function toAcceptedChips(
  candidates: readonly AcceptedWorkingCandidate[],
): AnyAcceptedChip[] {
  return candidates.map((c) => toChip(c));
}

function toChip<C extends ChipCategory>(
  c: AcceptedWorkingCandidate & { category: C },
): AnyAcceptedChip {
  return {
    decision: 'accepted',
    category: c.category,
    span: { start: c.start, end: c.end, text: c.text },
    // Значение уже построено верно типизированным резолвером своей
    // категории (`internal/matchers/*`) — здесь только снятие `unknown`,
    // проверенное по конструкции, не заново валидируемое.
    value: c.outcome.value as ChipValueByCategory[C],
    origin: 'explicit',
  } as AnyAcceptedChip;
}

/**
 * Правило "Time-only без даты" (`01§4`): явный Time-чип без явной/
 * унаследованной/уже присутствующей Date-чипа даты получает синтезированный
 * Date-чип — унаследованный контекст побеждает, иначе Today/Tomorrow по
 * сравнению с текущей локальной минутой. Итоговый Date-чип показан всегда
 * явно (`span: null`, но не отсутствует) — "никогда не угадывать молча".
 */
export function withSynthesizedDateChip(
  chips: readonly AnyAcceptedChip[],
  now: NowContext,
  inherited: InheritedContext | undefined,
): AnyAcceptedChip[] {
  const hasExplicitDate = chips.some((c) => c.category === 'date' || c.category === 'weekday');
  if (hasExplicitDate) {
    return [...chips];
  }
  const timeChip = chips.find((c) => c.category === 'time');
  if (timeChip === undefined) {
    return [...chips];
  }
  const inheritedDate = inherited?.date;
  const synthesized: AnyAcceptedChip =
    inheritedDate !== undefined
      ? {
          decision: 'accepted',
          category: 'date',
          span: null,
          origin: 'inherited',
          value: { date: inheritedDate },
        }
      : {
          decision: 'accepted',
          category: 'date',
          span: null,
          origin: 'implied',
          value: {
            date: resolveTodayOrTomorrowForTime(
              now.date,
              now.time,
              (timeChip.value as { time: Temporal.PlainTime }).time,
            ),
          },
        };
  return [...chips, synthesized];
}

/** Шаг 9 (решение `?10`): удаляет из нормализованного текста только
 * диапазоны принятых чипов — отклонённый/неопознанный текст остаётся как
 * есть. Пробельные "дыры", оставшиеся после удаления, схлопываются в один
 * пробел (иначе "Купить #дом завтра хлеб" превратилось бы в "Купить  хлеб"
 * с двойным пробелом) — это забота NLP над результатом удаления токенов, а
 * не общее правило `normalizeTitleWhitespace` из `@shagi/core` (то отвечает
 * только за CR/LF/TAB сырого пользовательского ввода, до всякого разбора).
 */
export function buildTitle(normalizedText: string, chips: readonly AnyAcceptedChip[]): TitleResult {
  const spans = chips
    .map((c) => c.span)
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .toSorted((a, b) => a.start - b.start);

  let result = '';
  let cursor = 0;
  for (const span of spans) {
    result += normalizedText.slice(cursor, span.start);
    cursor = span.end;
  }
  result += normalizedText.slice(cursor);

  const collapsed = normalizeTitleWhitespace(result.replace(/\s+/g, ' '));

  return {
    text: collapsed,
    readable: hasReadableContent(collapsed),
    length: unicodeLength(collapsed),
  };
}
