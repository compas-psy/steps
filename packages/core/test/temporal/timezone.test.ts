import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { toZonedDateTime } from '../../src/temporal/timezone.js';

describe('toZonedDateTime (`00§5`, `01§19`: "09:00 остаётся 09:00 локального времени")', () => {
  it('материализует плавающее локальное время в конкретной IANA-зоне', () => {
    const zoned = toZonedDateTime(
      Temporal.PlainDate.from('2026-09-01'),
      Temporal.PlainTime.from('09:00'),
      'Europe/Moscow',
    );
    expect(zoned.toPlainTime().toString()).toBe('09:00:00');
    expect(zoned.timeZoneId).toBe('Europe/Moscow');
  });

  it('date-only (без времени) материализуется в полночь локального дня', () => {
    const zoned = toZonedDateTime(Temporal.PlainDate.from('2026-09-01'), null, 'UTC');
    expect(zoned.toPlainTime().toString()).toBe('00:00:00');
  });

  it('одно и то же плавающее время в разных зонах — разный Instant, тот же wall-clock', () => {
    const date = Temporal.PlainDate.from('2026-09-01');
    const time = Temporal.PlainTime.from('09:00');

    const moscow = toZonedDateTime(date, time, 'Europe/Moscow');
    const yekaterinburg = toZonedDateTime(date, time, 'Asia/Yekaterinburg');

    expect(moscow.toPlainTime().toString()).toBe('09:00:00');
    expect(yekaterinburg.toPlainTime().toString()).toBe('09:00:00');
    expect(moscow.toInstant().equals(yekaterinburg.toInstant())).toBe(false);
  });
});
