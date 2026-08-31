import { describe, expect, it } from 'vitest';

import {
  addMonths,
  clampDayInMonth,
  daysInMonth,
  firstWeekdayOfMonth,
  isSameCalendarDate,
  leadingBlankCells,
} from '../../../src/components/planning/internal/calendarMath.js';

describe('calendarMath', () => {
  describe('daysInMonth', () => {
    it('февраль високосного 2024 года — 29 дней', () => {
      expect(daysInMonth(2024, 2)).toBe(29);
    });

    it('февраль невисокосного 2026 года — 28 дней', () => {
      expect(daysInMonth(2026, 2)).toBe(28);
    });

    it('январь — 31 день в обоих годах', () => {
      expect(daysInMonth(2024, 1)).toBe(31);
      expect(daysInMonth(2026, 1)).toBe(31);
    });

    it('апрель — 30 дней', () => {
      expect(daysInMonth(2026, 4)).toBe(30);
    });
  });

  describe('firstWeekdayOfMonth', () => {
    it('возвращает день недели 1 числа в диапазоне 0..6', () => {
      const day = firstWeekdayOfMonth(2026, 8);
      expect(day).toBeGreaterThanOrEqual(0);
      expect(day).toBeLessThanOrEqual(6);
    });
  });

  describe('leadingBlankCells', () => {
    it('0 пустых ячеек, если 1 число месяца совпадает со стартом недели', () => {
      const firstDay = firstWeekdayOfMonth(2026, 8);
      expect(leadingBlankCells(2026, 8, firstDay)).toBe(0);
    });

    it('6 пустых ячеек, если старт недели — день сразу после 1 числа', () => {
      const firstDay = firstWeekdayOfMonth(2026, 8);
      const weekStartsOn = (firstDay + 1) % 7;
      expect(leadingBlankCells(2026, 8, weekStartsOn)).toBe(6);
    });
  });

  describe('clampDayInMonth', () => {
    it('зажимает день, выходящий за последний день месяца', () => {
      expect(clampDayInMonth(31, 2026, 2)).toBe(28);
      expect(clampDayInMonth(31, 2024, 2)).toBe(29);
    });

    it('зажимает день меньше 1 до 1', () => {
      expect(clampDayInMonth(0, 2026, 3)).toBe(1);
    });

    it('не трогает день, уже входящий в границы месяца', () => {
      expect(clampDayInMonth(15, 2026, 3)).toBe(15);
    });
  });

  describe('addMonths', () => {
    it('складывает месяцы внутри года без переноса', () => {
      expect(addMonths({ year: 2026, month: 3 }, 2)).toEqual({ year: 2026, month: 5 });
    });

    it('переносит год вперёд через декабрь', () => {
      expect(addMonths({ year: 2026, month: 11 }, 2)).toEqual({ year: 2027, month: 1 });
    });

    it('переносит год назад через январь', () => {
      expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    });
  });

  describe('isSameCalendarDate', () => {
    it('true для одинаковых дат, false для разных', () => {
      expect(
        isSameCalendarDate({ year: 2026, month: 8, day: 31 }, { year: 2026, month: 8, day: 31 }),
      ).toBe(true);
      expect(
        isSameCalendarDate({ year: 2026, month: 8, day: 31 }, { year: 2026, month: 8, day: 1 }),
      ).toBe(false);
    });

    it('null считается равным только null', () => {
      expect(isSameCalendarDate(null, null)).toBe(true);
      expect(isSameCalendarDate(null, { year: 2026, month: 8, day: 31 })).toBe(false);
      expect(isSameCalendarDate({ year: 2026, month: 8, day: 31 }, null)).toBe(false);
    });
  });
});
