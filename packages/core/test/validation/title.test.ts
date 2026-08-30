import { describe, expect, it } from 'vitest';

import {
  hasReadableContent,
  normalizeTitleWhitespace,
  unicodeLength,
} from '../../src/validation/title.js';

describe('normalizeTitleWhitespace (§2 п.14: CR/LF/TAB → один пробел)', () => {
  it('перевод строки схлопывается в пробел', () => {
    expect(normalizeTitleWhitespace('Купить\nмолоко')).toBe('Купить молоко');
  });

  it('таб схлопывается в пробел', () => {
    expect(normalizeTitleWhitespace('Купить\tмолоко')).toBe('Купить молоко');
  });

  it('CRLF-пара схлопывается в один пробел, а не два', () => {
    expect(normalizeTitleWhitespace('Купить\r\nмолоко')).toBe('Купить молоко');
  });

  it('ведущие/замыкающие пробелы обрезаются (trim)', () => {
    expect(normalizeTitleWhitespace('  Купить молоко  ')).toBe('Купить молоко');
  });

  it('несколько подряд CR/LF/TAB — один пробел, а не несколько', () => {
    expect(normalizeTitleWhitespace('Купить\n\n\tмолоко')).toBe('Купить молоко');
  });
});

describe('unicodeLength (счёт по кодовым точкам, не UTF-16 code units)', () => {
  it('обычная кириллица считается посимвольно', () => {
    expect(unicodeLength('Купить молоко')).toBe(13);
  });

  it('astral-символ (эмодзи вне BMP) считается одним символом, не двумя', () => {
    expect(unicodeLength('🎉')).toBe(1);
    expect('🎉'.length).toBe(2); // UTF-16 surrogate-пара — именно то расхождение, которое ловит unicodeLength
  });
});

describe('hasReadableContent (решение ?10: только пробелы/пунктуация — не читаемый текст)', () => {
  it('обычный текст — читаемый', () => {
    expect(hasReadableContent('Купить молоко')).toBe(true);
  });

  it('только пунктуация — не читаемый', () => {
    expect(hasReadableContent('...')).toBe(false);
    expect(hasReadableContent('!!!')).toBe(false);
    expect(hasReadableContent('—')).toBe(false);
  });

  it('только пробелы — не читаемый', () => {
    expect(hasReadableContent('   ')).toBe(false);
  });

  it('пунктуация вперемешку с пробелами — не читаемый', () => {
    expect(hasReadableContent(' - , . ')).toBe(false);
  });

  it('один читаемый символ среди пунктуации — читаемый', () => {
    expect(hasReadableContent('...a')).toBe(true);
  });

  it('пустая строка — не читаемый (вырожденный случай)', () => {
    expect(hasReadableContent('')).toBe(false);
  });
});
