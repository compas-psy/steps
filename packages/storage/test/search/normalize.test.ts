import { describe, expect, it } from 'vitest';

import { normalizeForSearch, tokenizeForSearch } from '../../src/search/normalize.js';

describe('normalizeForSearch', () => {
  it('приводит к нижнему регистру', () => {
    expect(normalizeForSearch('МОЛОКО')).toBe('молоко');
    expect(normalizeForSearch('IPHONE')).toBe('iphone');
  });

  it('ё=е при сопоставлении в поиске — оба направления', () => {
    expect(normalizeForSearch('Пёс')).toBe(normalizeForSearch('Пес'));
    expect(normalizeForSearch('всё')).toBe(normalizeForSearch('все'));
    expect(normalizeForSearch('Ёлки')).toBe(normalizeForSearch('елки'));
  });

  it('обрезает пробелы по краям', () => {
    expect(normalizeForSearch('  молоко  ')).toBe('молоко');
  });

  it('NFKC схлопывает совместимые формы Unicode (полноширинные цифры)', () => {
    // U+FF11 FULLWIDTH DIGIT ONE → '1' после NFKC.
    expect(normalizeForSearch('１')).toBe('1');
  });
});

describe('tokenizeForSearch', () => {
  it('разбивает по границам не-буквенно-цифровых символов', () => {
    expect(tokenizeForSearch('купить молоко')).toEqual(['купить', 'молоко']);
    expect(tokenizeForSearch('купить  iphone!')).toEqual(['купить', 'iphone']);
  });

  it('пустая строка — пустой список токенов', () => {
    expect(tokenizeForSearch('')).toEqual([]);
  });

  it('строка из одних разделителей — пустой список токенов', () => {
    expect(tokenizeForSearch('   ---   ')).toEqual([]);
  });
});
