import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  classifyTaskForToday,
  type TaskForTodayClassification,
} from '../../src/rules/today-classification.js';

const d = (iso: string) => Temporal.PlainDate.from(iso);
const t = (iso: string) => Temporal.PlainTime.from(iso);
const now = Temporal.PlainDateTime.from('2026-09-01T10:00:00');
const today = now.toPlainDate();

/** Активная задача совсем без temporal-полей — база для точечных вариаций. */
function bareActiveTask(): TaskForTodayClassification {
  return {
    status: 'active',
    completedAt: null,
    completionKind: null,
    deadlineDate: null,
    deadlineTime: null,
    availableFrom: null,
    plannedDate: null,
    plannedTime: null,
    durationMin: null,
    focusDate: null,
    dayBucket: 'default',
  };
}

describe('classifyTaskForToday — прецеденс §6/`01§6` (единая функция ранжирования, не разрозненные условия)', () => {
  it('1. Просрочен срок — дедлайн в прошлом, активна, независимо от planned_date', () => {
    const task: TaskForTodayClassification = {
      ...bareActiveTask(),
      deadlineDate: d('2026-08-30'),
      deadlineTime: t('18:00'),
    };
    expect(classifyTaskForToday(task, now)).toBe('missed_deadline');
  });

  it('2. Не по плану — planned_date в прошлом, дедлайн ещё не просрочен', () => {
    const task: TaskForTodayClassification = { ...bareActiveTask(), plannedDate: d('2026-08-20') };
    expect(classifyTaskForToday(task, now)).toBe('missed_plan');
  });

  it('3. Главное — focus_date == сегодня', () => {
    const task: TaskForTodayClassification = {
      ...bareActiveTask(),
      plannedDate: today,
      focusDate: today,
    };
    expect(classifyTaskForToday(task, now)).toBe('focus');
  });

  it('4. По времени — сегодня + planned_time, default bucket', () => {
    const task: TaskForTodayClassification = {
      ...bareActiveTask(),
      plannedDate: today,
      plannedTime: t('14:00'),
    };
    expect(classifyTaskForToday(task, now)).toBe('timed');
  });

  it('5. Сегодня — planned_date сегодня, без времени, default bucket', () => {
    const task: TaskForTodayClassification = { ...bareActiveTask(), plannedDate: today };
    expect(classifyTaskForToday(task, now)).toBe('today');
  });

  it('6. Когда будет время — day_bucket=later на сегодняшней дате', () => {
    const task: TaskForTodayClassification = {
      ...bareActiveTask(),
      plannedDate: today,
      dayBucket: 'later',
    };
    expect(classifyTaskForToday(task, now)).toBe('later');
  });

  it('задача без единого temporal-поля и без Focus не входит ни в одну группу Today', () => {
    expect(classifyTaskForToday(bareActiveTask(), now)).toBeNull();
  });

  it('завершённая задача никогда не попадает в активные группы Today (`01§6`)', () => {
    const task: TaskForTodayClassification = {
      ...bareActiveTask(),
      status: 'completed',
      completedAt: Temporal.Instant.from('2026-09-01T09:00:00Z'),
      completionKind: 'done',
      deadlineDate: d('2026-08-01'),
      deadlineTime: null,
      plannedDate: today,
      focusDate: today,
    };
    expect(classifyTaskForToday(task, now)).toBeNull();
  });

  it('planned_date в будущем и без дедлайна — не входит в Today (Plan показывает её отдельно)', () => {
    const task: TaskForTodayClassification = { ...bareActiveTask(), plannedDate: d('2026-09-15') };
    expect(classifyTaskForToday(task, now)).toBeNull();
  });

  it('регрессия ревью #2: задача одновременно "просрочен срок" и "не по плану" — попадает ровно в одну группу (высшую)', () => {
    const task: TaskForTodayClassification = {
      ...bareActiveTask(),
      deadlineDate: d('2026-08-25'), // дедлайн уже просрочен
      deadlineTime: null,
      plannedDate: d('2026-08-20'), // и план тоже в прошлом
    };
    expect(classifyTaskForToday(task, now)).toBe('missed_deadline');
  });

  it('регрессия: задача одновременно кандидат на "Главное" и "По времени" — попадает только в "Главное" (старше по приоритету)', () => {
    const task: TaskForTodayClassification = {
      ...bareActiveTask(),
      plannedDate: today,
      plannedTime: t('09:00'),
      focusDate: today,
    };
    expect(classifyTaskForToday(task, now)).toBe('focus');
  });

  it('day_bucket=later на дате, отличной от сегодня, не показывается в Today вовсе (не "оживляет" будущую задачу)', () => {
    const task: TaskForTodayClassification = {
      ...bareActiveTask(),
      plannedDate: d('2026-09-20'),
      dayBucket: 'later',
    };
    expect(classifyTaskForToday(task, now)).toBeNull();
  });

  it('мандаторный тест §06.2 "midnight Today rollover": та же задача до и после полуночи классифицируется по-разному', () => {
    const task: TaskForTodayClassification = { ...bareActiveTask(), plannedDate: d('2026-09-01') };

    const beforeMidnight = Temporal.PlainDateTime.from('2026-09-01T23:59:59');
    const afterMidnight = Temporal.PlainDateTime.from('2026-09-02T00:00:01');

    expect(classifyTaskForToday(task, beforeMidnight)).toBe('today');
    expect(classifyTaskForToday(task, afterMidnight)).toBe('missed_plan');
  });

  it('мандаторный тест §06.2 "focus_date не переносится на следующий день": вчерашний focus_date не даёт "Главное" сегодня, без какой-либо полуночной job — просто перестаёт совпадать с today (решение `?4`)', () => {
    const yesterday = today.subtract({ days: 1 });
    const task: TaskForTodayClassification = {
      ...bareActiveTask(),
      plannedDate: yesterday,
      focusDate: yesterday,
    };
    // поле focusDate физически не тронуто (никто его не чистил) — классификация
    // просто больше не совпадает с "today", задача попадает в "не по плану".
    expect(classifyTaskForToday(task, now)).toBe('missed_plan');
    expect(task.focusDate?.toString()).toBe(yesterday.toString());
  });
});
