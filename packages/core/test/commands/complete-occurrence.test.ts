import { describe, expect, it } from 'vitest';

import {
  completeOccurrenceCommand,
  skipOccurrenceCommand,
} from '../../src/commands/complete-occurrence.js';
import { updateRecurringOccurrencePlanningCommand } from '../../src/commands/update-recurring-occurrence-planning.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import type { RecurrenceSeries } from '../../src/entities/recurrence-series.js';
import {
  deriveChecklistItemId,
  deriveOccurrenceId,
  deriveSubtaskId,
} from '../../src/identity/index.js';
import { makeDurationMinutes, makeOccurrenceSeq } from '../../src/values.js';
import { DEVICE_ID, NOW, existingTask, d, t, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(
  storage: InMemoryCommandStoragePort,
  overrides: Partial<TaskCommandDeps> = {},
): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID, ...overrides };
}

const SERIES_ID = uuid('5e51e5000001');

/**
 * M26: `templateJson` теперь несёт и rrule-ключи, и `RecurrenceOccurrenceTemplate`
 * (`recurrence-template.ts`, «M26») — `generateNextOccurrence` читает
 * `plannedTime`/`durationMin`/офсеты ИЗ ЭТОГО объекта, а не с `current`
 * (`currentOccurrence()` ниже). Фикстура несёт `plannedTime:'09:00:00'`,
 * согласованный с `currentOccurrence().plannedTime` — так уже существующие
 * тесты ниже ("время суток переносится неизменным") остаются верны и под
 * новой архитектурой; там, где тест намеренно проверяет ИЗОЛЯЦИЮ шаблона от
 * текущего occurrence (см. `describe` "«Это повторение» ...` ниже), фикстура
 * переопределяется через `overrides`.
 */
function dailyScheduledSeries(overrides: Partial<RecurrenceSeries> = {}): RecurrenceSeries {
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

describe('M26 — «Это повторение» изолирует правку от следующего occurrence, «Вся серия» — нет (§11.6)', () => {
  /** САМЫЙ ВАЖНЫЙ тест этого пакета работ (M26): доказывает, что
   * `generateNextOccurrence` реально читает шаблон серии, а не `current` —
   * без правки `complete-occurrence.ts` этот тест ловит именно ту ошибку,
   * которую задание просило не пропустить. */
  it('scope="occurrence": следующий occurrence несёт СТАРОЕ plannedTime из шаблона, не патч текущего', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = currentOccurrence(); // plannedTime = 09:00 (см. фикстуру)
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailyScheduledSeries());

    const patchResult = await updateRecurringOccurrencePlanningCommand(
      { id: current.id, scope: 'occurrence', patch: { plannedTime: t('14:00') } },
      deps(storage),
    );
    expect(patchResult.status).toBe('ok');
    // Патч применился к ТЕКУЩЕМУ occurrence — это одинаково для обоих scope.
    const patched = await storage.tasks.findById(current.id);
    expect(patched?.plannedTime?.toString()).toBe('14:00:00');
    // Шаблон серии НЕ тронут — scope="occurrence" не пишет в RecurrenceSeries.
    expect(storage.findRecurrenceSeries(SERIES_ID)?.templateJson).toEqual(
      dailyScheduledSeries().templateJson,
    );

    const result = await completeOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    // Следующий occurrence несёт СТАРОЕ время (09:00, из шаблона), НЕ 14:00.
    expect(result.generatedTask?.plannedTime?.toString()).toBe('09:00:00');
  });

  it('scope="series": следующий occurrence несёт НОВОЕ plannedTime — правка просочилась в шаблон', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = currentOccurrence(); // plannedTime = 09:00
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailyScheduledSeries());

    const patchResult = await updateRecurringOccurrencePlanningCommand(
      { id: current.id, scope: 'series', patch: { plannedTime: t('14:00') } },
      deps(storage),
    );
    expect(patchResult.status).toBe('ok');
    // Шаблон серии обновился — templateRevision вырос, rrule-ключи целы.
    const seriesAfterPatch = storage.findRecurrenceSeries(SERIES_ID);
    expect(seriesAfterPatch?.templateRevision).toBe(2n);
    expect(seriesAfterPatch?.templateJson.unit).toBe('day');
    expect(seriesAfterPatch?.templateJson.plannedTime).toBe('14:00:00');

    const result = await completeOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    // Следующий occurrence несёт НОВОЕ время — «Вся серия» просачивается вперёд.
    expect(result.generatedTask?.plannedTime?.toString()).toBe('14:00:00');
  });

  it('scope="series" переносит и durationMin/офсеты дедлайна+доступности, не только plannedTime', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = currentOccurrence();
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailyScheduledSeries());

    await updateRecurringOccurrencePlanningCommand(
      {
        id: current.id,
        scope: 'series',
        patch: {
          durationMin: makeDurationMinutes(45),
          deadlineDate: d('2026-09-02'),
          availableFrom: d('2026-08-30'),
        },
      },
      deps(storage),
    );

    const result = await completeOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const generated = result.generatedTask;
    expect(generated?.durationMin).toBe(45);
    // plannedDate текущего occurrence — 2026-08-31, deadlineDate патча —
    // 2026-09-02 (offset +2 дня), availableFrom — 2026-08-30 (offset -1 день).
    // Следующий occurrence генерируется на 2026-09-01 (scheduled, +1 день).
    expect(generated?.plannedDate?.toString()).toBe('2026-09-01');
    expect(generated?.deadlineDate?.toString()).toBe('2026-09-03');
    expect(generated?.availableFrom?.toString()).toBe('2026-08-31');
  });
});
