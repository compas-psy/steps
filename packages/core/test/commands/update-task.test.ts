import { describe, expect, it } from 'vitest';

import { updateTaskCommand, type UpdateTaskPatch } from '../../src/commands/update-task.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import { makeDurationMinutes } from '../../src/values.js';
import { DEVICE_ID, NOW, d, existingTask, t, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(
  storage: InMemoryCommandStoragePort,
  overrides: Partial<TaskCommandDeps> = {},
): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID, ...overrides };
}

async function withSeeded(overrides: Parameters<typeof existingTask>[0] = {}) {
  const storage = new InMemoryCommandStoragePort();
  const task = existingTask(overrides);
  storage.seedTask(task);
  return { storage, task };
}

describe('updateTaskCommand — успешный путь', () => {
  it('пишет изменённую сущность и outbox-запись через порт', async () => {
    const { storage, task } = await withSeeded();

    const result = await updateTaskCommand(
      { id: task.id, patch: { title: 'Новый заголовок' } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.title).toBe('Новый заголовок');

    const stored = storage.allTasks().find((candidate) => candidate.id === task.id);
    expect(stored?.title).toBe('Новый заголовок');
    expect(storage.outboxEntries()).toHaveLength(1);
    expect(storage.outboxEntries()[0]?.entityId).toBe(task.id);
    expect(storage.outboxEntries()[0]?.baseRevision).toBe(task.revision);
  });

  it('инкрементирует revision и обновляет updatedAt=now', async () => {
    const { storage, task } = await withSeeded();

    const result = await updateTaskCommand({ id: task.id, patch: { title: 'X' } }, deps(storage));
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.task.revision).toBe(task.revision + 1n);
    expect(result.task.updatedAt.equals(NOW)).toBe(true);
    expect(result.task.createdAt.equals(task.createdAt)).toBe(true);
  });

  it('обновляет HLC только реально изменившегося поля, остальные клоки не трогает', async () => {
    const priorClock = { physical: NOW.subtract({ hours: 24 }), logical: 0, deviceId: DEVICE_ID };
    const { storage, task } = await withSeeded({
      description: 'старое описание',
      clocks: { title: priorClock, description: priorClock },
    });

    const result = await updateTaskCommand(
      { id: task.id, patch: { title: 'Новый заголовок' } },
      deps(storage),
    );
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.task.clocks['title']?.physical.equals(NOW)).toBe(true);
    // description не была в патче и не изменилась — клок остаётся прежним.
    expect(result.task.clocks['description']).toBe(priorClock);
  });

  it('смена plannedDate сбрасывает focusDate и day_bucket через переиспользованное правило field-resets.setPlannedDate', async () => {
    const { storage, task } = await withSeeded({
      plannedDate: d('2026-09-01'),
      focusDate: d('2026-09-01'),
      dayBucket: 'later',
      plannedTime: t('09:00'),
    });

    const patch: UpdateTaskPatch = { plannedDate: d('2026-09-05') };
    const result = await updateTaskCommand({ id: task.id, patch }, deps(storage));
    if (result.status !== 'ok') throw new Error('ожидался успех: ' + JSON.stringify(result));

    expect(result.task.plannedDate?.toString()).toBe('2026-09-05');
    // focusDate ссылался на старую дату — новая дата не совпадает, сброшен.
    expect(result.task.focusDate).toBeNull();
    // day_bucket всегда сбрасывается в 'default' при смене Planned Date.
    expect(result.task.dayBucket).toBe('default');
    // plannedTime — независимое поле, переносится без изменений.
    expect(result.task.plannedTime?.toString()).toBe('09:00:00');
  });

  it('очистка plannedDate (null) убирает Time/Focus/day_bucket, но оставляет Duration', async () => {
    const { storage, task } = await withSeeded({
      plannedDate: d('2026-09-01'),
      plannedTime: t('09:00'),
      focusDate: d('2026-09-01'),
      dayBucket: 'later',
      durationMin: makeDurationMinutes(30),
    });

    const result = await updateTaskCommand(
      { id: task.id, patch: { plannedDate: null } },
      deps(storage),
    );
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.task.plannedDate).toBeNull();
    expect(result.task.plannedTime).toBeNull();
    expect(result.task.focusDate).toBeNull();
    expect(result.task.dayBucket).toBe('default');
    expect(result.task.durationMin).toBe(30);
  });

  it('очистка deadlineDate убирает deadlineTime вместе с ним (clearDeadline)', async () => {
    const { storage, task } = await withSeeded({
      deadlineDate: d('2026-09-10'),
      deadlineTime: t('18:00'),
    });

    const result = await updateTaskCommand(
      { id: task.id, patch: { deadlineDate: null } },
      deps(storage),
    );
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.task.deadlineDate).toBeNull();
    expect(result.task.deadlineTime).toBeNull();
  });

  it('rank: смена по патчу пересчитывает позицию через order/', async () => {
    const { storage, task } = await withSeeded();
    const other = existingTask({ id: uuid('002') });
    storage.seedTask(other);

    const result = await updateTaskCommand(
      { id: task.id, patch: { rank: { placement: 'end', lastRank: other.rank } } },
      deps(storage),
    );
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.task.rank > other.rank).toBe(true);
  });

  it('пустой патч (ключ не тронут) не меняет соответствующее поле', async () => {
    const { storage, task } = await withSeeded({ description: 'исходное описание' });

    const result = await updateTaskCommand({ id: task.id, patch: { title: 'X' } }, deps(storage));
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.task.description).toBe('исходное описание');
  });
});

describe('updateTaskCommand — путь отклонения на блокирующем нарушении', () => {
  it('невалидный патч отклоняется, хранимая задача не меняется', async () => {
    const { storage, task } = await withSeeded();

    const result = await updateTaskCommand(
      { id: task.id, patch: { sectionId: uuid('009') } },
      deps(storage),
    );

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.validation.issues.some((issue) => issue.rule === 5)).toBe(true);

    const stored = storage.allTasks().find((candidate) => candidate.id === task.id);
    expect(stored).toEqual(task);
    expect(storage.outboxEntries()).toHaveLength(0);
  });

  it('plannedTime без plannedDate — отклоняется правилом 1 (наивный путь без field-resets)', async () => {
    const { storage, task } = await withSeeded();

    const result = await updateTaskCommand(
      { id: task.id, patch: { plannedTime: t('09:00') } },
      deps(storage),
    );

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.validation.issues.some((issue) => issue.rule === 1)).toBe(true);
  });
});

describe('updateTaskCommand — задача не найдена', () => {
  it('несуществующий id — not_found', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await updateTaskCommand(
      { id: uuid('999'), patch: { title: 'X' } },
      deps(storage),
    );

    expect(result.status).toBe('not_found');
  });

  it('tombstone-задача — not_found, не подлежит обновлению', async () => {
    const { storage, task } = await withSeeded({ deletedAt: NOW.subtract({ hours: 2 }) });

    const result = await updateTaskCommand({ id: task.id, patch: { title: 'X' } }, deps(storage));

    expect(result.status).toBe('not_found');
  });
});
