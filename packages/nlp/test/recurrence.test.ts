import { describe, expect, it } from 'vitest';

import { parseQuickAdd } from '../src/parse.js';
import { chipOf } from './assertions.js';
import { MONDAY } from './helpers.js';

describe('категория Recurrence — только распознавание, без генерации occurrence (эпик E11)', () => {
  it('каждый день', () => {
    const r = parseQuickAdd({ text: 'Зарядка каждый день', now: MONDAY });
    expect(chipOf(r, 'recurrence').value).toEqual({ unit: 'day', interval: 1 });
    expect(r.title.text).toBe('Зарядка');
  });

  it('по будням → неделя с Пн-Пт', () => {
    const r = parseQuickAdd({ text: 'Ходить в спортзал по будням', now: MONDAY });
    expect(chipOf(r, 'recurrence').value).toEqual({
      unit: 'week',
      interval: 1,
      byWeekday: [1, 2, 3, 4, 5],
    });
  });

  it.each([
    ['каждый понедельник', 1],
    ['каждый вторник', 2],
    ['каждую среду', 3],
    ['каждый четверг', 4],
    ['каждую пятницу', 5],
    ['каждую субботу', 6],
    ['каждое воскресенье', 7],
  ])('%s → конкретный день недели (согласование рода)', (phrase, iso) => {
    const r = parseQuickAdd({ text: `Созвон ${phrase}`, now: MONDAY });
    expect(chipOf(r, 'recurrence').value).toEqual({ unit: 'week', interval: 1, byWeekday: [iso] });
  });

  it('каждое N число → месяц', () => {
    const r = parseQuickAdd({ text: 'Платёж каждое 5 число', now: MONDAY });
    expect(chipOf(r, 'recurrence').value).toEqual({ unit: 'month', interval: 1, byMonthDay: 5 });
    expect(r.title.text).toBe('Платёж');
  });

  it('каждое 35 число — невалидный день месяца', () => {
    const r = parseQuickAdd({ text: 'Что-то каждое 35 число', now: MONDAY });
    expect(r.chips).toHaveLength(0);
  });

  it('раз в неделю', () => {
    const r = parseQuickAdd({ text: 'Отчёт раз в неделю', now: MONDAY });
    expect(chipOf(r, 'recurrence').value).toEqual({ unit: 'week', interval: 1 });
  });

  it('раз в месяц / раз в день — та же схема, расширение по аналогии', () => {
    const month = parseQuickAdd({ text: 'Планирование раз в месяц', now: MONDAY });
    const day = parseQuickAdd({ text: 'Витамины раз в день', now: MONDAY });
    expect(chipOf(month, 'recurrence').value).toEqual({ unit: 'month', interval: 1 });
    expect(chipOf(day, 'recurrence').value).toEqual({ unit: 'day', interval: 1 });
  });

  it.each([
    ['каждые 3 дня', { unit: 'day', interval: 3 }],
    ['каждые 2 недели', { unit: 'week', interval: 2 }],
    ['каждые 6 месяцев', { unit: 'month', interval: 6 }],
  ] as const)('%s', (phrase, expected) => {
    const r = parseQuickAdd({ text: `Дело ${phrase}`, now: MONDAY });
    expect(chipOf(r, 'recurrence').value).toEqual(expected);
  });

  it('"по будням" и "каждую пятницу" в одном тексте — конкурируют за один слот, побеждает раньше начинающийся', () => {
    const r = parseQuickAdd({ text: 'Тренировка раз в неделю по будням', now: MONDAY });
    expect(r.chips).toHaveLength(1);
    expect(r.chips[0]?.span?.text).toBe('раз в неделю');
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]).toMatchObject({ category: 'recurrence', reason: 'ambiguousReading' });
    expect(r.title.text).toBe('Тренировка по будням');
  });
});
