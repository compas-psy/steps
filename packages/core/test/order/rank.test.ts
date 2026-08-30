import { describe, expect, it } from 'vitest';

import { initialRank, isRank, rankAfter, rankBefore, rankBetween } from '../../src/order/rank.js';
import type { Rank } from '../../src/values.js';

describe('initialRank', () => {
  it('возвращает валидный ранг для пустого списка', () => {
    expect(isRank(initialRank())).toBe(true);
  });

  it('детерминирован', () => {
    expect(initialRank()).toBe(initialRank());
  });
});

describe('rankAfter / rankBefore — базовый порядок', () => {
  it('rankAfter(a) сортируется после a', () => {
    const a = initialRank();
    const b = rankAfter(a);
    expect(a < b).toBe(true);
  });

  it('rankBefore(a) сортируется перед a', () => {
    const a = initialRank();
    const b = rankBefore(a);
    expect(b < a).toBe(true);
  });

  it('rankBefore(rankAfter(a)) не обязан совпадать с a, но остаётся между границами не хуже a', () => {
    const a = initialRank();
    const after = rankAfter(a);
    const beforeAfter = rankBefore(after);
    expect(beforeAfter < after).toBe(true);
  });
});

describe('rankBetween — базовый порядок', () => {
  it('результат строго между границами', () => {
    const a = initialRank();
    const b = rankAfter(a);
    const middle = rankBetween(a, b);
    expect(a < middle).toBe(true);
    expect(middle < b).toBe(true);
  });

  it('отклоняет a >= b', () => {
    const a = initialRank();
    const b = rankAfter(a);
    expect(() => rankBetween(b, a)).toThrow(RangeError);
    expect(() => rankBetween(a, a)).toThrow(RangeError);
  });

  it('можно вставлять между результатом и границей сколько угодно раз подряд (не упирается сразу)', () => {
    let lower = initialRank();
    let upper = rankAfter(lower);
    for (let i = 0; i < 50; i++) {
      const mid = rankBetween(lower, upper);
      expect(lower < mid).toBe(true);
      expect(mid < upper).toBe(true);
      upper = mid; // сжимаем интервал слева направо — классический "плохой" сценарий
    }
  });
});

describe('isRank — формат и инвариант "не оканчивается на минимальную цифру"', () => {
  it('принимает то, что производят конструкторы этого модуля', () => {
    const a = initialRank();
    const b = rankAfter(a);
    const c = rankBefore(a);
    const d = rankBetween(a, b);
    expect([a, b, c, d].every(isRank)).toBe(true);
  });

  it('отклоняет пустую строку', () => {
    expect(isRank('')).toBe(false);
  });

  it('отклоняет символы вне алфавита base62', () => {
    expect(isRank('A_B')).toBe(false);
    expect(isRank('AБ')).toBe(false); // кириллица
  });

  it('отклоняет строку, оканчивающуюся на минимальную цифру алфавита ("0")', () => {
    expect(isRank('A0')).toBe(false);
    expect(isRank('0')).toBe(false);
  });

  it('принимает строку, где "0" — не последний символ', () => {
    expect(isRank('0A')).toBe(true);
    expect(isRank('A0B')).toBe(true);
  });
});

describe('границы: соседние ранги "без места" в одном разряде', () => {
  it('между двумя рангами, чьи первые различающиеся цифры соседние, всё равно находится ранг', () => {
    // 'A' и 'B' — соседние символы алфавита (индексы 10 и 11): "зазор" в
    // один разряд, между ними нет свободного одноразрядного значения.
    const a = 'A' as Rank;
    const b = 'B' as Rank;
    const mid = rankBetween(a, b);
    expect(a < mid).toBe(true);
    expect(mid < b).toBe(true);
    expect(isRank(mid)).toBe(true);
  });

  it('то же самое для соседних цифр на конце более длинных рангов', () => {
    const a = 'AAB' as Rank;
    const b = 'AAC' as Rank;
    const mid = rankBetween(a, b);
    expect(a < mid).toBe(true);
    expect(mid < b).toBe(true);
    expect(isRank(mid)).toBe(true);
  });
});

describe('границы: ранг длиной ровно на пороге ренормализации (64)', () => {
  it('rankAfter/rankBefore на ранге длины 64 сохраняют порядок и валидность', () => {
    const longRank = 'z'.repeat(64) as Rank; // 'z' — максимальная цифра алфавита
    const after = rankAfter(longRank);
    const before = rankBefore(longRank);
    expect(longRank < after).toBe(true);
    expect(before < longRank).toBe(true);
    expect(isRank(after)).toBe(true);
    expect(isRank(before)).toBe(true);
  });

  it('rankBetween работает с одной из границ длины 64', () => {
    const longRank = 'z'.repeat(64) as Rank;
    const after = rankAfter(longRank);
    const mid = rankBetween(longRank, after);
    expect(longRank < mid).toBe(true);
    expect(mid < after).toBe(true);
  });
});
