import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { initialRank, rankAfter } from '../../src/order/index.js';
import { asUuid, makePriority, type Uuid } from '../../src/values.js';
import type { Task } from '../../src/entities/task.js';
import { selectPlanAgenda } from '../../src/rules/select-plan-agenda.js';

const d = (iso: string) => Temporal.PlainDate.from(iso);
const time = (iso: string) => Temporal.PlainTime.from(iso);
const today = d('2026-08-31');

let taskCounter = 0;
function uuid(): Uuid {
  taskCounter += 1;
  return asUuid(`00000000-0000-0000-0000-${String(taskCounter).padStart(12, '0')}`);
}

/** Минимальная валидная активная задача — тот же приём, что
 * `select-today-tasks.test.ts` (см. её заголовок): только temporal-поля,
 * нужные `selectPlanAgenda`, варьируются через `overrides` в каждом тесте. */
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

describe('selectPlanAgenda — группировка по plannedDate, хронологический порядок (01§14)', () => {
  it('группирует задачи по plannedDate, дни идут в хронологическом порядке', () => {
    const onThird = task({ plannedDate: d('2026-09-03') });
    const onFirst = task({ plannedDate: d('2026-09-01') });
    const onSecond = task({ plannedDate: d('2026-09-02') });

    // Порядок посева — намеренно не хронологический, чтобы тест не проходил
    // случайно от порядка входного массива.
    const groups = selectPlanAgenda([onThird, onFirst, onSecond], today);

    expect(groups.map((g) => g.date.toString())).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
    expect(groups[0]?.tasks.map((x) => x.id)).toEqual([onFirst.id]);
    expect(groups[1]?.tasks.map((x) => x.id)).toEqual([onSecond.id]);
    expect(groups[2]?.tasks.map((x) => x.id)).toEqual([onThird.id]);
  });

  it('несколько задач одного дня попадают в одну группу', () => {
    const first = task({ plannedDate: d('2026-09-01'), rank: initialRank() });
    const second = task({
      plannedDate: d('2026-09-01'),
      rank: rankAfter(initialRank()),
    });

    const groups = selectPlanAgenda([first, second], today);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.tasks.map((x) => x.id)).toEqual([first.id, second.id]);
  });

  it('задача без plannedDate не попадает в Plan вовсе, даже если есть дедлайн (01§14, дословно)', () => {
    const deadlineOnly = task({ deadlineDate: d('2026-09-05'), deadlineTime: null });

    const groups = selectPlanAgenda([deadlineOnly], today);

    expect(groups).toHaveLength(0);
  });

  it('завершённая задача не попадает в Plan (защита в глубину, тот же принцип, что classifyTaskForToday)', () => {
    const completed = task({
      plannedDate: d('2026-09-01'),
      status: 'completed',
      completedAt: Temporal.Instant.from('2026-08-31T09:00:00Z'),
      completionKind: 'done',
    });

    const groups = selectPlanAgenda([completed], today);

    expect(groups).toHaveLength(0);
  });

  it('задача, запланированная на прошедший день, не попадает в Plan — только будущее (граница §14, решение пакета работ)', () => {
    const past = task({ plannedDate: d('2026-08-30') });

    const groups = selectPlanAgenda([past], today);

    expect(groups).toHaveLength(0);
  });

  it('задача, запланированная на сегодня, ВКЛЮЧЕНА в Plan — "сегодня" входит в границу будущего', () => {
    const todayTask = task({ plannedDate: today });

    const groups = selectPlanAgenda([todayTask], today);

    expect(groups.map((g) => g.date.toString())).toEqual([today.toString()]);
    expect(groups[0]?.tasks.map((x) => x.id)).toEqual([todayTask.id]);
  });

  it('внутри дня задачи со временем идут по возрастанию времени, затем задачи без времени — по rank', () => {
    const untimedFirst = task({ plannedDate: d('2026-09-01'), rank: initialRank() });
    const untimedSecond = task({
      plannedDate: d('2026-09-01'),
      rank: rankAfter(initialRank()),
    });
    const late = task({ plannedDate: d('2026-09-01'), plannedTime: time('18:00') });
    const early = task({ plannedDate: d('2026-09-01'), plannedTime: time('09:00') });

    const groups = selectPlanAgenda([untimedFirst, late, untimedSecond, early], today);

    expect(groups[0]?.tasks.map((x) => x.id)).toEqual([
      early.id,
      late.id,
      untimedFirst.id,
      untimedSecond.id,
    ]);
  });
});

describe('selectPlanAgenda — маркер Available From (01§14, дословно "не другая задача и не считается в totals")', () => {
  it('день с availableFrom в будущем без единой запланированной задачи получает маркер, но пустой список задач', () => {
    const marker = task({ availableFrom: d('2026-09-10') });

    const groups = selectPlanAgenda([marker], today);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.date.toString()).toBe('2026-09-10');
    expect(groups[0]?.tasks).toHaveLength(0);
    expect(groups[0]?.availableFromMarker).toBe(true);
  });

  it('маркер не считается в числе задач дня, когда в тот же день есть и запланированные задачи', () => {
    const withMarker = task({ availableFrom: d('2026-09-01') });
    const planned = task({ plannedDate: d('2026-09-01') });

    const groups = selectPlanAgenda([withMarker, planned], today);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.tasks).toHaveLength(1);
    expect(groups[0]?.tasks.map((x) => x.id)).toEqual([planned.id]);
    expect(groups[0]?.availableFromMarker).toBe(true);
  });

  it('день без маркера — availableFromMarker=false', () => {
    const planned = task({ plannedDate: d('2026-09-01') });

    const groups = selectPlanAgenda([planned], today);

    expect(groups[0]?.availableFromMarker).toBe(false);
  });

  it('availableFrom в прошлом не создаёт маркер — задача уже доступна, "станет доступна" неверно для прошлого', () => {
    const alreadyAvailable = task({ availableFrom: d('2026-08-20') });

    const groups = selectPlanAgenda([alreadyAvailable], today);

    expect(groups).toHaveLength(0);
  });

  it('availableFrom=сегодня создаёт маркер — та же граница будущего, что и plannedDate', () => {
    const availableToday = task({ availableFrom: today });

    const groups = selectPlanAgenda([availableToday], today);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.date.toString()).toBe(today.toString());
    expect(groups[0]?.availableFromMarker).toBe(true);
  });
});
