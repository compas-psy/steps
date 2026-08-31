import { describe, expect, it } from 'vitest';

import {
  completeOccurrenceCommand,
  skipOccurrenceCommand,
} from '../../src/commands/complete-occurrence.js';
import { undoCompleteOccurrenceCommand } from '../../src/commands/undo-complete-occurrence.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import { updateTaskCommand } from '../../src/commands/update-task.js';
import type { RecurrenceSeries } from '../../src/entities/recurrence-series.js';
import { deriveOccurrenceId } from '../../src/identity/index.js';
import { makeOccurrenceSeq } from '../../src/values.js';
import { DEVICE_ID, NOW, existingTask, d, t, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(
  storage: InMemoryCommandStoragePort,
  overrides: Partial<TaskCommandDeps> = {},
): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID, ...overrides };
}

const SERIES_ID = uuid('5e51e5000002');

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

function currentOccurrence() {
  return existingTask({
    id: deriveOccurrenceId(SERIES_ID, makeOccurrenceSeq(1n)),
    seriesId: SERIES_ID,
    occurrenceSeq: 1n,
    plannedDate: d('2026-08-31'),
    plannedTime: t('09:00'),
  });
}

describe('undoCompleteOccurrenceCommand — не recurring', () => {
  it('откатывает status в active, generatedOccurrenceId=null — ничего больше не трогает', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask();
    storage.seedTask(task);
    const completed = await completeOccurrenceCommand(
      { id: task.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    if (completed.status !== 'ok') throw new Error('ожидался успех');

    const result = await undoCompleteOccurrenceCommand(
      { occurrenceId: task.id, generatedOccurrenceId: null },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.status).toBe('active');
    expect(result.task.completedAt).toBeNull();
    expect(result.task.completionKind).toBeNull();
    expect(result.removedGeneratedTask).toBe(false);
  });

  it('несуществующий id — not_found', async () => {
    const storage = new InMemoryCommandStoragePort();
    const result = await undoCompleteOccurrenceCommand(
      { occurrenceId: uuid('404'), generatedOccurrenceId: null },
      deps(storage),
    );
    expect(result.status).toBe('not_found');
  });

  it('задача ещё активна (не была завершена) — not_completed, ничего не пишет', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask();
    storage.seedTask(task);

    const result = await undoCompleteOccurrenceCommand(
      { occurrenceId: task.id, generatedOccurrenceId: null },
      deps(storage),
    );

    expect(result.status).toBe('not_completed');
    expect(storage.outboxEntries()).toHaveLength(0);
  });
});

describe('undoCompleteOccurrenceCommand — recurring, next occurrence нетронут', () => {
  it('откатывает текущий в active И удаляет (tombstone) нетронутый next occurrence', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = currentOccurrence();
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailyScheduledSeries());

    const completed = await completeOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    if (completed.status !== 'ok' || completed.generatedTask === null) {
      throw new Error('ожидался успех с сгенерированным occurrence');
    }
    const generatedId = completed.generatedTask.id;

    const result = await undoCompleteOccurrenceCommand(
      { occurrenceId: current.id, generatedOccurrenceId: generatedId },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.status).toBe('active');
    expect(result.removedGeneratedTask).toBe(true);

    const generatedAfterUndo = storage.allTasks().find((task) => task.id === generatedId);
    expect(generatedAfterUndo?.deletedAt).not.toBeNull();

    // Серия откатывается — следующее завершение снова сгенерирует ТОТ ЖЕ id
    // (сходимость undo/redo).
    expect(result.series?.nextOccurrenceSeq).toBe(2n);
  });

  it('undo/redo цикл: повторное завершение после undo снова генерирует тот же occurrence id', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = currentOccurrence();
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailyScheduledSeries());

    const firstComplete = await completeOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    if (firstComplete.status !== 'ok' || firstComplete.generatedTask === null) {
      throw new Error('ожидался успех');
    }
    const firstGeneratedId = firstComplete.generatedTask.id;

    await undoCompleteOccurrenceCommand(
      { occurrenceId: current.id, generatedOccurrenceId: firstGeneratedId },
      deps(storage),
    );

    const secondComplete = await completeOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    if (secondComplete.status !== 'ok' || secondComplete.generatedTask === null) {
      throw new Error('ожидался успех');
    }

    expect(secondComplete.generatedTask.id).toBe(firstGeneratedId);
  });
});

describe('undoCompleteOccurrenceCommand — recurring, next occurrence УЖЕ изменён', () => {
  it('сохраняет изменённый next occurrence — не удаляет его, но текущий всё равно откатывается', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = currentOccurrence();
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailyScheduledSeries());

    const completed = await completeOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    if (completed.status !== 'ok' || completed.generatedTask === null) {
      throw new Error('ожидался успех');
    }
    const generatedId = completed.generatedTask.id;

    // Пользователь успел отредактировать только что сгенерированный next
    // occurrence ДО того, как нажал Undo на завершении текущего.
    await updateTaskCommand(
      { id: generatedId, patch: { title: 'Уже отредактировано' } },
      deps(storage),
    );

    const result = await undoCompleteOccurrenceCommand(
      { occurrenceId: current.id, generatedOccurrenceId: generatedId },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.status).toBe('active');
    expect(result.removedGeneratedTask).toBe(false);

    const preserved = storage.allTasks().find((task) => task.id === generatedId);
    expect(preserved?.deletedAt).toBeNull();
    expect(preserved?.title).toBe('Уже отредактировано');
  });
});

describe('undoCompleteOccurrenceCommand — skip', () => {
  it('откатывает skip так же, как complete', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = currentOccurrence();
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailyScheduledSeries());

    const skipped = await skipOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    if (skipped.status !== 'ok' || skipped.generatedTask === null) {
      throw new Error('ожидался успех');
    }

    const result = await undoCompleteOccurrenceCommand(
      { occurrenceId: current.id, generatedOccurrenceId: skipped.generatedTask.id },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.status).toBe('active');
    expect(result.task.completionKind).toBeNull();
    expect(result.removedGeneratedTask).toBe(true);
  });
});
