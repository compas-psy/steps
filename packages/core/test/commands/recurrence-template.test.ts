import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  buildRecurrenceAnchor,
  deriveRecurrenceOccurrenceTemplate,
  parseRecurrenceOccurrenceTemplate,
  parseRecurrenceRuleTemplate,
  toRecurrenceOccurrenceTemplateJson,
  toRecurrenceTemplateJson,
  type OccurrencePlanningSnapshot,
  type RecurrenceOccurrenceTemplate,
} from '../../src/commands/recurrence-template.js';
import type { RecurrenceRuleTemplate } from '../../src/temporal/recurrence-anchor.js';
import { makeDurationMinutes } from '../../src/values.js';

describe('toRecurrenceTemplateJson / parseRecurrenceRuleTemplate — round-trip', () => {
  it('день без byWeekday/byMonthDay/byMonth переживает round-trip', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'day', interval: 1 };
    expect(parseRecurrenceRuleTemplate(toRecurrenceTemplateJson(rule))).toEqual(rule);
  });

  it('неделя с byWeekday переживает round-trip', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'week', interval: 1, byWeekday: [1, 2, 3, 4, 5] };
    expect(parseRecurrenceRuleTemplate(toRecurrenceTemplateJson(rule))).toEqual(rule);
  });

  it('месяц с byMonthDay переживает round-trip', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'month', interval: 1, byMonthDay: 31 };
    expect(parseRecurrenceRuleTemplate(toRecurrenceTemplateJson(rule))).toEqual(rule);
  });

  it('год с byMonth+byMonthDay переживает round-trip', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'year', interval: 1, byMonth: 2, byMonthDay: 29 };
    expect(parseRecurrenceRuleTemplate(toRecurrenceTemplateJson(rule))).toEqual(rule);
  });

  it('отклоняет некорректный unit', () => {
    expect(() => parseRecurrenceRuleTemplate({ unit: 'fortnight', interval: 1 })).toThrow();
  });

  it('отклоняет нецелый/нулевой interval', () => {
    expect(() => parseRecurrenceRuleTemplate({ unit: 'day', interval: 0 })).toThrow();
    expect(() => parseRecurrenceRuleTemplate({ unit: 'day', interval: 1.5 })).toThrow();
  });
});

describe('buildRecurrenceAnchor', () => {
  it('scheduled: rrule — строка, completionIntervalJson — null', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'day', interval: 1 };
    const anchor = buildRecurrenceAnchor('scheduled', rule);
    expect(anchor.anchorType).toBe('scheduled');
    expect(typeof anchor.rrule).toBe('string');
    expect(anchor.completionIntervalJson).toBeNull();
  });

  it('completion: completionIntervalJson несёт то же правило, rrule — null', () => {
    const rule: RecurrenceRuleTemplate = { unit: 'month', interval: 1 };
    const anchor = buildRecurrenceAnchor('completion', rule);
    expect(anchor.anchorType).toBe('completion');
    expect(anchor.rrule).toBeNull();
    expect(anchor.completionIntervalJson).toEqual({ unit: 'month', interval: 1 });
  });
});

