import { describe, expect, it } from 'vitest';

import { parseQuickAdd } from '../src/parse.js';
import { chipOf } from './assertions.js';
import { MONDAY } from './helpers.js';

describe('категория Duration', () => {
  it('15 мин', () => {
    const r = parseQuickAdd({ text: 'Зарядка 15 мин', now: MONDAY });
    expect(chipOf(r, 'duration').value.minutes).toBe(15);
    expect(r.title.text).toBe('Зарядка');
  });

  it('45 минут', () => {
    const r = parseQuickAdd({ text: 'Пробежка 45 минут', now: MONDAY });
    expect(chipOf(r, 'duration').value.minutes).toBe(45);
  });

  it('1 час', () => {
    const r = parseQuickAdd({ text: 'Совещание 1 час', now: MONDAY });
    expect(chipOf(r, 'duration').value.minutes).toBe(60);
  });

  it('1 ч 30 мин — комбинированная форма', () => {
    const r = parseQuickAdd({ text: 'Тренировка 1 ч 30 мин', now: MONDAY });
    expect(chipOf(r, 'duration').value.minutes).toBe(90);
    expect(r.title.text).toBe('Тренировка');
  });

  it('полтора часа', () => {
    const r = parseQuickAdd({ text: 'Йога полтора часа', now: MONDAY });
    expect(chipOf(r, 'duration').value.minutes).toBe(90);
  });

  it('полчаса', () => {
    const r = parseQuickAdd({ text: 'Обед полчаса', now: MONDAY });
    expect(chipOf(r, 'duration').value.minutes).toBe(30);
  });

  it('без пробела перед единицей ("1ч")', () => {
    const r = parseQuickAdd({ text: 'Плавание 1ч', now: MONDAY });
    expect(chipOf(r, 'duration').value.minutes).toBe(60);
  });

  it('множественное "часов"', () => {
    const r = parseQuickAdd({ text: 'Сон 8 часов', now: MONDAY });
    expect(chipOf(r, 'duration').value.minutes).toBe(480);
  });

  it('граница — 1440 минут (ровно сутки) валидна', () => {
    const r = parseQuickAdd({ text: 'Работа 1440 минут', now: MONDAY });
    expect(chipOf(r, 'duration').value.minutes).toBe(1440);
  });

  it('> 1440 минут — невалидна', () => {
    const r = parseQuickAdd({ text: 'Работа 1500 минут', now: MONDAY });
    expect(r.chips).toHaveLength(0);
    expect(r.rejected).toContainEqual(
      expect.objectContaining({ category: 'duration', reason: 'invalidDate' }),
    );
  });

  it('0 минут — невалидна (минимум 1)', () => {
    const r = parseQuickAdd({ text: 'Отдых 0 минут', now: MONDAY });
    expect(r.chips).toHaveLength(0);
  });
});
