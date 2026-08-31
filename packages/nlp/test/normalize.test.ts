import { describe, expect, it } from 'vitest';

import { normalizeNfkc } from '../src/internal/text.js';
import { parseQuickAdd } from '../src/parse.js';
import { chipOf, dateIso } from './assertions.js';
import { MONDAY } from './helpers.js';

describe('шаг 1: Unicode NFKC-нормализация', () => {
  it('приводит полноширинные цифры к обычным ASCII', () => {
    expect(normalizeNfkc('１１')).toBe('11');
  });

  it('приводит полноширинную пунктуацию к обычной', () => {
    expect(normalizeNfkc('０５.０９.２０２６')).toBe('05.09.2026');
    expect(normalizeNfkc('！')).toBe('!');
  });

  it('не меняет обычный кириллический текст', () => {
    const text = 'Купить хлеб и молоко';
    expect(normalizeNfkc(text)).toBe(text);
  });

  it('нормализация происходит до лексера — полноширинное время распознаётся как обычное', () => {
    const result = parseQuickAdd({ text: 'Позвонить в １１', now: MONDAY });
    const time = chipOf(result, 'time');
    expect(time.span?.text).toBe('в 11');
    expect(time.value.time.toString()).toBe('11:00:00');
  });

  it('нормализация происходит до лексера — полноширинная дата распознаётся как обычная', () => {
    const result = parseQuickAdd({ text: 'Дедлайн ０５.０９.２０２６', now: MONDAY });
    const date = chipOf(result, 'date');
    expect(dateIso(date.value.date)).toBe('2026-09-05');
  });
});
