import type { Temporal } from '@js-temporal/polyfill';

import type { AnyAcceptedChip, ChipCategory, ParseQuickAddResult } from '../src/types.js';

/** Единственный принятый чип данной категории (падает, если их не ровно
 * один — большинству тестов нужен именно один чип, и явный провал лучше,
 * чем незаметно проверить не тот чип). */
export function chipOf<C extends ChipCategory>(
  result: ParseQuickAddResult,
  category: C,
): Extract<AnyAcceptedChip, { category: C }> {
  const matches = result.chips.filter((c) => c.category === category);
  if (matches.length !== 1) {
    throw new Error(
      `ожидался ровно один чип категории "${category}", найдено ${matches.length}: ${JSON.stringify(result.chips)}`,
    );
  }
  return matches[0] as Extract<AnyAcceptedChip, { category: C }>;
}

export function categoriesOf(result: ParseQuickAddResult): ChipCategory[] {
  return result.chips.map((c) => c.category).toSorted();
}

export function rejectedCategoriesOf(result: ParseQuickAddResult): ChipCategory[] {
  return result.rejected.map((c) => c.category).toSorted();
}

export function dateIso(date: Temporal.PlainDate): string {
  return date.toString();
}

export function timeIso(time: Temporal.PlainTime): string {
  return time.toString({ smallestUnit: 'minute' });
}
