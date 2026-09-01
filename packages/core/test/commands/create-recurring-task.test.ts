import { describe, expect, it } from 'vitest';

import {
  createRecurringTaskCommand,
  type CreateRecurringTaskInput,
} from '../../src/commands/create-recurring-task.js';
import { parseRecurrenceOccurrenceTemplate } from '../../src/commands/recurrence-template.js';
import { deriveOccurrenceId } from '../../src/identity/index.js';
import { makeDurationMinutes, makeOccurrenceSeq } from '../../src/values.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import { DEVICE_ID, NOW, OWNER_SCOPE, d, t, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(
  storage: InMemoryCommandStoragePort,
  overrides: Partial<TaskCommandDeps> = {},
): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID, ...overrides };
}

function baseInput(overrides: Partial<CreateRecurringTaskInput> = {}): CreateRecurringTaskInput {
  return {
    ownerScope: OWNER_SCOPE,
    title: 'Полить цветы',
    captureState: 'processed',
    source: 'user',
    rank: { placement: 'empty-list' },
    anchorType: 'scheduled',
    rule: { unit: 'day', interval: 1 },
    plannedDate: d('2026-08-31'),
    ...overrides,
  };
}

describe('createRecurringTaskCommand — успешный путь', () => {
  it('пишет RecurrenceSeries и первый top-level occurrence Task одной командой', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createRecurringTaskCommand(baseInput(), deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(storage.allTasks()).toHaveLength(1);
    expect(storage.allRecurrenceSeries()).toHaveLength(1);
    expect(result.task.seriesId).toBe(result.series.id);
    expect(result.task.parentTaskId).toBeNull();
    expect(result.task.occurrenceSeq).toBe(1n);
  });

  it('id первого occurrence — детерминированный UUIDv5(seriesId, "occurrence:1"), не UUIDv7', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createRecurringTaskCommand(baseInput(), deps(storage));
    if (result.status !== 'ok') throw new Error('ожидался успех');

    const expectedId = deriveOccurrenceId(result.series.id, makeOccurrenceSeq(1n));
    expect(result.task.id).toBe(expectedId);
  });

  it('серия: active=true, nextOccurrenceSeq=2 (occurrence 1 уже материализован), templateRevision=1', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createRecurringTaskCommand(baseInput(), deps(storage));
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.series.active).toBe(true);
    expect(result.series.nextOccurrenceSeq).toBe(2n);
    expect(result.series.stopAfterOccurrenceSeq).toBeNull();
    expect(result.series.templateRevision).toBe(1n);
  });

  it('anchorType="scheduled": rrule непустая строка, completionIntervalJson=null', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createRecurringTaskCommand(
      baseInput({ anchorType: 'scheduled' }),
      deps(storage),
    );
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.series.anchorType).toBe('scheduled');
    expect(typeof result.series.rrule).toBe('string');
    expect(result.series.completionIntervalJson).toBeNull();
  });

  it('anchorType="completion": completionIntervalJson задан, rrule=null', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createRecurringTaskCommand(
      baseInput({ anchorType: 'completion', rule: { unit: 'month', interval: 1 } }),
      deps(storage),
    );
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.series.anchorType).toBe('completion');
    expect(result.series.rrule).toBeNull();
    expect(result.series.completionIntervalJson).toEqual({ unit: 'month', interval: 1 });
  });

  it('два независимых вызова с одинаковым seriesId (через generateId) дают ОДИН и тот же occurrence id — сходимость', async () => {
    const storageA = new InMemoryCommandStoragePort();
    const storageB = new InMemoryCommandStoragePort();
    const fixedSeriesId = uuid('a1a1a1a1a1a1');

    const resultA = await createRecurringTaskCommand(
      baseInput(),
      deps(storageA, { generateId: () => fixedSeriesId }),
    );
    const resultB = await createRecurringTaskCommand(
      baseInput(),
      deps(storageB, { generateId: () => fixedSeriesId }),
    );
    if (resultA.status !== 'ok' || resultB.status !== 'ok') {
      throw new Error('ожидался успех в обоих вызовах');
    }

    expect(resultA.series.id).toBe(resultB.series.id);
    expect(resultA.task.id).toBe(resultB.task.id);
  });
});

describe('createRecurringTaskCommand — occurrence-шаблон (M26)', () => {
  it('несёт plannedTime/durationMin/офсеты дедлайна и доступности, вычисленные от plannedDate', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createRecurringTaskCommand(
      baseInput({
        plannedDate: d('2026-08-31'),
        plannedTime: t('09:00'),
        durationMin: makeDurationMinutes(30),
        deadlineDate: d('2026-09-02'),
        deadlineTime: t('18:00'),
        availableFrom: d('2026-08-29'),
      }),
      deps(storage),
    );
    if (result.status !== 'ok') throw new Error('ожидался успех');

    const tpl = parseRecurrenceOccurrenceTemplate(result.series.templateJson);
    expect(tpl.plannedTime?.toString()).toBe('09:00:00');
    expect(tpl.durationMin).toBe(30);
    expect(tpl.deadlineOffsetDays).toBe(2);
    expect(tpl.deadlineTime?.toString()).toBe('18:00:00');
    expect(tpl.availableFromOffsetDays).toBe(-2);
  });

  it('rrule-ключи (unit/interval/...) остаются читаемыми в том же templateJson', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createRecurringTaskCommand(
      baseInput({ rule: { unit: 'week', interval: 1, byWeekday: [1, 2] } }),
      deps(storage),
    );
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.series.templateJson.unit).toBe('week');
    expect(result.series.templateJson.byWeekday).toEqual([1, 2]);
  });

  it('без plannedDate — офсеты null, а не устаревшее абсолютное значение', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createRecurringTaskCommand(
      baseInput({
        plannedDate: null,
        deadlineDate: d('2026-09-02'),
        availableFrom: d('2026-08-29'),
      }),
      deps(storage),
    );
    if (result.status !== 'ok') throw new Error('ожидался успех');

    const tpl = parseRecurrenceOccurrenceTemplate(result.series.templateJson);
    expect(tpl.deadlineOffsetDays).toBeNull();
    expect(tpl.availableFromOffsetDays).toBeNull();
  });
});

describe('createRecurringTaskCommand — отклонение валидатором', () => {
  it('пустой заголовок отклоняется, и НИЧЕГО не пишется (ни серия, ни задача)', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createRecurringTaskCommand(baseInput({ title: '   ' }), deps(storage));

    expect(result.status).toBe('rejected');
    expect(storage.allTasks()).toHaveLength(0);
    expect(storage.allRecurrenceSeries()).toHaveLength(0);
  });
});
