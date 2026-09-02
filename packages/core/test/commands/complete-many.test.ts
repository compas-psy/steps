import { describe, expect, it } from 'vitest';

import { completeManyCommand, previewBulkCompletion } from '../../src/commands/complete-many.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import { DEVICE_ID, NOW, existingTask, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(storage: InMemoryCommandStoragePort): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID };
}

describe('completeManyCommand (M37, 01§20)', () => {
  it('завершает несколько выбранных задач одной транзакцией', async () => {
    const storage = new InMemoryCommandStoragePort();
    const first = existingTask({ id: uuid('a1'), title: 'Первая' });
    const second = existingTask({ id: uuid('a2'), title: 'Вторая' });
    storage.seedTask(first);
    storage.seedTask(second);

    const result = await completeManyCommand({ ids: [first.id, second.id] }, deps(storage));

    expect(result.status).toBe('ok');
    expect(result.completedIds).toHaveLength(2);
    expect(storage.allTasks().every((task) => task.status === 'completed')).toBe(true);
    // Одна транзакция на весь выбор — иначе «атомарно» (01§20) не выполнено.
    expect(storage.transactionCount).toBe(1);
    expect(storage.outboxEntries()).toHaveLength(2);
  });

  it('каскад: выбран родитель — его активные подзадачи завершаются вместе с ним', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('b1'), title: 'Родитель' });
    const child = existingTask({ id: uuid('b2'), title: 'Ребёнок', parentTaskId: parent.id });
    storage.seedTask(parent);
    storage.seedTask(child);

    const preview = await previewBulkCompletion([parent.id], deps(storage));
    expect(preview.additionalChildCount).toBe(1);
    expect(preview.needsConfirmation).toBe(true);

    const result = await completeManyCommand({ ids: [parent.id] }, deps(storage));

    expect(result.completedIds).toHaveLength(2);
    expect(result.additionalChildCount).toBe(1);
    expect(storage.allTasks().every((task) => task.status === 'completed')).toBe(true);
  });

  it('ребёнок, выбранный явно вместе с родителем, применяется ОДИН раз', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('c1'), title: 'Родитель' });
    const child = existingTask({ id: uuid('c2'), title: 'Ребёнок', parentTaskId: parent.id });
    storage.seedTask(parent);
    storage.seedTask(child);

    const preview = await previewBulkCompletion([parent.id, child.id], deps(storage));
    // Ребёнок выбран руками — «дополнительным» он не считается.
    expect(preview.additionalChildCount).toBe(0);

    const result = await completeManyCommand({ ids: [parent.id, child.id] }, deps(storage));

    expect(result.completedIds).toHaveLength(2);
    // Ровно одна outbox-запись на задачу: двойное применение было бы видно
    // именно здесь (01§20 «counted/applied once»).
    expect(storage.outboxEntries()).toHaveLength(2);
  });

  it('повторяющиеся occurrence не трогаются и возвращаются отдельным списком', async () => {
    const storage = new InMemoryCommandStoragePort();
    const plain = existingTask({ id: uuid('d1'), title: 'Обычная' });
    const recurring = existingTask({
      id: uuid('d2'),
      title: 'Из серии',
      seriesId: uuid('d9'),
      occurrenceSeq: 1n,
    });
    storage.seedTask(plain);
    storage.seedTask(recurring);

    const result = await completeManyCommand({ ids: [plain.id, recurring.id] }, deps(storage));

    expect(result.completedIds).toEqual([plain.id]);
    expect(result.skippedRecurringIds).toEqual([recurring.id]);
    const stored = storage.allTasks().find((task) => task.id === recurring.id);
    expect(stored?.status).toBe('active');
  });

  it('уже завершённые и удалённые в выборе просто пропускаются', async () => {
    const storage = new InMemoryCommandStoragePort();
    const done = existingTask({
      id: uuid('e1'),
      status: 'completed',
      completedAt: NOW,
      completionKind: 'done',
    });
    storage.seedTask(done);

    const result = await completeManyCommand({ ids: [done.id, uuid('e9')] }, deps(storage));

    expect(result.status).toBe('ok');
    expect(result.completedIds).toEqual([]);
    expect(storage.transactionCount).toBe(0);
  });
});
