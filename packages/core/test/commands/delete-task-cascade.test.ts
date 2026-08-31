import { describe, expect, it } from 'vitest';

import { deleteTaskCommand } from '../../src/commands/delete-task.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import type { ChecklistItem } from '../../src/entities/checklist-item.js';
import { initialRank } from '../../src/order/index.js';
import { DEVICE_ID, NOW, existingTask, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(storage: InMemoryCommandStoragePort): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID };
}

function existingItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  const base: ChecklistItem = {
    id: uuid('50'),
    taskId: uuid('1'),
    text: 'Пункт',
    done: false,
    rank: initialRank(),
    deletedAt: null,
    clocks: {},
  };
  return { ...base, ...overrides };
}

describe('deleteTaskCommand — каскад (01§9: "Parent delete cascades direct subtasks/checklist/links")', () => {
  it('удаление задачи с живыми прямыми subtasks — subtasks тоже tombstone', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('1'), parentTaskId: null });
    const child = existingTask({
      id: uuid('2'),
      parentTaskId: uuid('1'),
      captureState: 'processed',
    });
    storage.seedTask(parent);
    storage.seedTask(child);

    const result = await deleteTaskCommand({ id: parent.id }, deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedSubtaskIds).toEqual([child.id]);
    expect(storage.allTasks().find((t) => t.id === child.id)?.deletedAt).not.toBeNull();
    expect(storage.allTasks().find((t) => t.id === parent.id)?.deletedAt).not.toBeNull();
  });

  it('оба статуса subtask (active + completed) каскадируются', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('1') });
    const activeChild = existingTask({ id: uuid('2'), parentTaskId: uuid('1'), status: 'active' });
    const completedChild = existingTask({
      id: uuid('3'),
      parentTaskId: uuid('1'),
      status: 'completed',
      completedAt: NOW.subtract({ hours: 1 }),
      completionKind: 'done',
    });
    storage.seedTask(parent);
    storage.seedTask(activeChild);
    storage.seedTask(completedChild);

    const result = await deleteTaskCommand({ id: parent.id }, deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedSubtaskIds.toSorted()).toEqual([uuid('2'), uuid('3')].toSorted());
  });

  it('уже удалённый subtask не трогается повторно (не попадает в affectedSubtaskIds)', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('1') });
    const deadChild = existingTask({
      id: uuid('2'),
      parentTaskId: uuid('1'),
      deletedAt: NOW.subtract({ hours: 1 }),
    });
    storage.seedTask(parent);
    storage.seedTask(deadChild);

    const result = await deleteTaskCommand({ id: parent.id }, deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedSubtaskIds).toHaveLength(0);
  });

  it('удаление задачи с живыми checklist items — пункты тоже tombstone', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('1') });
    storage.seedTask(task);
    storage.seedChecklistItem(existingItem({ id: uuid('50'), taskId: uuid('1') }));
    storage.seedChecklistItem(existingItem({ id: uuid('51'), taskId: uuid('1') }));

    const result = await deleteTaskCommand({ id: task.id }, deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedChecklistItemIds.toSorted()).toEqual([uuid('50'), uuid('51')].toSorted());
    expect(storage.findChecklistItem(uuid('50'))?.deletedAt).not.toBeNull();
    expect(storage.findChecklistItem(uuid('51'))?.deletedAt).not.toBeNull();
  });

  it('уже удалённый checklist item не трогается повторно', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('1') });
    storage.seedTask(task);
    storage.seedChecklistItem(
      existingItem({ id: uuid('50'), taskId: uuid('1'), deletedAt: NOW.subtract({ hours: 1 }) }),
    );

    const result = await deleteTaskCommand({ id: task.id }, deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedChecklistItemIds).toHaveLength(0);
  });

  it('checklist items прямого subtask тоже каскадируются (рекурсия через deleteTaskCommand)', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('1') });
    const child = existingTask({ id: uuid('2'), parentTaskId: uuid('1') });
    storage.seedTask(parent);
    storage.seedTask(child);
    storage.seedChecklistItem(existingItem({ id: uuid('60'), taskId: uuid('2') }));

    const result = await deleteTaskCommand({ id: parent.id }, deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(storage.findChecklistItem(uuid('60'))?.deletedAt).not.toBeNull();
  });

  it('задача без subtasks/checklist — affectedSubtaskIds и affectedChecklistItemIds пусты, поведение не меняется', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('1') });
    storage.seedTask(task);

    const result = await deleteTaskCommand({ id: task.id }, deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedSubtaskIds).toHaveLength(0);
    expect(result.affectedChecklistItemIds).toHaveLength(0);
    expect(storage.outboxEntries()).toHaveLength(1);
  });
});
