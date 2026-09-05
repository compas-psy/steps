import { describe, expect, it } from 'vitest';

import { createChecklistItemCommand } from '../../src/commands/checklist-item-create.js';
import { deleteSeriesCommand } from '../../src/commands/delete-series.js';
import { undoDeleteSeriesCommand } from '../../src/commands/undo-delete-series.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import type { RecurrenceSeries } from '../../src/entities/recurrence-series.js';
import { deriveOccurrenceId } from '../../src/identity/index.js';
import { makeOccurrenceSeq } from '../../src/values.js';
import { DEVICE_ID, NOW, d, existingTask, t, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(
  storage: InMemoryCommandStoragePort,
  overrides: Partial<TaskCommandDeps> = {},
): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID, ...overrides };
}

const SERIES_ID = uuid('5e51e500000d');

function series(overrides: Partial<RecurrenceSeries> = {}): RecurrenceSeries {
  const base: RecurrenceSeries = {
    id: SERIES_ID,
    anchorType: 'scheduled',
    rrule: JSON.stringify({ unit: 'day', interval: 1 }),
    completionIntervalJson: null,
    templateJson: { unit: 'day', interval: 1 },
    active: true,
    nextOccurrenceSeq: makeOccurrenceSeq(3n),
    stopAfterOccurrenceSeq: null,
    templateRevision: 1n,
    createdAt: NOW.subtract({ hours: 2 }),
    updatedAt: NOW.subtract({ hours: 2 }),
    clocks: {},
  };
  return { ...base, ...overrides } as RecurrenceSeries;
}

function occurrence(seq: bigint, overrides = {}) {
  return existingTask({
    id: deriveOccurrenceId(SERIES_ID, makeOccurrenceSeq(seq)),
    seriesId: SERIES_ID,
    occurrenceSeq: seq,
    plannedDate: d('2026-08-31'),
    plannedTime: t('09:00'),
    ...overrides,
  });
}

/**
 * Undo «Удалить всю серию» (`01§11.8`, ST §58 U3). Зеркало атомарного
 * `deleteSeriesCommand`: ОДНА мутация возвращает и серию в точное прежнее
 * состояние, и текущий occurrence с его графом. Цепочка «сначала вернуть
 * задачи, потом серию» недопустима — между двумя транзакциями живёт
 * состояние «occurrence жив, а генерация всё ещё остановлена».
 */
