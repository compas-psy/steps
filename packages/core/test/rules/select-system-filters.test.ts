import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { initialRank } from '../../src/order/index.js';
import { asUuid, makePriority, type Uuid } from '../../src/values.js';
import type { Task } from '../../src/entities/task.js';
import { selectSystemFilters, SYSTEM_FILTER_IDS } from '../../src/rules/select-system-filters.js';

const d = (iso: string) => Temporal.PlainDate.from(iso);
const now = Temporal.PlainDateTime.from('2026-08-31T10:00:00');
const today = now.toPlainDate();

let taskCounter = 0;
function uuid(): Uuid {
  taskCounter += 1;
  return asUuid(`00000000-0000-0000-0000-${String(taskCounter).padStart(12, '0')}`);
}

/** Минимальная валидная активная задача — тот же приём, что
 * `select-plan-agenda.test.ts`/`select-today-tasks.test.ts` (см. их
 * заголовки): только поля, нужные `selectSystemFilters`, варьируются через
 * `overrides` в каждом тесте. */
function task(overrides: Partial<Task> = {}): Task {
  const base: Task = {
    id: uuid(),
    ownerScope: asUuid('00000000-0000-0000-0000-0000000000f0'),
    title: 'Задача',
    description: '',
    priority: makePriority(4),
    rank: initialRank(),
    parentTaskId: null,
    captureState: 'processed',
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
    createdAt: Temporal.Instant.from('2026-08-31T09:00:00Z'),
    updatedAt: Temporal.Instant.from('2026-08-31T09:00:00Z'),
    deletedAt: null,
    revision: 1n,
    clocks: {},
  };
  return { ...base, ...overrides } as Task;
}

describe('selectSystemFilters — «Без даты» (01§16)', () => {
  it('активная задача без plannedDate и без deadlineDate попадает в noDate', () => {
    const bare = task();

    const groups = selectSystemFilters([bare], now);

    expect(groups.noDate.map((x) => x.id)).toEqual([bare.id]);
  });

  it('задача только с plannedDate НЕ попадает в noDate', () => {
    const planned = task({ plannedDate: d('2026-09-01') });

    const groups = selectSystemFilters([planned], now);

    expect(groups.noDate).toHaveLength(0);
  });

  it('задача только с deadlineDate НЕ попадает в noDate', () => {
    const deadlined = task({ deadlineDate: d('2026-09-01') });

    const groups = selectSystemFilters([deadlined], now);

    expect(groups.noDate).toHaveLength(0);
  });
});

describe('selectSystemFilters — «P1 / Критичные» (01§16)', () => {
  it('активная задача с priority=1 попадает в p1', () => {
    const critical = task({ priority: makePriority(1) });

    const groups = selectSystemFilters([critical], now);

    expect(groups.p1.map((x) => x.id)).toEqual([critical.id]);
  });

  it('задача с priority=2..4 НЕ попадает в p1', () => {
    const p2 = task({ priority: makePriority(2) });

    const groups = selectSystemFilters([p2], now);

    expect(groups.p1).toHaveLength(0);
  });
});

describe('selectSystemFilters — «Не по плану» переиспользует classifyTaskForToday (01§16)', () => {
  it('активная задача с plannedDate в прошлом (и без просроченного дедлайна) попадает в missedPlan', () => {
    const missedPlan = task({ plannedDate: d('2026-08-30') });

    const groups = selectSystemFilters([missedPlan], now);

    expect(groups.missedPlan.map((x) => x.id)).toEqual([missedPlan.id]);
  });

  it('задача с plannedDate=сегодня НЕ попадает в missedPlan', () => {
    const plannedToday = task({ plannedDate: today });

    const groups = selectSystemFilters([plannedToday], now);

    expect(groups.missedPlan).toHaveLength(0);
  });

  it('задача одновременно с просроченным planned И просроченным deadline попадает ТОЛЬКО в missedDeadline — прецеденс classifyTaskForToday, не дублируется в missedPlan', () => {
    const both = task({ plannedDate: d('2026-08-29'), deadlineDate: d('2026-08-30') });

    const groups = selectSystemFilters([both], now);

    expect(groups.missedPlan).toHaveLength(0);
    expect(groups.missedDeadline.map((x) => x.id)).toEqual([both.id]);
  });
});

