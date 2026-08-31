import { describe, expect, it } from 'vitest';

import { deleteSeriesCommand } from '../../src/commands/delete-series.js';
import { completeOccurrenceCommand } from '../../src/commands/complete-occurrence.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import type { RecurrenceSeries } from '../../src/entities/recurrence-series.js';
import { deriveOccurrenceId } from '../../src/identity/index.js';
import { makeOccurrenceSeq } from '../../src/values.js';
import { DEVICE_ID, NOW, existingTask, d, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(
  storage: InMemoryCommandStoragePort,
  overrides: Partial<TaskCommandDeps> = {},
): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID, ...overrides };
}

const SERIES_ID = uuid('5e51e5000004');

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

function currentOccurrence(seq = 1n) {
  return existingTask({
    id: deriveOccurrenceId(SERIES_ID, makeOccurrenceSeq(seq)),
    seriesId: SERIES_ID,
    occurrenceSeq: seq,
    plannedDate: d('2026-08-31'),
  });
}

describe('deleteSeriesCommand — «Удалить всю серию» (§11.8)', () => {
  it('останавливает генерацию: active=false, stopAfterOccurrenceSeq = occurrenceSeq текущего', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = currentOccurrence(1n);
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailyScheduledSeries());

    const result = await deleteSeriesCommand({ currentOccurrenceId: current.id }, deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.series.active).toBe(false);
    expect(result.series.stopAfterOccurrenceSeq).toBe(1n);
  });

  it('tombstone-ит текущий активный occurrence (каскадом — подзадачи/чек-лист тоже)', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = currentOccurrence(1n);
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailyScheduledSeries());
    const subtask = existingTask({
      id: uuid('b1'),
      parentTaskId: current.id,
      captureState: 'processed',
      seriesId: null,
      occurrenceSeq: null,
    });
    storage.seedTask(subtask);

    const result = await deleteSeriesCommand({ currentOccurrenceId: current.id }, deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.deletedAt).not.toBeNull();
    expect(result.affectedSubtaskIds).toContain(subtask.id);
    const subtaskAfter = storage.allTasks().find((task) => task.id === subtask.id);
    expect(subtaskAfter?.deletedAt).not.toBeNull();
  });

  it('после удаления серии завершение уже сгенерированной истории НЕ создаёт новый occurrence (граница уважена)', async () => {
    const storage = new InMemoryCommandStoragePort();
    const first = currentOccurrence(1n);
    storage.seedTask(first);
    storage.seedRecurrenceSeries(dailyScheduledSeries());

    // Occurrence 1 завершается штатно → генерируется occurrence 2.
    const completed = await completeOccurrenceCommand(
      { id: first.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    if (completed.status !== 'ok' || completed.generatedTask === null) {
      throw new Error('ожидался успех с сгенерированным occurrence');
    }
    const second = completed.generatedTask;

    // Пользователь удаляет всю серию, стоя на occurrence 2.
    const deleteResult = await deleteSeriesCommand(
      { currentOccurrenceId: second.id },
      deps(storage),
    );
    expect(deleteResult.status).toBe('ok');
    if (deleteResult.status !== 'ok') return;
    expect(deleteResult.series.stopAfterOccurrenceSeq).toBe(2n);

    // occurrence 1 (уже завершённый, история) остаётся НЕТРОНУТЫМ —
    // preserved completed history (§11.8).
    const firstAfter = storage.allTasks().find((task) => task.id === first.id);
    expect(firstAfter?.deletedAt).toBeNull();
    expect(firstAfter?.status).toBe('completed');
  });

  it('несуществующий id — not_found', async () => {
    const storage = new InMemoryCommandStoragePort();
    const result = await deleteSeriesCommand({ currentOccurrenceId: uuid('404') }, deps(storage));
    expect(result.status).toBe('not_found');
  });

  it('не recurring задача (seriesId=null) — not_recurring, ничего не пишет', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask();
    storage.seedTask(task);

    const result = await deleteSeriesCommand({ currentOccurrenceId: task.id }, deps(storage));

    expect(result.status).toBe('not_recurring');
    expect(storage.outboxEntries()).toHaveLength(0);
  });
});
