import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import type { Task } from '../../src/entities/task.js';
import { asUuid, makeDurationMinutes, makePriority } from '../../src/values.js';

const id = asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001');
const otherId = asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000002');
const now = Temporal.Instant.from('2026-08-30T10:00:00Z');

/** Минимальная валидная задача без единого temporal-поля (§2, «явно валидная
 * комбинация №38») — база, от которой варьируются остальные примеры. */
function baseTask(): Task {
  return {
    id,
    ownerScope: id,
    title: 'Купить молоко',
    description: '',
    priority: makePriority(4),
    rank: '0|hzzzzz:' as Task['rank'],
    parentTaskId: null,
    captureState: 'inbox',
    seriesId: null,
    occurrenceSeq: null,
    generatedFromOccurrenceId: null,
    projectId: null,
    sectionId: null,
    availableFrom: null,
    plannedDate: null,
    plannedTime: null,
    durationMin: null,
    focusDate: null,
    dayBucket: 'default',
    deadlineDate: null,
    deadlineTime: null,
    status: 'active',
    completedAt: null,
    completionKind: null,
    source: 'user',
    sourceChannel: null,
    sourceCaptureBatchId: null,
    sourceIntentId: null,
    originalProjectNameSnapshot: null,
    originalSectionNameSnapshot: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 1n,
    clocks: {},
  };
}

describe('Task — валидные комбинации', () => {
  it('задача совсем без temporal-полей компилируется (§2 п.38)', () => {
    expect(baseTask().plannedDate).toBeNull();
  });

  it('Deadline без Planned Date валиден (§2 п.36)', () => {
    const task: Task = {
      ...baseTask(),
      deadlineDate: Temporal.PlainDate.from('2026-09-01'),
      deadlineTime: null,
    };
    expect(task.deadlineDate?.toString()).toBe('2026-09-01');
  });

  it('Duration без Time валиден (§2 п.35) — planned есть, время нет', () => {
    const task: Task = {
      ...baseTask(),
      plannedDate: Temporal.PlainDate.from('2026-09-01'),
      durationMin: makeDurationMinutes(30),
    };
    expect(task.durationMin).toBe(30);
  });

  it('Available From без Planned Date валиден (§2 п.37)', () => {
    const task: Task = {
      ...baseTask(),
      availableFrom: Temporal.PlainDate.from('2026-09-01'),
    };
    expect(task.availableFrom?.toString()).toBe('2026-09-01');
  });

  it('focus_date разрешён только вместе с непустым plannedDate', () => {
    const plannedDate = Temporal.PlainDate.from('2026-09-01');
    const task: Task = {
      ...baseTask(),
      plannedDate,
      focusDate: plannedDate,
    };
    expect(task.focusDate?.equals(plannedDate)).toBe(true);
  });

  it('day_bucket=later разрешён только вместе с непустым plannedDate', () => {
    const task: Task = {
      ...baseTask(),
      plannedDate: Temporal.PlainDate.from('2026-09-01'),
      dayBucket: 'later',
    };
    expect(task.dayBucket).toBe('later');
  });

  it('завершённая задача несёт согласованные status/completedAt/completionKind', () => {
    const task: Task = {
      ...baseTask(),
      status: 'completed',
      completedAt: now,
      completionKind: 'done',
    };
    expect(task.status).toBe('completed');
  });

  it('дочерняя задача обязана быть processed', () => {
    const task: Task = {
      ...baseTask(),
      parentTaskId: otherId,
      captureState: 'processed',
      seriesId: null,
      occurrenceSeq: null,
      generatedFromOccurrenceId: null,
    };
    expect(task.captureState).toBe('processed');
  });
});

describe('Task — невозможные состояния не типизируются (§2, `00 §7.1`)', () => {
  it('plannedTime без plannedDate — ошибка типа (п.1)', () => {
    // @ts-expect-error: plannedTime требует непустой plannedDate
    const task: Task = {
      ...baseTask(),
      plannedDate: null,
      plannedTime: Temporal.PlainTime.from('09:00'),
    };
    void task;
  });

  it('deadlineTime без deadlineDate — ошибка типа (п.2)', () => {
    // @ts-expect-error: deadlineTime требует непустой deadlineDate
    const task: Task = {
      ...baseTask(),
      deadlineDate: null,
      deadlineTime: Temporal.PlainTime.from('18:00'),
    };
    void task;
  });

  it('day_bucket=later без plannedDate — ошибка типа (п.11)', () => {
    // @ts-expect-error: day_bucket=later требует непустой plannedDate
    const task: Task = {
      ...baseTask(),
      plannedDate: null,
      dayBucket: 'later',
    };
    void task;
  });

  it('focusDate без plannedDate — ошибка типа (часть п.10)', () => {
    // @ts-expect-error: focusDate непустым допустим только вместе с plannedDate
    const task: Task = {
      ...baseTask(),
      plannedDate: null,
      focusDate: Temporal.PlainDate.from('2026-09-01'),
    };
    void task;
  });

  it('status=completed с completedAt=null — ошибка типа (п.12)', () => {
    // @ts-expect-error: completed обязан нести completedAt
    const task: Task = {
      ...baseTask(),
      status: 'completed',
      completedAt: null,
      completionKind: 'done',
    };
    void task;
  });

  it('status=active с непустым completionKind — ошибка типа (п.13)', () => {
    const task: Task = {
      ...baseTask(),
      status: 'active',
      completedAt: null,
      // @ts-expect-error: active обязан нести completionKind=null
      completionKind: 'done',
    };
    void task;
  });

  it('дочерняя задача с capture_state=inbox — ошибка типа (п.9)', () => {
    // @ts-expect-error: любая задача с parentTaskId обязана быть processed
    const task: Task = {
      ...baseTask(),
      parentTaskId: otherId,
      captureState: 'inbox',
    };
    void task;
  });

  it('recurring-серия у дочерней задачи — ошибка типа (п.8: recurring только top-level)', () => {
    // @ts-expect-error: seriesId допустим только при parentTaskId=null
    const task: Task = {
      ...baseTask(),
      parentTaskId: otherId,
      captureState: 'processed',
      seriesId: otherId,
    };
    void task;
  });

  it('sectionId без projectId — ошибка типа (п.5)', () => {
    // @ts-expect-error: sectionId требует непустой projectId
    const task: Task = {
      ...baseTask(),
      projectId: null,
      sectionId: otherId,
    };
    void task;
  });
});