describe('selectSystemFilters — «Просрочен срок» переиспользует classifyTaskForToday (01§16)', () => {
  it('активная задача с deadlineDate в прошлом попадает в missedDeadline', () => {
    const overdue = task({ deadlineDate: d('2026-08-30') });

    const groups = selectSystemFilters([overdue], now);

    expect(groups.missedDeadline.map((x) => x.id)).toEqual([overdue.id]);
  });

  it('задача с deadlineDate=сегодня и без deadlineTime (конец суток) НЕ попадает в missedDeadline', () => {
    const dueToday = task({ deadlineDate: today });

    const groups = selectSystemFilters([dueToday], now);

    expect(groups.missedDeadline).toHaveLength(0);
  });
});

describe('selectSystemFilters — «Повторяющиеся» (01§16)', () => {
  it('активная задача с seriesId !== null попадает в recurring', () => {
    const recurring = task({ seriesId: uuid() });

    const groups = selectSystemFilters([recurring], now);

    expect(groups.recurring.map((x) => x.id)).toEqual([recurring.id]);
  });

  it('задача с seriesId === null НЕ попадает в recurring', () => {
    const single = task();

    const groups = selectSystemFilters([single], now);

    expect(groups.recurring).toHaveLength(0);
  });
});

describe('selectSystemFilters — завершённые задачи никогда не попадают ни в один фильтр (защита в глубину)', () => {
  it('завершённая задача без дат, с priority=1, с seriesId и просроченным дедлайном — ни в одном из пяти списков', () => {
    const completed = task({
      status: 'completed',
      completedAt: Temporal.Instant.from('2026-08-31T09:00:00Z'),
      completionKind: 'done',
      priority: makePriority(1),
      seriesId: uuid(),
      deadlineDate: d('2026-08-01'),
      plannedDate: d('2026-08-01'),
    });

    const groups = selectSystemFilters([completed], now);

    for (const id of SYSTEM_FILTER_IDS) {
      expect(groups[id]).toHaveLength(0);
    }
  });
});

describe('selectSystemFilters — смешанный набор, задачи под несколько фильтров одновременно и ни под один', () => {
  it('собирает правильный список для каждого из пяти фильтров разом', () => {
    const bare = task(); // noDate
    const criticalWithPlan = task({ priority: makePriority(1), plannedDate: d('2026-09-05') }); // p1 only
    const missedPlanTask = task({ plannedDate: d('2026-08-20') }); // missedPlan
    const missedDeadlineTask = task({ deadlineDate: d('2026-08-20') }); // missedDeadline
    const recurringFuture = task({ seriesId: uuid(), plannedDate: d('2026-09-10') }); // recurring only
    // Подходит сразу под два независимых фильтра: без дат И критичная.
    const bareAndCritical = task({ priority: makePriority(1) });
    // Не подходит ни под один из пяти.
    const plain = task({ plannedDate: d('2026-09-01'), priority: makePriority(3) });

    const groups = selectSystemFilters(
      [
        bare,
        criticalWithPlan,
        missedPlanTask,
        missedDeadlineTask,
        recurringFuture,
        bareAndCritical,
        plain,
      ],
      now,
    );

    expect(groups.noDate.map((x) => x.id).toSorted()).toEqual(
      [bare.id, bareAndCritical.id].toSorted(),
    );
    expect(groups.p1.map((x) => x.id).toSorted()).toEqual(
      [criticalWithPlan.id, bareAndCritical.id].toSorted(),
    );
    expect(groups.missedPlan.map((x) => x.id)).toEqual([missedPlanTask.id]);
    expect(groups.missedDeadline.map((x) => x.id)).toEqual([missedDeadlineTask.id]);
    expect(groups.recurring.map((x) => x.id)).toEqual([recurringFuture.id]);
  });
});
