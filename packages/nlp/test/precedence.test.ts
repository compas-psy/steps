import { describe, expect, it } from 'vitest';

import { parseQuickAdd } from '../src/parse.js';
import { chipOf, categoriesOf } from './assertions.js';
import { MONDAY } from './helpers.js';

describe('шаг 5: детерминированный precedence', () => {
  describe('пересечение диапазонов — Deadline поглощает вложенную дату/время', () => {
    it('дата внутри "до <дата>" не появляется отдельным отклонённым кандидатом', () => {
      const r = parseQuickAdd({ text: 'Отчёт до 5 сентября', now: MONDAY });
      expect(categoriesOf(r)).toEqual(['deadline']);
      expect(r.rejected).toHaveLength(0);
    });

    it('невалидная дата внутри дедлайна — один отклонённый кандидат, не два', () => {
      const r = parseQuickAdd({ text: 'Ответить клиенту до 30 февраля', now: MONDAY });
      expect(r.rejected).toHaveLength(1);
      expect(r.rejected[0]).toMatchObject({ category: 'deadline' });
    });
  });

  describe('конкуренция за один слот без пересечения диапазонов', () => {
    it('дата и weekday — один и тот же логический слот "дата задачи"', () => {
      const r = parseQuickAdd({ text: 'Сходить завтра в пятницу', now: MONDAY });
      expect(r.chips).toHaveLength(1);
      expect(r.chips[0]).toMatchObject({ category: 'date' });
      expect(r.chips[0]?.span?.text).toBe('завтра');
      expect(r.rejected).toHaveLength(1);
      expect(r.rejected[0]).toMatchObject({ category: 'weekday', reason: 'ambiguousReading' });
      expect(r.title.text).toBe('Сходить в пятницу');
    });

    it('обратный порядок — weekday раньше в тексте побеждает date', () => {
      const r = parseQuickAdd({ text: 'Сходить в пятницу или завтра', now: MONDAY });
      expect(r.chips).toHaveLength(1);
      expect(r.chips[0]).toMatchObject({ category: 'weekday' });
      expect(r.rejected[0]).toMatchObject({ category: 'date', reason: 'ambiguousReading' });
    });
  });

  it('label — единственная категория без ограничения на один слот', () => {
    const r = parseQuickAdd({ text: 'Задача @a @b @c', now: MONDAY });
    const labels = r.chips.filter((c) => c.category === 'label');
    expect(labels).toHaveLength(3);
    expect(r.rejected).toHaveLength(0);
  });

  it('Date и Time — независимые слоты, оба принимаются одновременно', () => {
    const r = parseQuickAdd({ text: 'Позвонить завтра в 9:30', now: MONDAY });
    expect(categoriesOf(r)).toEqual(['date', 'time']);
  });

  it('Deadline и Date — независимые поля задачи (deadline ≠ planned date)', () => {
    const r = parseQuickAdd({ text: 'Сходить на почту завтра до 12', now: MONDAY });
    expect(categoriesOf(r)).toEqual(['date', 'deadline']);
    expect(chipOf(r, 'date').span?.text).toBe('завтра');
  });

  it('"через 2 часа" — известное ограничение: читается как Duration, не как относительная дата', () => {
    // R1 грамматика "через N" для Date поддерживает только дней/недель
    // (`01§4`); часы попадают под грамматику Duration ("N часов"), что и
    // происходит здесь — задокументированное поведение, не баг.
    const r = parseQuickAdd({
      text: 'Заказать пиццу @друзья #вечеринка через 2 часа',
      now: MONDAY,
    });
    expect(categoriesOf(r)).toEqual(['duration', 'label', 'project']);
    expect(chipOf(r, 'duration').value.minutes).toBe(120);
  });
});
