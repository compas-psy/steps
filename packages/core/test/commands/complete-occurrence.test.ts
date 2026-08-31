import { describe, expect, it } from 'vitest';

import {
  completeOccurrenceCommand,
  skipOccurrenceCommand,
} from '../../src/commands/complete-occurrence.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import type { RecurrenceSeries } from '../../src/entities/recurrence-series.js';
import {
  deriveChecklistItemId,
  deriveOccurrenceId,
  deriveSubtaskId,
} from '../../src/identity/index.js';
import { makeOccurrenceSeq } from '../../src/values.js';
import { DEVICE_ID, NOW, existingTask, d, t, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(
  storage: InMemoryCommandStoragePort,
  overrides: Partial<TaskCommandDeps> = {},
): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID, ...overrides };
}

const SERIES_ID = uuid('5e51e5000001');

function dailyScheduledSeries(overrides: Partial<RecurrenceSeries> = {}): RecurrenceSeries {
  const base: RecurrenceSeries = {
    id: SERIES_ID,
    anchorType: 'scheduled',
    rrule: JSON.stringify({ unit: 'day', interval: 1 }),
    completionIntervalJson: null,
    templateJson: { unit: 'day', interval: 1 },
    active: true,
    nextOccurrenceSeq: makeOccurrenceSeq(2n),
    stopAfterOccurrenceSeq: null,
    templateRevision: 1n,
    createdAt: NOW.subtract({ hours: 2 }),
    updatedAt: NOW.subtract({ hours: 2 }),
    clocks: {},
  };
  return { ...base, ...overrides } as RecurrenceSeries;
}

function currentOccurrence(seriesId = SERIES_ID) {
  return existingTask({
    id: deriveOccurrenceId(seriesId, makeOccurrenceSeq(1n)),
    seriesId,
    occurrenceSeq: 1n,
    plannedDate: d('2026-08-31'),
    plannedTime: t('09:00'),
  });
}

