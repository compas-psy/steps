/**
 * Бытовые формулировки, которых грамматика не покрывала, хотя сама
 * конструкция в ней уже была.
 *
 * Найдено прогоном тридцати обиходных русских фраз через парсер — не
 * рассуждением о том, чего может не хватать. Общее у всех трёх случаев
 * одно: в грамматике описан ОДИН падеж или ОДНА форма, а человек пишет
 * другую, столь же обычную.
 */
import { describe, expect, it } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';

import { parseQuickAdd } from '../src/index.js';
import { now } from './helpers.js';

/** Понедельник 31 августа 2026, 10:00 — как в золотом корпусе. */
const MON = now('2026-08-31', '10:00');

function parseDate(text: string): { title: string; date: string | undefined } {
  const result = parseQuickAdd({ text, now: MON });
  const chip = result.chips.find((c) => c.category === 'date' || c.category === 'weekday');
  return {
    title: result.title.text,
    date:
      chip !== undefined && (chip.category === 'date' || chip.category === 'weekday')
        ? (chip.value.date as Temporal.PlainDate).toString()
        : undefined,
  };
}

describe('«через <единица>» без числа', () => {
  it.each([
    ['Продлить страховку через неделю', '2026-09-07'],
    ['Позвонить через день', '2026-09-01'],
  ])('«%s» → %s', (text, expected) => {
    expect(parseDate(text).date).toBe(expected);
  });

  it('число, если оно есть, по-прежнему работает', () => {
    expect(parseDate('Оплатить интернет через 3 дня').date).toBe('2026-09-03');
  });

  it('служебные слова уходят из названия', () => {
    expect(parseDate('Продлить страховку через неделю').title).toBe('Продлить страховку');
  });
});

describe('«на следующей неделе» — предложный падеж', () => {
  it('разбирается так же, как «следующая неделя»', () => {
    // Обе формы обязаны давать понедельник следующей недели.
    expect(parseDate('Съездить на дачу на следующей неделе').date).toBe(
      parseDate('Съездить на дачу следующая неделя').date,
    );
    expect(parseDate('Съездить на дачу на следующей неделе').date).toBe('2026-09-07');
  });

  it('служебные слова уходят из названия', () => {
    expect(parseDate('Съездить на дачу на следующей неделе').title).toBe('Съездить на дачу');
  });
});

describe('«до <день недели>» — дедлайн по дню недели', () => {
  it('«до пятницы» даёт дедлайн, а не остаётся текстом', () => {
    const result = parseQuickAdd({ text: 'Подготовить презентацию до пятницы', now: MON });
    const deadline = result.chips.find((c) => c.category === 'deadline');
    expect(deadline).toBeDefined();
    if (deadline?.category !== 'deadline') return;
    expect(deadline.value.date.toString()).toBe('2026-09-04');
    expect(result.title.text).toBe('Подготовить презентацию');
  });

  it('«до свидания» дедлайном не становится', () => {
    const result = parseQuickAdd({ text: 'Сказать до свидания', now: MON });
    expect(result.chips.find((c) => c.category === 'deadline')).toBeUndefined();
    expect(result.title.text).toBe('Сказать до свидания');
  });
});
