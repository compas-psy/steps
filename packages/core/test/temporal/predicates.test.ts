import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  doesDurationCrossDeadline,
  isAvailableFromConflict,
  isDeadlineBeforeAvailableFrom,
  isPlannedAfterDeadline,
  isReminderAfterDeadline,
} from '../../src/temporal/predicates.js';
import { makeDurationMinutes } from '../../src/values.js';

const d = (iso: string) => Temporal.PlainDate.from(iso);
const t = (iso: string) => Temporal.PlainTime.from(iso);

describe('isAvailableFromConflict (§2 п.3, блокирующий: planned_date < available_from)', () => {
  it('planned раньше available_from — конфликт', () => {
    expect(isAvailableFromConflict(d('2026-09-01'), d('2026-09-05'))).toBe(true);
  });

  it('planned в день available_from — не конфликт (граница включительно)', () => {
    expect(isAvailableFromConflict(d('2026-09-05'), d('2026-09-05'))).toBe(false);
  });

  it('planned позже available_from — не конфликт', () => {
    expect(isAvailableFromConflict(d('2026-09-10'), d('2026-09-05'))).toBe(false);
  });

  it('нет planned или нет available_from — конфликта нет (валидная комбинация §2 п.37)', () => {
    expect(isAvailableFromConflict(null, d('2026-09-05'))).toBe(false);
    expect(isAvailableFromConflict(d('2026-09-05'), null)).toBe(false);
  });
});

describe('isDeadlineBeforeAvailableFrom (§2 п.4, блокирующий: deadline < начало дня available_from)', () => {
  it('дедлайн раньше available_from — конфликт', () => {
    expect(isDeadlineBeforeAvailableFrom(d('2026-09-01'), t('12:00'), d('2026-09-05'))).toBe(true);
  });

  it('дедлайн в день available_from (даже раннее время) — не конфликт: сравнение по дате начала суток', () => {
    expect(isDeadlineBeforeAvailableFrom(d('2026-09-05'), t('00:01'), d('2026-09-05'))).toBe(false);
  });

  it('нет дедлайна или нет available_from — конфликта нет', () => {
    expect(isDeadlineBeforeAvailableFrom(null, null, d('2026-09-05'))).toBe(false);
    expect(isDeadlineBeforeAvailableFrom(d('2026-09-05'), null, null)).toBe(false);
  });
});

describe('isPlannedAfterDeadline (§2 п.32, предупреждение)', () => {
  it('planned позже дедлайна — предупреждение', () => {
    expect(isPlannedAfterDeadline(d('2026-09-10'), t('09:00'), d('2026-09-05'), t('18:00'))).toBe(
      true,
    );
  });

  it('planned раньше или равен дедлайну — без предупреждения', () => {
    expect(isPlannedAfterDeadline(d('2026-09-01'), t('09:00'), d('2026-09-05'), t('18:00'))).toBe(
      false,
    );
  });

  it('нет planned или нет дедлайна — сравнивать нечего', () => {
    expect(isPlannedAfterDeadline(null, null, d('2026-09-05'), null)).toBe(false);
    expect(isPlannedAfterDeadline(d('2026-09-05'), null, null, null)).toBe(false);
  });
});

describe('doesDurationCrossDeadline (§2 п.33, предупреждение; мандаторный тест §06.2)', () => {
  it('planned_time + duration заканчивается после дедлайна — предупреждение', () => {
    const warns = doesDurationCrossDeadline(
      d('2026-09-01'),
      t('17:30'),
      makeDurationMinutes(90),
      d('2026-09-01'),
      t('18:00'),
    );
    expect(warns).toBe(true);
  });

  it('укладывается точно в дедлайн — без предупреждения (граница включительно)', () => {
    const warns = doesDurationCrossDeadline(
      d('2026-09-01'),
      t('16:30'),
      makeDurationMinutes(90),
      d('2026-09-01'),
      t('18:00'),
    );
    expect(warns).toBe(false);
  });

  it('нет времени/длительности/дедлайна — сравнивать нечего', () => {
    expect(
      doesDurationCrossDeadline(d('2026-09-01'), null, null, d('2026-09-01'), t('18:00')),
    ).toBe(false);
  });
});

describe('isReminderAfterDeadline (§2 п.34, предупреждение)', () => {
  it('напоминание назначено после дедлайна — предупреждение', () => {
    const warns = isReminderAfterDeadline(d('2026-09-05'), t('09:00'), d('2026-09-01'), t('18:00'));
    expect(warns).toBe(true);
  });

  it('напоминание до дедлайна — без предупреждения', () => {
    const warns = isReminderAfterDeadline(d('2026-08-30'), t('09:00'), d('2026-09-01'), t('18:00'));
    expect(warns).toBe(false);
  });
});
