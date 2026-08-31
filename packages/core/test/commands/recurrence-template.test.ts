import { describe, expect, it } from 'vitest';

import {
  buildRecurrenceAnchor,
  parseRecurrenceRuleTemplate,
  toRecurrenceTemplateJson,
} from '../../src/commands/recurrence-template.js';
import type { RecurrenceRuleTemplate } from '../../src/temporal/recurrence-anchor.js';

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
