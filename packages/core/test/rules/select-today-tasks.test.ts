import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { initialRank, rankAfter } from '../../src/order/index.js';
import { asUuid, makePriority, type Uuid } from '../../src/values.js';
import type { Task } from '../../src/entities/task.js';
import {
  selectTodayTasks,
  type TodayStorageQueryPort,
  type TodayTaskReader,
} from '../../src/rules/select-today-tasks.js';

const d = (iso: string) => Temporal.PlainDate.from(iso);
const t = (iso: string) => Temporal.PlainTime.from(iso);
const now = Temporal.PlainDateTime.from('2026-09-01T10:00:00');
const today = now.toPlainDate();

let taskCounter = 0;
function uuid(): Uuid {
  taskCounter += 1;
  return asUuid(`00000000-0000-0000-0000-${String(taskCounter).padStart(12, '0')}`);
}

/** Минимальная валидная активная задача — только temporal-поля, нужные
 * `classifyTaskForToday`, варьируются через `overrides` в каждом тесте. */
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

/**
 * Фейковый `TodayTaskReader` — три независимых списка, ровно как три
 * реальных индекса `TaskRepository` (`packages/storage`): каждый список
 * фильтрует по `status` сам, как и настоящий индекс, поэтому если
 * `selectTodayTasks` забудет передать `status: 'active'` в один из трёх
 * вызовов, тест с завершённой задачей в соответствующем списке это поймает.
 */
function fakeReader(tasks: readonly Task[]): TodayTaskReader {
  return {
    listByStatusAndPlannedDate: (status) =>
      Promise.resolve(tasks.filter((x) => x.status === status && x.plannedDate !== null)),
    listByStatusAndDeadlineDate: (status) =>
      Promise.resolve(tasks.filter((x) => x.status === status && x.deadlineDate !== null)),
    listByFocusDate: (focusDate, status) =>
      Promise.resolve(
        tasks.filter(
          (x) => x.status === status && x.focusDate !== null && x.focusDate.equals(focusDate),
        ),
      ),
  };
}

function storageOf(tasks: readonly Task[]): TodayStorageQueryPort {
  return { tasks: fakeReader(tasks) };
}

describe('selectTodayTasks — отбор кандидатов из трёх индексов + группировка + сортировка (01§6)', () => {
  it('находит задачу с focusDate=сегодня, чей plannedDate — другой день (только через индекс focus_date)', async () => {
    const focusOnly = task({ plannedDate: d('2026-09-05'), focusDate: today });
    const groups = await selectTodayTasks(storageOf([focusOnly]), now);
    expect(groups.focus.map((x) => x.id)).toEqual([focusOnly.id]);
  });

  it('находит задачу с deadlineDate в прошлом и без plannedDate вовсе (только через индекс deadline_date)', async () => {
    const overdue = task({ deadlineDate: d('2026-08-20'), deadlineTime: null });
    const groups = await selectTodayTasks(storageOf([overdue]), now);
    expect(groups.missed_deadline.map((x) => x.id)).toEqual([overdue.id]);
  });

  it('задача, подходящая под два индекса разом (planned=сегодня и deadline просрочен), не дублируется — попадает ровно в одну, высшую по прецедансу группу', async () => {
    const both = task({ plannedDate: today, deadlineDate: d('2026-08-20'), deadlineTime: null });
    const groups = await selectTodayTasks(storageOf([both]), now);

    const allIds = [
      ...groups.missed_deadline,
      ...groups.missed_plan,
      ...groups.focus,
      ...groups.timed,
      ...groups.today,
      ...groups.later,
    ].map((x) => x.id);

    expect(allIds).toEqual([both.id]);
    expect(groups.missed_deadline.map((x) => x.id)).toEqual([both.id]);
    expect(groups.today).toHaveLength(0);
  });

  it('сортирует "По времени" по времени по возрастанию, затем по rank', async () => {
    const rank1 = initialRank();
    const rank2 = rankAfter(rank1);
    const late = task({ plannedDate: today, plannedTime: t('18:00'), rank: rank1 });
    const early = task({ plannedDate: today, plannedTime: t('09:00'), rank: rank2 });
    const groups = await selectTodayTasks(storageOf([late, early]), now);
    expect(groups.timed.map((x) => x.id)).toEqual([early.id, late.id]);
  });

  it('сортирует "Сегодня" и "Когда будет время" по rank', async () => {
    const rank1 = initialRank();
    const rank2 = rankAfter(rank1);
    const second = task({ plannedDate: today, rank: rank2 });
    const first = task({ plannedDate: today, rank: rank1 });
    const groups = await selectTodayTasks(storageOf([second, first]), now);
    expect(groups.today.map((x) => x.id)).toEqual([first.id, second.id]);
  });

  it('status=completed исключены сквозь весь конвейер отбора, даже если индекс их вернёт (защита в глубину сверх classifyTaskForToday)', async () => {
    const completed = task({
      plannedDate: today,
      status: 'completed',
      completedAt: Temporal.Instant.from('2026-09-01T09:00:00Z'),
      completionKind: 'done',
    });
    // Фейковый индекс НЕ фильтрует по статусу здесь специально — имитирует
    // ошибочную реализацию репозитория, чтобы доказать, что конвейер сам
    // не полагается только на честность индекса.
    const dishonestReader: TodayTaskReader = {
      listByStatusAndPlannedDate: () => Promise.resolve([completed]),
      listByStatusAndDeadlineDate: () => Promise.resolve([]),
      listByFocusDate: () => Promise.resolve([]),
    };
    const groups = await selectTodayTasks({ tasks: dishonestReader }, now);
    const allIds = [
      ...groups.missed_deadline,
      ...groups.missed_plan,
      ...groups.focus,
      ...groups.timed,
      ...groups.today,
      ...groups.later,
    ];
    expect(allIds).toHaveLength(0);
  });

  it('пустой набор кандидатов — все шесть групп пусты', async () => {
    const groups = await selectTodayTasks(storageOf([]), now);
    expect(groups.missed_deadline).toEqual([]);
    expect(groups.missed_plan).toEqual([]);
    expect(groups.focus).toEqual([]);
    expect(groups.timed).toEqual([]);
    expect(groups.today).toEqual([]);
    expect(groups.later).toEqual([]);
  });
});
