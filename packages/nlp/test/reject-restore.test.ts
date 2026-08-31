import { describe, expect, it } from 'vitest';

import { parseQuickAdd } from '../src/parse.js';
import { MONDAY } from './helpers.js';

/**
 * "Отклонённый чип восстанавливает исходный текст ровно один раз" (`01§4`).
 * На уровне структуры данных это гарантировано по построению: заголовок
 * вычищает только диапазоны ПРИНЯТЫХ чипов (`internal/assemble.ts`), а
 * значит текст отклонённого/неоднозначного кандидата никогда и не
 * покидал заголовок — восстанавливать (в будущем UI-состоянии
 * `packages/app`) нечего добавлять заново, только не убирать. Эти тесты
 * проверяют инвариант, на который это будущее состояние опирается:
 * `span.text` отклонённого кандидата — точная подстрока исходного текста,
 * и она уже присутствует в итоговом заголовке.
 */
describe('отклонённый кандидат и восстановление текста', () => {
  it('span.text отклонённого кандидата — точная подстрока нормализованного текста', () => {
    const text = 'Ответить клиенту до 30 февраля';
    const r = parseQuickAdd({ text, now: MONDAY });
    expect(r.rejected).toHaveLength(1);
    const span = r.rejected[0]!.span;
    expect(text.slice(span.start, span.end)).toBe(span.text);
  });

  it('текст отклонённого кандидата остаётся частью заголовка (нечего восстанавливать)', () => {
    const r = parseQuickAdd({ text: 'Задача !1 и ещё !3', now: MONDAY });
    expect(r.rejected).toHaveLength(1);
    expect(r.title.text).toContain(r.rejected[0]!.span.text);
  });

  it('несколько отклонений — каждый span.text по отдельности присутствует в заголовке', () => {
    const text = 'Сходить завтра в пятницу или послезавтра';
    const r = parseQuickAdd({ text, now: MONDAY });
    expect(r.rejected.length).toBeGreaterThanOrEqual(1);
    for (const rejected of r.rejected) {
      expect(text.slice(rejected.span.start, rejected.span.end)).toBe(rejected.span.text);
      expect(r.title.text).toContain(rejected.span.text);
    }
  });

  it('принятый чип, наоборот, отсутствует в заголовке (его диапазон вычищен)', () => {
    const r = parseQuickAdd({ text: 'Купить хлеб завтра', now: MONDAY });
    const accepted = r.chips.find((c) => c.span !== null);
    expect(accepted).toBeDefined();
    expect(r.title.text).not.toContain(accepted!.span!.text);
  });

  it('склеивание заголовка обратно с принятыми спанами восстанавливает нормализованный текст', () => {
    const text = 'Купить хлеб #дом @важное завтра в 15:00';
    const r = parseQuickAdd({ text, now: MONDAY });
    const spans = r.chips
      .map((c) => c.span)
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .toSorted((a, b) => a.start - b.start);
    let rebuilt = '';
    let cursor = 0;
    for (const span of spans) {
      rebuilt += text.slice(cursor, span.start);
      cursor = span.end;
    }
    rebuilt += text.slice(cursor);
    // Заголовок — тот же текст, но со схлопнутыми пробелами; после
    // схлопывания пробелов оба совпадают.
    expect(rebuilt.replace(/\s+/g, ' ').trim()).toBe(r.title.text);
  });
});