describe('completeOccurrenceCommand — не recurring (seriesId=null)', () => {
  it('ведёт себя как обычный completeTaskCommand — series:null, generatedTask:null', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask();
    storage.seedTask(task);

    const result = await completeOccurrenceCommand(
      { id: task.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.status).toBe('completed');
    expect(result.series).toBeNull();
    expect(result.generatedTask).toBeNull();
    expect(result.generatedChecklistItems).toHaveLength(0);
  });

  it('несуществующий id — not_found', async () => {
    const storage = new InMemoryCommandStoragePort();
    const result = await completeOccurrenceCommand(
      { id: uuid('999'), occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    expect(result.status).toBe('not_found');
  });
});

describe('completeOccurrenceCommand — recurring, scheduled anchor', () => {
  it('завершает текущий occurrence и генерирует следующий с детерминированным id', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = currentOccurrence();
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailyScheduledSeries());

    const result = await completeOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.task.status).toBe('completed');
    expect(result.task.completionKind).toBe('done');

    expect(result.generatedTask).not.toBeNull();
    const generated = result.generatedTask;
    if (generated === null) return;

    const expectedNextId = deriveOccurrenceId(SERIES_ID, makeOccurrenceSeq(2n));
    expect(generated.id).toBe(expectedNextId);
    expect(generated.seriesId).toBe(SERIES_ID);
    expect(generated.occurrenceSeq).toBe(2n);
    expect(generated.parentTaskId).toBeNull();
    expect(generated.status).toBe('active');
    expect(generated.plannedDate?.equals(d('2026-09-01'))).toBe(true);
    // Время суток переносится неизменным (floating wall-clock, §11.7).
    expect(generated.plannedTime?.toString()).toBe('09:00:00');
    expect(generated.generatedFromOccurrenceId).toBe(current.id);
    expect(generated.source).toBe('recurrence');
    expect(generated.captureState).toBe('processed');

    expect(result.series?.nextOccurrenceSeq).toBe(3n);
  });

  it('копирует активные и завершённые subtasks родителя неполными с детерминированными id', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = currentOccurrence();
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailyScheduledSeries());

    const activeSubtask = existingTask({
      id: uuid('a1'),
      parentTaskId: current.id,
      captureState: 'processed',
      title: 'Купить лейку',
      seriesId: null,
      occurrenceSeq: null,
    });
    const completedSubtask = existingTask({
      id: uuid('a2'),
      parentTaskId: current.id,
      captureState: 'processed',
      title: 'Прочитать инструкцию',
      seriesId: null,
      occurrenceSeq: null,
      status: 'completed',
      completedAt: NOW.subtract({ minutes: 30 }),
      completionKind: 'done',
    });
    storage.seedTask(activeSubtask);
    storage.seedTask(completedSubtask);

    const result = await completeOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    if (result.status !== 'ok' || result.generatedTask === null) {
      throw new Error('ожидался успех с сгенерированным occurrence');
    }

    const nextOccurrenceId = result.generatedTask.id;
    const expectedActiveId = deriveSubtaskId(nextOccurrenceId, activeSubtask.id);
    const expectedCompletedId = deriveSubtaskId(nextOccurrenceId, completedSubtask.id);

    const newActive = storage.allTasks().find((task) => task.id === expectedActiveId);
    const newCompleted = storage.allTasks().find((task) => task.id === expectedCompletedId);

    expect(newActive).toBeDefined();
    expect(newActive?.status).toBe('active');
    expect(newActive?.parentTaskId).toBe(nextOccurrenceId);

    // Завершённый subtask пересоздаётся НЕЗАВЕРШЁННЫМ (§11.1 "recreate them
    // incomplete") — даже если в текущем occurrence он был done.
    expect(newCompleted).toBeDefined();
    expect(newCompleted?.status).toBe('active');
  });

  it('копирует checklist items неполными (done:false) с детерминированными id', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = currentOccurrence();
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailyScheduledSeries());

    storage.seedChecklistItem({
      id: uuid('c1'),
      taskId: current.id,
      text: 'Проверить землю',
      done: true,
      rank: current.rank,
      deletedAt: null,
      clocks: {},
    });

    const result = await completeOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    if (result.status !== 'ok' || result.generatedTask === null) {
      throw new Error('ожидался успех с сгенерированным occurrence');
    }

    const expectedItemId = deriveChecklistItemId(result.generatedTask.id, uuid('c1'));
    expect(result.generatedChecklistItems).toHaveLength(1);
    expect(result.generatedChecklistItems[0]?.id).toBe(expectedItemId);
    expect(result.generatedChecklistItems[0]?.done).toBe(false);
  });

  it('уважает stopAfterOccurrenceSeq — не генерирует occurrence за границей серии', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = currentOccurrence();
    storage.seedTask(current);
    storage.seedRecurrenceSeries(
      dailyScheduledSeries({ stopAfterOccurrenceSeq: makeOccurrenceSeq(1n) }),
    );

    const result = await completeOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.status).toBe('completed');
    expect(result.generatedTask).toBeNull();
    expect(storage.allTasks()).toHaveLength(1);
  });

  it('два независимых вызова с тем же исходным состоянием дают ОДИН и тот же id следующего occurrence', async () => {
    const storageA = new InMemoryCommandStoragePort();
    const storageB = new InMemoryCommandStoragePort();
    for (const storage of [storageA, storageB]) {
      storage.seedTask(currentOccurrence());
      storage.seedRecurrenceSeries(dailyScheduledSeries());
    }

    const resultA = await completeOccurrenceCommand(
      { id: currentOccurrence().id, occurrenceLocalDate: d('2026-08-31') },
      deps(storageA),
    );
    const resultB = await completeOccurrenceCommand(
      { id: currentOccurrence().id, occurrenceLocalDate: d('2026-08-31') },
      deps(storageB),
    );
    if (resultA.status !== 'ok' || resultB.status !== 'ok') {
      throw new Error('ожидался успех в обоих вызовах');
    }

    expect(resultA.generatedTask?.id).toBe(resultB.generatedTask?.id);
  });
});

describe('skipOccurrenceCommand', () => {
  it('текущий occurrence получает completionKind="skipped", следующий всё равно генерируется', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = currentOccurrence();
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailyScheduledSeries());

    const result = await skipOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.completionKind).toBe('skipped');
    expect(result.generatedTask).not.toBeNull();
  });
});
