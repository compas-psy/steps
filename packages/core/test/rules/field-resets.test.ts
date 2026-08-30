import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  clearDeadline,
  clearPlannedDate,
  setDayBucketLater,
  setPlannedDate,
  setPlannedTime,
} from '../../src/rules/field-resets.js';
import type { TaskDeadline, TaskPlanning } from '../../src/entities/task.js';
import { makeDurationMinutes } from '../../src/values.js';

const d = (iso: string) => Temporal.PlainDate.from(iso);
const t = (iso: string) => Temporal.PlainTime.from(iso);

describe('clearPlannedDate (§3: "удаление Planned Date убирает Planned Time, сбрасывает Focus и day_bucket, но оставляет Duration")', () => {
  it('обнуляет plannedDate/plannedTime/focusDate и day_bucket, сохраняя availableFrom и durationMin', () => {
    const planning: TaskPlanning = {
      availableFrom: d('2026-08-20'),
      plannedDate: d('2026-09-01'),
      plannedTime: t('09:00'),
      durationMin: makeDurationMinutes(30),
      focusDate: d('2026-09-01'),
      dayBucket: 'later',
    };

    const result = clearPlannedDate(planning);

    expect(result.plannedDate).toBeNull();
    expect(result.plannedTime).toBeNull();
    expect(result.focusDate).toBeNull();
    expect(result.dayBucket).toBe('default');
    expect(result.durationMin).toBe(30);
    expect(result.availableFrom?.toString()).toBe('2026-08-20');
  });
});

describe('setPlannedTime (§3: "Назначение Planned Time задаче «Когда будет время» возвращает day_bucket в default")', () => {
  it('назначение времени сбрасывает day_bucket=later в default', () => {
    const planning: Extract<TaskPlanning, { plannedDate: Temporal.PlainDate }> = {
      availableFrom: null,
      plannedDate: d('2026-09-01'),
      plannedTime: null,
      durationMin: null,
      focusDate: null,
      dayBucket: 'later',
    };

    const result = setPlannedTime(planning, t('14:00'));

    expect(result.dayBucket).toBe('default');
    expect(result.plannedTime?.toString()).toBe('14:00:00');
  });

  it('снятие времени (null) не трогает day_bucket', () => {
    const planning: Extract<TaskPlanning, { plannedDate: Temporal.PlainDate }> = {
      availableFrom: null,
      plannedDate: d('2026-09-01'),
      plannedTime: t('14:00'),
      durationMin: null,
      focusDate: null,
      dayBucket: 'later',
    };

    const result = setPlannedTime(planning, null);

    expect(result.dayBucket).toBe('later');
    expect(result.plannedTime).toBeNull();
  });
});

describe('setPlannedDate (§3: "Смена Planned Date — тоже [сбрасывает day_bucket в default]")', () => {
  it('смена даты сбрасывает day_bucket в default и сбрасывает focus (иначе focus_date != planned_date, §2 п.10)', () => {
    const planning: TaskPlanning = {
      availableFrom: null,
      plannedDate: d('2026-09-01'),
      plannedTime: t('09:00'),
      durationMin: makeDurationMinutes(45),
      focusDate: d('2026-09-01'),
      dayBucket: 'later',
    };

    const result = setPlannedDate(planning, d('2026-09-05'));

    expect(result.plannedDate.toString()).toBe('2026-09-05');
    expect(result.dayBucket).toBe('default');
    expect(result.focusDate).toBeNull();
    // Planned Time не упомянуто в правиле сброса — сохраняется при переносе даты.
    expect(result.plannedTime?.toString()).toBe('09:00:00');
    expect(result.durationMin).toBe(45);
  });

  it('назначение первой даты задаче без плана переводит её в вариант "с датой"', () => {
    const planning: TaskPlanning = {
      availableFrom: null,
      plannedDate: null,
      plannedTime: null,
      durationMin: makeDurationMinutes(10),
      focusDate: null,
      dayBucket: 'default',
    };

    const result = setPlannedDate(planning, d('2026-09-10'));

    expect(result.plannedDate.toString()).toBe('2026-09-10');
    expect(result.durationMin).toBe(10);
  });
});

describe('setDayBucketLater (действие «Когда будет время»: "ставит day_bucket=later, очищает Planned Time, сохраняет Duration и Planned Date")', () => {
  it('переводит в later и очищает время, сохраняя дату и длительность', () => {
    const planning: Extract<TaskPlanning, { plannedDate: Temporal.PlainDate }> = {
      availableFrom: null,
      plannedDate: d('2026-09-01'),
      plannedTime: t('09:00'),
      durationMin: makeDurationMinutes(20),
      focusDate: null,
      dayBucket: 'default',
    };

    const result = setDayBucketLater(planning);

    expect(result.dayBucket).toBe('later');
    expect(result.plannedTime).toBeNull();
    expect(result.plannedDate.toString()).toBe('2026-09-01');
    expect(result.durationMin).toBe(20);
  });
});

describe('clearDeadline (конспект §3: "удаление Deadline удаляет Deadline Time")', () => {
  it('обнуляет deadlineDate и deadlineTime вместе', () => {
    const deadline: TaskDeadline = { deadlineDate: d('2026-09-01'), deadlineTime: t('18:00') };
    const result = clearDeadline(deadline);
    expect(result.deadlineDate).toBeNull();
    expect(result.deadlineTime).toBeNull();
  });
});
