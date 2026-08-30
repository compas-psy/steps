import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { validateExplicitReminder } from '../../src/validation/reminder.js';

const d = (iso: string) => Temporal.PlainDate.from(iso);
const t = (iso: string) => Temporal.PlainTime.from(iso);

describe('validateExplicitReminder — правило 34: напоминание после дедлайна (предупреждение, сохранение разрешено)', () => {
  it('напоминание назначено после дедлайна — предупреждение, но valid=true', () => {
    const result = validateExplicitReminder(
      { date: d('2026-09-05'), time: t('09:00') },
      { deadlineDate: d('2026-09-01'), deadlineTime: t('18:00') },
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([
      { rule: 34, code: 'TEMPORAL_CONFLICT', severity: 'warning', field: 'date' },
    ]);
  });

  it('напоминание до дедлайна — без предупреждения', () => {
    const result = validateExplicitReminder(
      { date: d('2026-08-30'), time: t('09:00') },
      { deadlineDate: d('2026-09-01'), deadlineTime: t('18:00') },
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('у задачи нет дедлайна — сравнивать нечего, без предупреждения', () => {
    const result = validateExplicitReminder(
      { date: d('2026-09-05'), time: t('09:00') },
      { deadlineDate: null, deadlineTime: null },
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
