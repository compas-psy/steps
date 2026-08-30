import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { formatDate, formatInstant, formatTime, startOfWeek, weekdayName } from '../src/index.js';

describe('слой форматирования дат/времени: Temporal → Intl, ru-RU', () => {
  it('formatDate: длинное название месяца, без выдуманных строк в домене', () => {
    const date = Temporal.PlainDate.from('2026-09-04');
    expect(formatDate(date)).toBe('4 сентября');
  });

  it('formatDate: день недели можно запросить явно', () => {
    const date = Temporal.PlainDate.from('2026-09-04'); // пятница
    expect(formatDate(date, { weekday: 'long' })).toBe('пятница, 4 сентября');
  });

  it('formatTime: 24-часовой формат (SPEC §5) — не 12-часовой с AM/PM', () => {
    expect(formatTime(Temporal.PlainTime.from('14:05'))).toBe('14:05');
    expect(formatTime(Temporal.PlainTime.from('00:30'))).toBe('00:30');
    expect(formatTime(Temporal.PlainTime.from('23:59'))).not.toMatch(/AM|PM/i);
  });

  it('formatInstant: требует явный часовой пояс, 24-часовое время', () => {
    const instant = Temporal.Instant.from('2026-08-30T12:00:00Z');
    const text = formatInstant(instant, 'Europe/Moscow');
    expect(text).not.toMatch(/AM|PM/i);
    expect(text).toContain('30 августа');
    expect(text).toContain('15:00');
  });

  it('weekdayName: ISO-номер (понедельник=1…воскресенье=7), не хардкод списка строк', () => {
    expect(weekdayName(1)).toBe('понедельник');
    expect(weekdayName(7)).toBe('воскресенье');
    expect(weekdayName(5, 'short')).toBe('пт');
  });

  it('weekdayName: вне диапазона 1..7 — явная ошибка, не NaN/undefined', () => {
    expect(() => weekdayName(0)).toThrow(RangeError);
    expect(() => weekdayName(8)).toThrow(RangeError);
  });

  it('startOfWeek: неделя с понедельника (SPEC §5, §16.1) для любого дня недели', () => {
    // 2026-09-04 — пятница; понедельник той же недели — 2026-08-31.
    const friday = Temporal.PlainDate.from('2026-09-04');
    expect(startOfWeek(friday).toString()).toBe('2026-08-31');

    // Воскресенье принадлежит предыдущей ISO-неделе, начавшейся в понедельник.
    const sunday = Temporal.PlainDate.from('2026-09-06');
    expect(startOfWeek(sunday).toString()).toBe('2026-08-31');

    // Сам понедельник — начало собственной недели.
    const monday = Temporal.PlainDate.from('2026-08-31');
    expect(startOfWeek(monday).toString()).toBe('2026-08-31');
  });
});
