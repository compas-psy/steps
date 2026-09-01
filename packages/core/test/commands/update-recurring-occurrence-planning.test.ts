import { describe, expect, it } from 'vitest';

import { updateRecurringOccurrencePlanningCommand } from '../../src/commands/update-recurring-occurrence-planning.js';
import { parseRecurrenceOccurrenceTemplate } from '../../src/commands/recurrence-template.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import type { RecurrenceSeries } from '../../src/entities/recurrence-series.js';
import type { Task } from '../../src/entities/task.js';
import { deriveOccurrenceId } from '../../src/identity/index.js';
import { makeDurationMinutes, makeOccurrenceSeq } from '../../src/values.js';
import { DEVICE_ID, NOW, existingTask, d, t, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(
  storage: InMemoryCommandStoragePort,
  overrides: Partial<TaskCommandDeps> = {},
): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID, ...overrides };
}

const SERIES_ID = uuid('5e51e5000004');

function scheduledSeries(overrides: Partial<RecurrenceSeries> = {}): RecurrenceSeries {
  const base: RecurrenceSeries = {
    id: SERIES_ID,
    anchorType: 'scheduled',
    rrule: JSON.stringify({ unit: 'day', interval: 1 }),
    completionIntervalJson: null,
    templateJson: {
      unit: 'day',
      interval: 1,
      plannedTime: '09:00:00',
      durationMin: null,
      deadlineOffsetDays: null,
      deadlineTime: null,
      availableFromOffsetDays: null,
    },
    active: true,
    nextOccurrenceSeq: makeOccurrenceSeq(2n),
    stopAfterOccurrenceSeq: null,
    templateRevision: 1n,
    createdAt: NOW.subtract({ hours: 3 }),
    updatedAt: NOW.subtract({ hours: 3 }),
    clocks: {},
  };
  return { ...base, ...overrides } as RecurrenceSeries;
}

function occurrence(overrides: Partial<Task> = {}): Task {
  const base = existingTask({
    id: deriveOccurrenceId(SERIES_ID, makeOccurrenceSeq(1n)),
    seriesId: SERIES_ID,
    occurrenceSeq: 1n,
    plannedDate: d('2026-08-31'),
    plannedTime: t('09:00'),
  });
  return { ...base, ...overrides } as Task;
}

describe('updateRecurringOccurrencePlanningCommand — валидные входы (M26)', () => {
  it('scope="occurrence": патчит Task, НЕ трогает RecurrenceSeries вообще', async () => {
    const storage = new InMemoryCommandStoragePort();
    const series = scheduledSeries();
    storage.seedRecurrenceSeries(series);
    const task = occurrence();
    storage.seedTask(task);

    const result = await updateRecurringOccurrencePlanningCommand(
      { id: task.id, scope: 'occurrence', patch: { plannedTime: t('14:00') } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.plannedTime?.toString()).toBe('14:00:00');

    const seriesAfter = storage.findRecurrenceSeries(SERIES_ID);
    expect(seriesAfter).toEqual(series);
  });

  it('scope="series": патчит Task И пересчитывает шаблон серии из НОВЫХ значений', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedRecurrenceSeries(scheduledSeries());
    const task = occurrence();
    storage.seedTask(task);

    const result = await updateRecurringOccurrencePlanningCommand(
      {
        id: task.id,
        scope: 'series',
        patch: { plannedTime: t('14:00'), durationMin: makeDurationMinutes(60) },
      },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.plannedTime?.toString()).toBe('14:00:00');
    expect(result.task.durationMin).toBe(60);

    const seriesAfter = storage.findRecurrenceSeries(SERIES_ID);
    expect(seriesAfter?.templateRevision).toBe(2n);
    const tpl = parseRecurrenceOccurrenceTemplate(seriesAfter?.templateJson ?? {});
    expect(tpl.plannedTime?.toString()).toBe('14:00:00');
    expect(tpl.durationMin).toBe(60);
    // rrule-ключи целы — эта команда не трогает свою половину.
    expect(seriesAfter?.templateJson.unit).toBe('day');
    expect(seriesAfter?.templateJson.interval).toBe(1);
  });

  it('scope="series": deadlineDate/availableFrom пересчитываются в офсеты от НОВОГО plannedDate', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedRecurrenceSeries(scheduledSeries());
    const task = occurrence();
    storage.seedTask(task);

    const result = await updateRecurringOccurrencePlanningCommand(
      {
        id: task.id,
        scope: 'series',
        patch: {
          plannedDate: d('2026-09-05'),
          deadlineDate: d('2026-09-07'),
          availableFrom: d('2026-09-04'),
        },
      },
      deps(storage),
    );
    expect(result.status).toBe('ok');

    const seriesAfter = storage.findRecurrenceSeries(SERIES_ID);
    const tpl = parseRecurrenceOccurrenceTemplate(seriesAfter?.templateJson ?? {});
    expect(tpl.deadlineOffsetDays).toBe(2);
    expect(tpl.availableFromOffsetDays).toBe(-1);
  });

  it('scope="occurrence": rejected-патч (валидатор) не трогает ни Task, ни серию', async () => {
    const storage = new InMemoryCommandStoragePort();
    const series = scheduledSeries();
    storage.seedRecurrenceSeries(series);
    const task = occurrence();
    storage.seedTask(task);

    // plannedTime без plannedDate — правило 1/2, блокирующее.
    const result = await updateRecurringOccurrencePlanningCommand(
      { id: task.id, scope: 'occurrence', patch: { plannedDate: null, plannedTime: t('14:00') } },
      deps(storage),
    );

    expect(result.status).toBe('rejected');
    const storedTask = await storage.tasks.findById(task.id);
    expect(storedTask?.plannedDate?.toString()).toBe('2026-08-31');
    expect(storage.findRecurrenceSeries(SERIES_ID)).toEqual(series);
  });
});

describe('updateRecurringOccurrencePlanningCommand — вызов из некорректного места', () => {
  it('task.seriesId===null — throw, не ValidationResult', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ seriesId: null });
    storage.seedTask(task);

    await expect(
      updateRecurringOccurrencePlanningCommand(
        { id: task.id, scope: 'occurrence', patch: { plannedTime: t('14:00') } },
        deps(storage),
      ),
    ).rejects.toThrow();
  });

  it('задача не найдена — throw', async () => {
    const storage = new InMemoryCommandStoragePort();

    await expect(
      updateRecurringOccurrencePlanningCommand(
        { id: uuid('404'), scope: 'occurrence', patch: { plannedTime: t('14:00') } },
        deps(storage),
      ),
    ).rejects.toThrow();
  });
});
