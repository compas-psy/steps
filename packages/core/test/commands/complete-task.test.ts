import { describe, expect, it } from 'vitest';

import { completeTaskCommand } from '../../src/commands/complete-task.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import { DEVICE_ID, NOW, existingTask, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(
  storage: InMemoryCommandStoragePort,
  overrides: Partial<TaskCommandDeps> = {},
): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID, ...overrides };
}

describe('completeTaskCommand — успешный путь', () => {
  it('устанавливает status/completedAt/completionKind согласованно и пишет через порт', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask();
    storage.seedTask(task);

    const result = await completeTaskCommand({ id: task.id }, deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.status).toBe('completed');
    expect(result.task.completedAt?.equals(NOW)).toBe(true);
    expect(result.task.completionKind).toBe('done');

    const stored = storage.allTasks().find((candidate) => candidate.id === task.id);
    expect(stored?.status).toBe('completed');
    expect(storage.outboxEntries()).toHaveLength(1);
  });

  it('completionKind по умолчанию "done", явный "skipped" переопределяет', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask();
    storage.seedTask(task);

    const result = await completeTaskCommand(
      { id: task.id, completionKind: 'skipped' },
      deps(storage),
    );
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.task.completionKind).toBe('skipped');
  });

  it('инкрементирует revision, обновляет updatedAt, тикает HLC только completion-полей', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask();
    storage.seedTask(task);

    const result = await completeTaskCommand({ id: task.id }, deps(storage));
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.task.revision).toBe(task.revision + 1n);
    expect(result.task.clocks['status']?.physical.equals(NOW)).toBe(true);
    expect(result.task.clocks['completedAt']?.physical.equals(NOW)).toBe(true);
    expect(result.task.clocks['completionKind']?.physical.equals(NOW)).toBe(true);
    expect(result.task.clocks['title']).toBeUndefined();
  });

  it('задача из серии (seriesId != null) завершается как обычная — генерация следующего occurrence не входит в этот пакет работ', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ seriesId: uuid('0a1') });
    storage.seedTask(task);

    const result = await completeTaskCommand({ id: task.id }, deps(storage));
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.task.status).toBe('completed');
    // Ровно одна outbox-запись — "complete current + generate next" (`02§13`)
    // здесь не происходит, это шов для эпика E11.
    expect(storage.outboxEntries()).toHaveLength(1);
  });
});

describe('completeTaskCommand — путь отклонения / не найдена', () => {
  it('несуществующий id — not_found, порт не тронут', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await completeTaskCommand({ id: uuid('777') }, deps(storage));

    expect(result.status).toBe('not_found');
    expect(storage.isEmpty()).toBe(true);
  });

  it('tombstone-задача — not_found, не подлежит завершению', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ deletedAt: NOW.subtract({ hours: 1 }) });
    storage.seedTask(task);

    const result = await completeTaskCommand({ id: task.id }, deps(storage));

    expect(result.status).toBe('not_found');
    expect(storage.outboxEntries()).toHaveLength(0);
  });
});
