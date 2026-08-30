import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import type { RecurrenceSeries } from '../../src/entities/recurrence-series.js';
import { asUuid, makeOccurrenceSeq } from '../../src/values.js';

const now = Temporal.Instant.from('2026-08-30T10:00:00Z');

describe('RecurrenceSeries (§1 «recurrence_series», `02§2`) — поля объявлены, движок повторов — E11', () => {
  it('scheduled-якорь несёт rrule и не несёт completion_interval', () => {
    const series: RecurrenceSeries = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000060'),
      anchorType: 'scheduled',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      completionIntervalJson: null,
      templateJson: {},
      active: true,
      nextOccurrenceSeq: makeOccurrenceSeq(1n),
      stopAfterOccurrenceSeq: null,
      templateRevision: 1n,
      createdAt: now,
      updatedAt: now,
      clocks: {},
    };
    expect(series.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
  });

  it('completion-якорь несёт completion_interval и не несёт rrule (`01§11.4`)', () => {
    const series: RecurrenceSeries = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000061'),
      anchorType: 'completion',
      rrule: null,
      completionIntervalJson: { unit: 'month', amount: 1 },
      templateJson: {},
      active: true,
      nextOccurrenceSeq: makeOccurrenceSeq(1n),
      stopAfterOccurrenceSeq: null,
      templateRevision: 1n,
      createdAt: now,
      updatedAt: now,
      clocks: {},
    };
    expect(series.completionIntervalJson).toEqual({ unit: 'month', amount: 1 });
  });

  it('rrule на completion-серии — ошибка типа: anchor определяет, какое из полей заполнено', () => {
    // @ts-expect-error: completion-якорь не может нести rrule
    const series: RecurrenceSeries = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000062'),
      anchorType: 'completion',
      rrule: 'FREQ=DAILY',
      completionIntervalJson: { unit: 'day', amount: 1 },
      templateJson: {},
      active: true,
      nextOccurrenceSeq: makeOccurrenceSeq(1n),
      stopAfterOccurrenceSeq: null,
      templateRevision: 1n,
      createdAt: now,
      updatedAt: now,
      clocks: {},
    };
    void series;
  });
});

describe('makeOccurrenceSeq (решение `?3`: старт с 1, ноль зарезервирован)', () => {
  it('принимает значения >= 1', () => {
    expect(makeOccurrenceSeq(1n)).toBe(1n);
  });

  it('отклоняет 0 — ноль не может стать occurrence_seq (`02§13`, UUIDv5-вывод)', () => {
    expect(() => makeOccurrenceSeq(0n)).toThrow();
  });

  it('отклоняет отрицательные значения', () => {
    expect(() => makeOccurrenceSeq(-1n)).toThrow();
  });
});
