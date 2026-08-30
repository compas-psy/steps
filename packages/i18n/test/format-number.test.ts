import { describe, expect, it } from 'vitest';

import { formatNumber } from '../src/index.js';

// ru-RU группирует тысячи неразрывным пробелом U+00A0 (NBSP), не обычным ' '.
const NBSP = ' ';

describe('слой форматирования чисел: Intl.NumberFormat, ru-RU', () => {
  it('разделитель тысяч — неразрывный пробел (ru-RU), не запятая/точка', () => {
    expect(formatNumber(12345)).toBe(`12${NBSP}345`);
  });

  it('десятичный разделитель — запятая (ru-RU)', () => {
    expect(formatNumber(3.5)).toBe('3,5');
  });

  it('опции Intl.NumberFormat пробрасываются насквозь', () => {
    expect(formatNumber(0.42, { style: 'percent' })).toBe(`42${NBSP}%`);
  });
});
