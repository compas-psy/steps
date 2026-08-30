import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { effectiveDeadlineDateTime, isDeadlinePassed } from '../../src/temporal/deadline.js';

describe('effectiveDeadlineDateTime (§2 «Дата-only deadline истекает в конце локального дня»)', () => {
  it('date-only дедлайн эквивалентен 23:59:59.999 локального дня', () => {
    const effective = effectiveDeadlineDateTime(Temporal.PlainDate.from('2026-09-01'), null);
    expect(effective.toString()).toBe('2026-09-01T23:59:59.999');
  });

  it('дедлайн со временем использует это время буквально', () => {
    const effective = effectiveDeadlineDateTime(
      Temporal.PlainDate.from('2026-09-01'),
      Temporal.PlainTime.from('18:30'),
    );
    expect(effective.toString()).toBe('2026-09-01T18:30:00');
  });
});

describe('isDeadlinePassed', () => {
  it('нет дедлайна — не может быть просрочен', () => {
    expect(isDeadlinePassed(null, null, Temporal.PlainDateTime.from('2026-09-01T00:00:00'))).toBe(
      false,
    );
  });

  it('дедлайн со временем: до наступления — не просрочен', () => {
    const passed = isDeadlinePassed(
      Temporal.PlainDate.from('2026-09-01'),
      Temporal.PlainTime.from('18:00'),
      Temporal.PlainDateTime.from('2026-09-01T17:59:59'),
    );
    expect(passed).toBe(false);
  });

  it('дедлайн со временем: сразу после наступления — просрочен', () => {
    const passed = isDeadlinePassed(
      Temporal.PlainDate.from('2026-09-01'),
      Temporal.PlainTime.from('18:00'),
      Temporal.PlainDateTime.from('2026-09-01T18:00:01'),
    );
    expect(passed).toBe(true);
  });

  it('дедлайн-only-дата: за миллисекунду до конца дня — ещё не просрочен (мандаторный тест §06.2)', () => {
    const passed = isDeadlinePassed(
      Temporal.PlainDate.from('2026-09-01'),
      null,
      Temporal.PlainDateTime.from('2026-09-01T23:59:59.998'),
    );
    expect(passed).toBe(false);
  });

  it('дедлайн-only-дата: со следующей полуночи — просрочен (мандаторный тест §06.2)', () => {
    const passed = isDeadlinePassed(
      Temporal.PlainDate.from('2026-09-01'),
      null,
      Temporal.PlainDateTime.from('2026-09-02T00:00:00'),
    );
    expect(passed).toBe(true);
  });
});
