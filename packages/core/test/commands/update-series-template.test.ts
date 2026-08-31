import { describe, expect, it } from 'vitest';

import { updateSeriesTemplateCommand } from '../../src/commands/update-series-template.js';
import { updateTaskCommand } from '../../src/commands/update-task.js';
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

const SERIES_ID = uuid('5e51e5000003');

function scheduledSeries(overrides: Partial<RecurrenceSeries> = {}): RecurrenceSeries {
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
    createdAt: NOW.subtract({ hours: 5 }),
    updatedAt: NOW.subtract({ hours: 5 }),
    clocks: {},
  };
  return { ...base, ...overrides } as RecurrenceSeries;
}

describe('updateSeriesTemplateCommand — «Вся серия» (§11.6)', () => {
  it('патчит templateJson и инкрементирует templateRevision', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedRecurrenceSeries(scheduledSeries());

    const result = await updateSeriesTemplateCommand(
      { seriesId: SERIES_ID, rule: { unit: 'week', interval: 1, byWeekday: [1, 3, 5] } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.series.templateJson).toEqual({ unit: 'week', interval: 1, byWeekday: [1, 3, 5] });
    expect(result.series.templateRevision).toBe(2n);
    expect(result.series.updatedAt.equals(NOW)).toBe(true);
  });

  it('scheduled-серия: rrule обновляется как строка того же правила', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedRecurrenceSeries(scheduledSeries());

    const result = await updateSeriesTemplateCommand(
      { seriesId: SERIES_ID, rule: { unit: 'month', interval: 1, byMonthDay: 15 } },
      deps(storage),
    );
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.series.anchorType).toBe('scheduled');
    expect(typeof result.series.rrule).toBe('string');
    expect(result.series.completionIntervalJson).toBeNull();
  });

  it('completion-серия: completionIntervalJson обновляется, rrule остаётся null', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedRecurrenceSeries(
      scheduledSeries({
        anchorType: 'completion',
        rrule: null,
        completionIntervalJson: { unit: 'day', interval: 1 },
      }),
    );

    const result = await updateSeriesTemplateCommand(
      { seriesId: SERIES_ID, rule: { unit: 'week', interval: 2 } },
      deps(storage),
    );
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.series.anchorType).toBe('completion');
    expect(result.series.rrule).toBeNull();
    expect(result.series.completionIntervalJson).toEqual({ unit: 'week', interval: 2 });
  });

  it('не трогает stopAfterOccurrenceSeq/nextOccurrenceSeq/active', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedRecurrenceSeries(
      scheduledSeries({
        nextOccurrenceSeq: makeOccurrenceSeq(7n),
        stopAfterOccurrenceSeq: makeOccurrenceSeq(9n),
      }),
    );

    const result = await updateSeriesTemplateCommand(
      { seriesId: SERIES_ID, rule: { unit: 'day', interval: 2 } },
      deps(storage),
    );
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.series.nextOccurrenceSeq).toBe(7n);
    expect(result.series.stopAfterOccurrenceSeq).toBe(9n);
    expect(result.series.active).toBe(true);
  });

  it('несуществующая серия — not_found', async () => {
    const storage = new InMemoryCommandStoragePort();
    const result = await updateSeriesTemplateCommand(
      { seriesId: uuid('404'), rule: { unit: 'day', interval: 1 } },
      deps(storage),
    );
    expect(result.status).toBe('not_found');
  });
});

describe('«Это повторение» vs «Вся серия» — разграничение (§11.6)', () => {
  it('updateTaskCommand ("Это повторение") не трогает RecurrenceSeries.templateJson/templateRevision вообще', async () => {
    const storage = new InMemoryCommandStoragePort();
    const series = scheduledSeries();
    storage.seedRecurrenceSeries(series);
    const occurrence = existingTask({
      id: deriveOccurrenceId(SERIES_ID, makeOccurrenceSeq(1n)),
      seriesId: SERIES_ID,
      occurrenceSeq: 1n,
      plannedDate: d('2026-08-31'),
    });
    storage.seedTask(occurrence);

    const result = await updateTaskCommand(
      { id: occurrence.id, patch: { title: 'Только это повторение' } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    const seriesAfter = storage.findRecurrenceSeries(SERIES_ID);
    expect(seriesAfter).toEqual(series);
  });
});
