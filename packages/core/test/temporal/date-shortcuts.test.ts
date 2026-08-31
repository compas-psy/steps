import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { resolveNextWeekMonday, resolveWeekend } from '../../src/temporal/date-shortcuts.js';

const d = (iso: string) => Temporal.PlainDate.from(iso);

describe('resolveWeekend (`01§4`/`01§5` "Date shortcut semantics": today if Sat/Sun, otherwise nearest Saturday)', () => {
  it('сегодня понедельник — ближайшая суббота той же недели', () => {
    // 2026-08-31 — понедельник.
    expect(resolveWeekend(d('2026-08-31')).toString()).toBe('2026-09-05');
  });

  it('сегодня уже суббота — результат "сегодня", не следующая суббота', () => {
    expect(resolveWeekend(d('2026-09-05')).toString()).toBe('2026-09-05');
  });

  it('сегодня воскресенье — результат "сегодня"', () => {
    expect(resolveWeekend(d('2026-09-06')).toString()).toBe('2026-09-06');
  });

  it('сегодня пятница — ближайшая суббота завтра', () => {
    expect(resolveWeekend(d('2026-09-04')).toString()).toBe('2026-09-05');
  });
});

describe('resolveNextWeekMonday (`01§4`/`01§5`: next Monday, never current Monday)', () => {
  it('сегодня понедельник — результат через 7 дней, не сегодня', () => {
    expect(resolveNextWeekMonday(d('2026-08-31')).toString()).toBe('2026-09-07');
  });

  it('сегодня среда — понедельник следующей календарной недели', () => {
    expect(resolveNextWeekMonday(d('2026-09-02')).toString()).toBe('2026-09-07');
  });

  it('сегодня воскресенье — понедельник сразу завтра', () => {
    expect(resolveNextWeekMonday(d('2026-09-06')).toString()).toBe('2026-09-07');
  });
});