describe('undoDeleteSeriesCommand — Undo удаления всей серии (ST §58 U3)', () => {
  it('возвращает серию в active и текущий occurrence — ОДНОЙ транзакцией', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = occurrence(2n);
    storage.seedTask(current);
    storage.seedRecurrenceSeries(series());

    const deleted = await deleteSeriesCommand({ currentOccurrenceId: current.id }, deps(storage));
    if (deleted.status !== 'ok') throw new Error('удаление серии не прошло — предпосылка теста');
    expect(deleted.series.active).toBe(false);
    expect(deleted.series.stopAfterOccurrenceSeq).toBe(2n);

    const before = storage.transactionCount;
    const undone = await undoDeleteSeriesCommand(
      {
        currentOccurrenceId: current.id,
        previousSeries: deleted.previousSeries,
        subtaskIds: deleted.affectedSubtaskIds,
        checklistItems: deleted.affectedChecklistItems,
      },
      deps(storage),
    );
    expect(undone.status).toBe('ok');
    expect(storage.transactionCount - before).toBe(1);

    const restoredSeries = await storage.recurrenceSeries.findById(SERIES_ID);
    expect(restoredSeries?.active).toBe(true);
    expect((await storage.tasks.findById(current.id))?.deletedAt).toBeNull();
  });

  it('возвращает ПРЕЖНИЙ stopAfterOccurrenceSeq, а не предполагаемый null', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = occurrence(5n);
    storage.seedTask(current);
    // Серия уже была ограничена раньше (например, «до конца месяца»):
    // откат обязан вернуть ИМЕННО эту границу, а не «никакой».
    storage.seedRecurrenceSeries(
      series({
        nextOccurrenceSeq: makeOccurrenceSeq(6n),
        stopAfterOccurrenceSeq: makeOccurrenceSeq(9n),
      }),
    );

    const deleted = await deleteSeriesCommand({ currentOccurrenceId: current.id }, deps(storage));
    if (deleted.status !== 'ok') throw new Error('удаление серии не прошло — предпосылка теста');
    expect(deleted.series.stopAfterOccurrenceSeq).toBe(5n);

    await undoDeleteSeriesCommand(
      {
        currentOccurrenceId: current.id,
        previousSeries: deleted.previousSeries,
        subtaskIds: deleted.affectedSubtaskIds,
        checklistItems: deleted.affectedChecklistItems,
      },
      deps(storage),
    );

    const restored = await storage.recurrenceSeries.findById(SERIES_ID);
    expect(restored?.stopAfterOccurrenceSeq).toBe(9n);
    expect(restored?.nextOccurrenceSeq).toBe(6n);
    expect(restored?.active).toBe(true);
  });

  it('возвращает весь граф: подзадачи и пункты чек-листа текущего occurrence', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = occurrence(2n);
    const child = existingTask({
      id: uuid('5e5100000021'),
      title: 'Подзадача повторения',
      parentTaskId: current.id,
    });
    storage.seedTask(current);
    storage.seedTask(child);
    storage.seedRecurrenceSeries(series());
    const item = await createChecklistItemCommand(
      { taskId: current.id, text: 'Пункт', rank: { placement: 'empty-list' } },
      deps(storage),
    );
    expect(item.status).toBe('ok');

    const deleted = await deleteSeriesCommand({ currentOccurrenceId: current.id }, deps(storage));
    if (deleted.status !== 'ok') throw new Error('удаление серии не прошло — предпосылка теста');
    expect(deleted.affectedSubtaskIds).toContain(child.id);
    expect(deleted.affectedChecklistItems).toHaveLength(1);

    const undone = await undoDeleteSeriesCommand(
      {
        currentOccurrenceId: current.id,
        previousSeries: deleted.previousSeries,
        subtaskIds: deleted.affectedSubtaskIds,
        checklistItems: deleted.affectedChecklistItems,
      },
      deps(storage),
    );
    expect(undone.status).toBe('ok');

    expect((await storage.tasks.findById(child.id))?.deletedAt).toBeNull();
    expect(await storage.checklistItems.listByTask(current.id)).toHaveLength(1);
  });

  it('срыв транзакции: не восстановлено ничего — ни серия, ни occurrence', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = occurrence(2n);
    storage.seedTask(current);
    storage.seedRecurrenceSeries(series());
    const deleted = await deleteSeriesCommand({ currentOccurrenceId: current.id }, deps(storage));
    if (deleted.status !== 'ok') throw new Error('удаление серии не прошло — предпосылка теста');

    storage.failNextMutation();
    await expect(
      undoDeleteSeriesCommand(
        {
          currentOccurrenceId: current.id,
          previousSeries: deleted.previousSeries,
          subtaskIds: deleted.affectedSubtaskIds,
          checklistItems: deleted.affectedChecklistItems,
        },
        deps(storage),
      ),
    ).rejects.toThrow();

    expect((await storage.recurrenceSeries.findById(SERIES_ID))?.active).toBe(false);
    expect((await storage.tasks.findById(current.id))?.deletedAt).not.toBeNull();
  });

  it('идемпотентность: повторный undo не пишет вторую мутацию', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = occurrence(2n);
    storage.seedTask(current);
    storage.seedRecurrenceSeries(series());
    const deleted = await deleteSeriesCommand({ currentOccurrenceId: current.id }, deps(storage));
    if (deleted.status !== 'ok') throw new Error('удаление серии не прошло — предпосылка теста');

    const input = {
      currentOccurrenceId: current.id,
      previousSeries: deleted.previousSeries,
      subtaskIds: deleted.affectedSubtaskIds,
      checklistItems: deleted.affectedChecklistItems,
    };
    await undoDeleteSeriesCommand(input, deps(storage));
    const outboxAfterFirst = storage.outboxEntries().length;
    const revisionAfterFirst = (await storage.tasks.findById(current.id))?.revision;

    const second = await undoDeleteSeriesCommand(input, deps(storage));
    expect(second.status).toBe('not_deleted');
    expect(storage.outboxEntries().length).toBe(outboxAfterFirst);
    expect((await storage.tasks.findById(current.id))?.revision).toBe(revisionAfterFirst);
  });
});
