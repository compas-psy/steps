import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  computeNextCompletionDate,
  computeNextScheduledDate,
  type RecurrenceRuleTemplate,
} from '../../src/temporal/recurrence-anchor.js';

const d = (iso: string): Temporal.PlainDate => Temporal.PlainDate.from(iso);

describe('computeNextScheduledDate (§11.3)', () => {
  it('еженедельно по конкретному дню: завершено в среду → следующий понедельник', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'week', interval: 1, byWeekday: [1] };
    // 2026-08-31 — понедельник; среда той же недели — 2026-09-02.
    const wednesday = d('2026-09-02');
    expect(computeNextScheduledDate(rule, wednesday)).toEqual(d('2026-09-07'));
  });

  it('просрочка на три недели даёт ближайший будущий слот, а не пачку прошлых', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'week', interval: 1, byWeekday: [1] };
    // Задача должна была выполняться каждый понедельник, но завершена спустя
    // три недели просрочки — 2026-09-23 (среда).
    const lateWednesday = d('2026-09-23');
    expect(computeNextScheduledDate(rule, lateWednesday)).toEqual(d('2026-09-28'));
  });

  it('по будням: завершено в пятницу → следующий понедельник (не суббота/воскресенье)', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'week', interval: 1, byWeekday: [1, 2, 3, 4, 5] };
    const friday = d('2026-09-04');
    expect(computeNextScheduledDate(rule, friday)).toEqual(d('2026-09-07'));
  });

  it('день матчит сегодняшний byWeekday — всё равно берёт строго следующий, не тот же день', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'week', interval: 1, byWeekday: [1] };
    const monday = d('2026-08-31');
    expect(computeNextScheduledDate(rule, monday)).toEqual(d('2026-09-07'));
  });

  it('ежемесячно, число 31: месяц без 31 числа пропускается целиком', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'month', interval: 1, byMonthDay: 31 };
    // После 15 февраля — февраль не подходит (28 дней), ближайший слот — 31 марта.
    expect(computeNextScheduledDate(rule, d('2026-02-15'))).toEqual(d('2026-03-31'));
  });

  it('ежемесячно, число уже задано в этом месяце, но дата уже прошла — берёт следующий месяц', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'month', interval: 1, byMonthDay: 5 };
    expect(computeNextScheduledDate(rule, d('2026-08-10'))).toEqual(d('2026-09-05'));
  });

  it('ежегодно 29 февраля — только в високосные годы', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'year', interval: 1, byMonth: 2, byMonthDay: 29 };
    // 2026 не високосный, 2027 не високосный, 2028 — високосный.
    expect(computeNextScheduledDate(rule, d('2026-03-01'))).toEqual(d('2028-02-29'));
  });

  it('каждые N дней без якорной даты — просто N дней после completion/skip', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'day', interval: 3 };
    expect(computeNextScheduledDate(rule, d('2026-08-31'))).toEqual(d('2026-09-03'));
  });

  it('каждые N недель без конкретного дня — N*7 дней после completion/skip', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'week', interval: 2 };
    expect(computeNextScheduledDate(rule, d('2026-08-31'))).toEqual(d('2026-09-14'));
  });

  it('каждые N месяцев без конкретного числа — Temporal overflow constrain', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'month', interval: 1 };
    // 31 января + 1 месяц без явного byMonthDay — Temporal .add({months:1})
    // по умолчанию уже constrain: 28/29 февраля.
    expect(computeNextScheduledDate(rule, d('2026-01-31'))).toEqual(d('2026-02-28'));
  });
});

describe('computeNextCompletionDate (§11.4)', () => {
  it('один месяц после 31 января → 28/29 февраля (overflow constrain)', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'month', interval: 1 };
    expect(computeNextCompletionDate(rule, d('2026-01-31'))).toEqual(d('2026-02-28'));
  });

  it('N дней после completion — прямое сложение', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'day', interval: 5 };
    expect(computeNextCompletionDate(rule, d('2026-08-31'))).toEqual(d('2026-09-05'));
  });

  it('N недель после completion — прямое сложение', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'week', interval: 2 };
    expect(computeNextCompletionDate(rule, d('2026-08-31'))).toEqual(d('2026-09-14'));
  });

  it('игнорирует byWeekday/byMonthDay — completion anchor не привязан к слотам', () => {
    const rule: RecurrenceRuleTemplate = {
      unit: 'week',
      interval: 1,
      byWeekday: [3],
    };
    // Завершено в понедельник; completion anchor просто добавляет 1 неделю,
    // не ищет ближайшую среду.
    expect(computeNextCompletionDate(rule, d('2026-08-31'))).toEqual(d('2026-09-07'));
  });

  it('год после completion → overflow constrain (29 февраля високосного года)', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'year', interval: 1 };
    expect(computeNextCompletionDate(rule, d('2028-02-29'))).toEqual(d('2029-02-28'));
  });
});