describe('toRecurrenceOccurrenceTemplateJson / parseRecurrenceOccurrenceTemplate — round-trip (M26)', () => {
  it('полностью заполненный шаблон переживает round-trip', () => {
    const tpl: RecurrenceOccurrenceTemplate = {
      plannedTime: Temporal.PlainTime.from('09:00'),
      durationMin: makeDurationMinutes(30),
      deadlineOffsetDays: 2,
      deadlineTime: Temporal.PlainTime.from('18:00'),
      availableFromOffsetDays: -1,
    };
    const parsed = parseRecurrenceOccurrenceTemplate(toRecurrenceOccurrenceTemplateJson(tpl));
    expect(parsed.plannedTime?.toString()).toBe('09:00:00');
    expect(parsed.durationMin).toBe(30);
    expect(parsed.deadlineOffsetDays).toBe(2);
    expect(parsed.deadlineTime?.toString()).toBe('18:00:00');
    expect(parsed.availableFromOffsetDays).toBe(-1);
  });

  it('полностью пустой шаблон (все поля null) переживает round-trip', () => {
    const tpl: RecurrenceOccurrenceTemplate = {
      plannedTime: null,
      durationMin: null,
      deadlineOffsetDays: null,
      deadlineTime: null,
      availableFromOffsetDays: null,
    };
    expect(parseRecurrenceOccurrenceTemplate(toRecurrenceOccurrenceTemplateJson(tpl))).toEqual(tpl);
  });

  it('поле отсутствует в JSON (легаси-серия до M26) → читается как null, не бросает', () => {
    // Тот же templateJson, что старые фикстуры/серии несли ДО M26 — только
    // rrule-ключи, ни одного occurrence-ключа.
    const legacyJson = { unit: 'day', interval: 1 };
    expect(parseRecurrenceOccurrenceTemplate(legacyJson)).toEqual({
      plannedTime: null,
      durationMin: null,
      deadlineOffsetDays: null,
      deadlineTime: null,
      availableFromOffsetDays: null,
    });
  });

  it('слияние с rrule-ключами не теряет ни одну сторону (тот же templateJson-объект)', () => {
    const ruleJson = toRecurrenceTemplateJson({ unit: 'week', interval: 2, byWeekday: [1, 3] });
    const occurrenceJson = toRecurrenceOccurrenceTemplateJson({
      plannedTime: Temporal.PlainTime.from('07:30'),
      durationMin: makeDurationMinutes(45),
      deadlineOffsetDays: null,
      deadlineTime: null,
      availableFromOffsetDays: 0,
    });
    const merged = { ...ruleJson, ...occurrenceJson };

    // Обе стороны читаются из ОДНОГО И ТОГО ЖЕ merged-объекта без потерь.
    expect(parseRecurrenceRuleTemplate(merged)).toEqual({
      unit: 'week',
      interval: 2,
      byWeekday: [1, 3],
    });
    const parsedOccurrence = parseRecurrenceOccurrenceTemplate(merged);
    expect(parsedOccurrence.plannedTime?.toString()).toBe('07:30:00');
    expect(parsedOccurrence.durationMin).toBe(45);
    expect(parsedOccurrence.availableFromOffsetDays).toBe(0);
  });

  it('дедлайн-время игнорируется при чтении, если офсета дедлайна нет (защитный рубеж)', () => {
    const json = {
      deadlineOffsetDays: null,
      deadlineTime: '18:00:00',
    };
    expect(parseRecurrenceOccurrenceTemplate(json).deadlineTime).toBeNull();
  });
});

describe('deriveRecurrenceOccurrenceTemplate (M26)', () => {
  it('без plannedDate — офсеты null (не устаревшее абсолютное значение)', () => {
    const snapshot: OccurrencePlanningSnapshot = {
      plannedDate: null,
      plannedTime: Temporal.PlainTime.from('09:00'),
      durationMin: makeDurationMinutes(30),
      deadlineDate: Temporal.PlainDate.from('2026-09-05'),
      deadlineTime: Temporal.PlainTime.from('18:00'),
      availableFrom: Temporal.PlainDate.from('2026-09-02'),
    };
    const tpl = deriveRecurrenceOccurrenceTemplate(snapshot);
    expect(tpl.deadlineOffsetDays).toBeNull();
    expect(tpl.deadlineTime).toBeNull();
    expect(tpl.availableFromOffsetDays).toBeNull();
    // plannedTime/durationMin не зависят от plannedDate — переносятся как есть.
    expect(tpl.plannedTime?.toString()).toBe('09:00:00');
    expect(tpl.durationMin).toBe(30);
  });

  it('с plannedDate — офсеты считаются в целых сутках от plannedDate', () => {
    const snapshot: OccurrencePlanningSnapshot = {
      plannedDate: Temporal.PlainDate.from('2026-09-01'),
      plannedTime: null,
      durationMin: null,
      deadlineDate: Temporal.PlainDate.from('2026-09-03'),
      deadlineTime: null,
      availableFrom: Temporal.PlainDate.from('2026-08-30'),
    };
    const tpl = deriveRecurrenceOccurrenceTemplate(snapshot);
    expect(tpl.deadlineOffsetDays).toBe(2);
    expect(tpl.availableFromOffsetDays).toBe(-2);
  });

  it('deadlineDate отсутствует — deadlineOffsetDays null, deadlineTime тоже null даже если задано', () => {
    const snapshot: OccurrencePlanningSnapshot = {
      plannedDate: Temporal.PlainDate.from('2026-09-01'),
      plannedTime: null,
      durationMin: null,
      deadlineDate: null,
      deadlineTime: Temporal.PlainTime.from('18:00'),
      availableFrom: null,
    };
    const tpl = deriveRecurrenceOccurrenceTemplate(snapshot);
    expect(tpl.deadlineOffsetDays).toBeNull();
    expect(tpl.deadlineTime).toBeNull();
  });
});
