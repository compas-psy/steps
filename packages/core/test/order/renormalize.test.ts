import { describe, expect, it } from 'vitest';

import {
  anyNeedsRenormalization,
  needsRenormalization,
  RANK_RENORMALIZE_THRESHOLD_LENGTH,
  renormalizeRanks,
} from '../../src/order/renormalize.js';
import { initialRank, isRank, rankAfter, rankBetween } from '../../src/order/rank.js';
import type { Rank } from '../../src/values.js';

describe('needsRenormalization', () => {
  it('false для коротких рангов', () => {
    expect(needsRenormalization(initialRank())).toBe(false);
  });

  it('true ровно на пороге и выше (02§5, решение ?2: 64 символа)', () => {
    expect(RANK_RENORMALIZE_THRESHOLD_LENGTH).toBe(64);
    expect(needsRenormalization('a'.repeat(63) as Rank)).toBe(false);
    expect(needsRenormalization('a'.repeat(64) as Rank)).toBe(true);
    expect(needsRenormalization('a'.repeat(65) as Rank)).toBe(true);
  });
});

describe('anyNeedsRenormalization', () => {
  it('false, если ни один элемент не достиг порога', () => {
    expect(anyNeedsRenormalization([initialRank(), rankAfter(initialRank())])).toBe(false);
  });

  it('true, если хотя бы один элемент достиг порога', () => {
    const short = initialRank();
    const long = 'a'.repeat(64) as Rank;
    expect(anyNeedsRenormalization([short, long])).toBe(true);
  });

  it('false для пустого списка', () => {
    expect(anyNeedsRenormalization([])).toBe(false);
  });
});

describe('renormalizeRanks — базовые случаи', () => {
  it('пустой список -> пустой список', () => {
    expect(renormalizeRanks([])).toEqual([]);
  });

  it('список из одного элемента -> один валидный ранг', () => {
    const [only] = renormalizeRanks([initialRank()]);
    expect(only).toBeDefined();
    expect(isRank(only!)).toBe(true);
  });

  it('сохраняет длину списка', () => {
    const original = buildAscendingRanks(37);
    expect(renormalizeRanks(original)).toHaveLength(37);
  });

  it('отклоняет список, не отсортированный по возрастанию', () => {
    const a = initialRank();
    const b = rankAfter(a);
    expect(() => renormalizeRanks([b, a])).toThrow(RangeError);
  });

  it('отклоняет список с повторяющимся рангом (не строго возрастает)', () => {
    const a = initialRank();
    expect(() => renormalizeRanks([a, a])).toThrow(RangeError);
  });
});

describe('renormalizeRanks — сохранение относительного порядка', () => {
  it('результат строго возрастает для списков разного размера', () => {
    for (const size of [0, 1, 2, 3, 5, 10, 61, 62, 63, 100, 1000, 10000]) {
      const fresh = renormalizeRanks(buildAscendingRanks(size));
      expect(fresh).toHaveLength(size);
      for (let i = 1; i < fresh.length; i++) {
        expect(fresh[i - 1]! < fresh[i]!).toBe(true);
      }
      for (const rank of fresh) {
        expect(isRank(rank)).toBe(true);
      }
    }
  });

  it('ренормализация списка, доросшего до порога через сжатие интервала, возвращает короткие ранги', () => {
    // Строим длинные ранги через повторное сжатие интервала (как в
    // rank.property.test.ts), затем ренормализуем и проверяем, что новый
    // набор существенно короче старого и остаётся строго возрастающим.
    const lower = 'A' as Rank;
    let upper = 'B' as Rank; // соседние цифры — сжатие начинает "болеть" с первой же вставки
    const squeezed: Rank[] = [lower, upper];
    for (let i = 0; i < 500; i++) {
      const mid = rankBetween(lower, upper);
      squeezed.push(mid);
      upper = mid; // каждый следующий mid зажат ещё туже между lower и предыдущим mid
    }
    const ordered = squeezed.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const maxOldLength = Math.max(...ordered.map((rank) => rank.length));
    expect(maxOldLength).toBeGreaterThan(10); // подтверждаем, что старые ранги действительно распухли

    const fresh = renormalizeRanks(ordered);
    const maxNewLength = Math.max(...fresh.map((rank) => rank.length));
    expect(maxNewLength).toBeLessThan(maxOldLength);
    expect(maxNewLength).toBeLessThan(RANK_RENORMALIZE_THRESHOLD_LENGTH);
    for (let i = 1; i < fresh.length; i++) {
      expect(fresh[i - 1]! < fresh[i]!).toBe(true);
    }
  });

  it('10 000 элементов после ренормализации умещаются далеко ниже порога (логарифмический рост)', () => {
    const fresh = renormalizeRanks(buildAscendingRanks(10_000));
    const maxLength = Math.max(...fresh.map((rank) => rank.length));
    expect(maxLength).toBeLessThan(RANK_RENORMALIZE_THRESHOLD_LENGTH);
    // eslint-disable-next-line no-console -- диагностика прогона, число нужно в отчёте
    console.log(`[renormalize] 10000 элементов -> maxRankLength=${maxLength}`);
  });
});

/** N строго возрастающих валидных рангов подряд — вспомогательное для тестов. */
function buildAscendingRanks(count: number): Rank[] {
  const result: Rank[] = [];
  let previous: Rank | null = null;
  for (let i = 0; i < count; i++) {
    const next: Rank = previous === null ? initialRank() : rankAfter(previous);
    result.push(next);
    previous = next;
  }
  return result;
}
