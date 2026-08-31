import { describe, expect, it } from 'vitest';

import { deleteChecklistItemCommand } from '../../src/commands/checklist-item-delete.js';
import type { ChecklistItemCommandDeps } from '../../src/commands/checklist-item-port.js';
import type { ChecklistItem } from '../../src/entities/checklist-item.js';
import { initialRank } from '../../src/order/index.js';
import { DEVICE_ID, NOW, existingTask, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(storage: InMemoryCommandStoragePort): ChecklistItemCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID };
}

function existingItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  const base: ChecklistItem = {
    id: uuid('50'),
    taskId: uuid('1'),
    text: 'Купить молоко',
    done: false,
    rank: initialRank(),
    deletedAt: null,
    clocks: {},
  };
  return { ...base, ...overrides };
}

describe('deleteChecklistItemCommand — мягкое удаление', () => {
  it('устанавливает deletedAt, не стирает запись физически', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));
    storage.seedChecklistItem(existingItem());

    const result = await deleteChecklistItemCommand(
      { taskId: uuid('1'), id: uuid('50') },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.item.deletedAt?.equals(NOW)).toBe(true);
    expect(storage.findChecklistItem(uuid('50'))?.deletedAt?.equals(NOW)).toBe(true);
    expect(storage.findChecklistItem(uuid('50'))?.text).toBe('Купить молоко');
  });

  it('пишет outbox-запись', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));
    storage.seedChecklistItem(existingItem());

    await deleteChecklistItemCommand({ taskId: uuid('1'), id: uuid('50') }, deps(storage));

    expect(storage.outboxEntries()).toHaveLength(1);
    expect(storage.outboxEntries()[0]?.patchJson).toHaveProperty('deletedAt');
  });

  it('после удаления живой список задачи (listByTask) больше не видит пункт — освобождает лимит 17', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('1') });
    storage.seedTask(task);
    storage.seedChecklistItem(existingItem());

    await deleteChecklistItemCommand({ taskId: uuid('1'), id: uuid('50') }, deps(storage));

    const context = await storage.tasks.loadValidationContext(task.id, task.parentTaskId);
    expect(context.checklistItemCount).toBe(0);
  });
});

describe('deleteChecklistItemCommand — не найден / уже удалён', () => {
  it('несуществующий id — not_found', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));

    const result = await deleteChecklistItemCommand(
      { taskId: uuid('1'), id: uuid('404') },
      deps(storage),
    );

    expect(result.status).toBe('not_found');
  });

  it('повторное удаление уже удалённого пункта — not_found, без повторной outbox-записи', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));
    storage.seedChecklistItem(existingItem({ deletedAt: NOW.subtract({ hours: 1 }) }));

    const result = await deleteChecklistItemCommand(
      { taskId: uuid('1'), id: uuid('50') },
      deps(storage),
    );

    expect(result.status).toBe('not_found');
    expect(storage.outboxEntries()).toHaveLength(0);
  });
});
