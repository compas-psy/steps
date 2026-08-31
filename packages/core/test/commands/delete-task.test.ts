import { describe, expect, it } from 'vitest';

import { deleteTaskCommand } from '../../src/commands/delete-task.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import { DEVICE_ID, NOW, existingTask, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(
  storage: InMemoryCommandStoragePort,
  overrides: Partial<TaskCommandDeps> = {},
): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID, ...overrides };
}

describe('deleteTaskCommand — успешный путь (мягкое удаление)', () => {
  it('устанавливает deletedAt (tombstone), не стирает запись физически', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask();
    storage.seedTask(task);

    const result = await deleteTaskCommand({ id: task.id }, deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.deletedAt?.equals(NOW)).toBe(true);

    // Запись физически осталась в порту — findById всё ещё её видит.
    const stored = storage.allTasks().find((candidate) => candidate.id === task.id);
    expect(stored).toBeDefined();
    expect(stored?.deletedAt?.equals(NOW)).toBe(true);
    expect(stored?.title).toBe(task.title);
  });

  it('пишет outbox-запись и инкрементирует revision', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask();
    storage.seedTask(task);

    const result = await deleteTaskCommand({ id: task.id }, deps(storage));
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.task.revision).toBe(task.revision + 1n);
    expect(storage.outboxEntries()).toHaveLength(1);
    expect(storage.outboxEntries()[0]?.entityId).toBe(task.id);
    expect(storage.outboxEntries()[0]?.baseRevision).toBe(task.revision);
  });
});

describe('deleteTaskCommand — не найдена / уже удалена', () => {
  it('несуществующий id — not_found, порт не тронут', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await deleteTaskCommand({ id: uuid('321') }, deps(storage));

    expect(result.status).toBe('not_found');
    expect(storage.isEmpty()).toBe(true);
  });

  it('повторное удаление уже удалённой задачи — not_found, без повторной outbox-записи', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ deletedAt: NOW.subtract({ hours: 1 }) });
    storage.seedTask(task);

    const result = await deleteTaskCommand({ id: task.id }, deps(storage));

    expect(result.status).toBe('not_found');
    expect(storage.outboxEntries()).toHaveLength(0);
  });
});
