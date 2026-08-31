import { describe, expect, it } from 'vitest';

import { parseQuickAdd } from '../src/parse.js';
import { chipOf, dateIso } from './assertions.js';
import { MONDAY, now } from './helpers.js';

describe('категория Date', () => {
  it('сегодня', () => {
    const r = parseQuickAdd({ text: 'Купить хлеб сегодня', now: MONDAY });
    expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-08-31');
    expect(r.title.text).toBe('Купить хлеб');
  });

  it('завтра', () => {
    const r = parseQuickAdd({ text: 'Забрать посылку завтра', now: MONDAY });
    expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-01');
    expect(r.title.text).toBe('Забрать посылку');
  });

  it('послезавтра', () => {
    const r = parseQuickAdd({ text: 'Сдать отчёт послезавтра', now: MONDAY });
    expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-02');
    expect(r.title.text).toBe('Сдать отчёт');
  });

  it('"завтра" не ложно матчится внутри "послезавтра"', () => {
    const r = parseQuickAdd({ text: 'Сдать отчёт послезавтра', now: MONDAY });
    expect(r.chips).toHaveLength(1);
    expect(r.chips[0]?.span?.text).toBe('послезавтра');
  });

  describe('выходные — сегодня, если сегодня уже выходной, иначе ближайшая суббота', () => {
    it('в понедельник — ближайшая суббота', () => {
      const r = parseQuickAdd({ text: 'Дача на выходные', now: MONDAY });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-05');
    });
    it('в пятницу — ближайшая суббота (завтра)', () => {
      const r = parseQuickAdd({ text: 'Дача на выходные', now: now('2026-09-04', '10:00') });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-05');
    });
    it('в субботу — сегодня же, не следующая суббота', () => {
      const r = parseQuickAdd({ text: 'Отдых на выходные', now: now('2026-09-05', '10:00') });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-05');
    });
    it('в воскресенье — сегодня же', () => {
      const r = parseQuickAdd({ text: 'Отдых на выходные', now: now('2026-09-06', '10:00') });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-06');
    });
  });

  describe('следующая неделя — следующий понедельник, никогда не текущий', () => {
    it('от понедельника — через 7 дней, не сегодня', () => {
      const r = parseQuickAdd({ text: 'Следующая неделя — сдать проект', now: MONDAY });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-07');
      expect(r.title.text).toBe('— сдать проект');
    });
    it('от воскресенья — понедельник сразу после', () => {
      const r = parseQuickAdd({
        text: 'следующая неделя подготовка к конференции',
        now: now('2026-09-06', '10:00'),
      });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-07');
    });
  });

  describe('через N дней/недель', () => {
    it('через 3 дня', () => {
      const r = parseQuickAdd({ text: 'Позвонить через 3 дня', now: MONDAY });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-03');
      expect(r.title.text).toBe('Позвонить');
    });
    it('через 1 день (единственное число)', () => {
      const r = parseQuickAdd({ text: 'Заплатить через 1 день', now: MONDAY });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-01');
    });
    it('через 2 недели', () => {
      const r = parseQuickAdd({ text: 'Продлить страховку через 2 недели', now: MONDAY });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-14');
    });
    it('через 1 неделю', () => {
      const r = parseQuickAdd({ text: 'Сдать книгу через 1 неделю', now: MONDAY });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-07');
    });
    it('"через дорогу" — ложное срабатывание не происходит', () => {
      const r = parseQuickAdd({ text: 'Перейти через дорогу', now: MONDAY });
      expect(r.chips).toHaveLength(0);
    });
  });

  describe('явная календарная дата словом', () => {
    it('день + месяц родительный падеж', () => {
      const r = parseQuickAdd({ text: 'Встреча 5 сентября', now: MONDAY });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-05');
      expect(r.title.text).toBe('Встреча');
    });
    it('регистр месяца не важен', () => {
      const r = parseQuickAdd({ text: 'Встреча 5 Сентября', now: MONDAY });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-05');
    });
    it('без года — берётся текущий год, без переноса на следующий', () => {
      const r = parseQuickAdd({ text: 'Дедлайн 1 января', now: MONDAY });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-01-01');
    });
    it('30 февраля — невалидная дата, temporal-валидация отклоняет', () => {
      const r = parseQuickAdd({ text: 'Встреча 30 февраля', now: MONDAY });
      expect(r.chips).toHaveLength(0);
      expect(r.rejected).toEqual([
        expect.objectContaining({
          category: 'date',
          reason: 'invalidDate',
          span: expect.objectContaining({ text: '30 февраля' }),
        }),
      ]);
      expect(r.title.text).toBe('Встреча 30 февраля');
    });
    it('29 февраля в невисокосный год — невалидна', () => {
      const r = parseQuickAdd({ text: 'Собрание 29 февраля', now: MONDAY }); // 2026 не високосный
      expect(r.chips).toHaveLength(0);
    });
    it('29 февраля в високосный год — валидна', () => {
      const r = parseQuickAdd({ text: 'Собрание 29 февраля', now: now('2028-08-31', '10:00') });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2028-02-29');
    });
    it('31 апреля — невалидна (в апреле 30 дней)', () => {
      const r = parseQuickAdd({ text: 'Оплата 31 апреля', now: MONDAY });
      expect(r.chips).toHaveLength(0);
    });
    it('30 апреля — валидна', () => {
      const r = parseQuickAdd({ text: 'Оплата 30 апреля', now: MONDAY });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-04-30');
    });
    it('31 июня — невалидна (в июне 30 дней)', () => {
      const r = parseQuickAdd({ text: 'Экзамен 31 июня', now: MONDAY });
      expect(r.chips).toHaveLength(0);
    });
    it('32 августа — невалидна ни в одном месяце', () => {
      const r = parseQuickAdd({ text: 'Собрание 32 августа', now: MONDAY });
      expect(r.chips).toHaveLength(0);
    });
  });

  describe('числовая дата dd.mm[.yyyy]', () => {
    it('без года', () => {
      const r = parseQuickAdd({ text: 'Дедлайн 05.09', now: MONDAY });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-05');
      expect(r.title.text).toBe('Дедлайн');
    });
    it('с годом', () => {
      const r = parseQuickAdd({ text: 'Дедлайн 05.09.2026', now: MONDAY });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-05');
    });
    it('однозначные день и месяц', () => {
      const r = parseQuickAdd({ text: 'Встреча 1.1', now: MONDAY });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-01-01');
    });
    it('29.02 в невисокосный год — невалидна', () => {
      const r = parseQuickAdd({ text: 'Событие 29.02.2026', now: MONDAY });
      expect(r.chips).toHaveLength(0);
    });
    it('29.02 в високосный год — валидна', () => {
      const r = parseQuickAdd({ text: 'Событие 29.02.2028', now: now('2028-01-01', '10:00') });
      expect(dateIso(chipOf(r, 'date').value.date)).toBe('2028-02-29');
    });
    it('30.02 — невалидна ни в каком году', () => {
      const r = parseQuickAdd({ text: 'Событие 30.02', now: MONDAY });
      expect(r.chips).toHaveLength(0);
    });
    it('день > 31 — невалидна', () => {
      const r = parseQuickAdd({ text: 'Тест 32.01.2026', now: MONDAY });
      expect(r.chips).toHaveLength(0);
    });
    it('месяц > 12 — невалидна', () => {
      const r = parseQuickAdd({ text: 'Тест 01.13.2026', now: MONDAY });
      expect(r.chips).toHaveLength(0);
    });
  });

  it('вторая, неоднозначная дата в том же тексте отклоняется', () => {
    const r = parseQuickAdd({ text: 'Позвонить сегодня и послезавтра', now: MONDAY });
    expect(r.chips).toHaveLength(1);
    expect(r.chips[0]?.span?.text).toBe('сегодня');
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]).toMatchObject({ category: 'date', reason: 'ambiguousReading' });
    expect(r.rejected[0]?.span.text).toBe('послезавтра');
  });
});
