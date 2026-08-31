import { describe, expect, it } from 'vitest';

import {
  convertChecklistItemToSubtaskCommand,
  convertSubtaskToChecklistItemCommand,
} from '../../src/commands/checklist-subtask-convert.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import type { ChecklistItem } from '../../src/entities/checklist-item.js';
import { initialRank } from '../../src/order/index.js';
import { OWNER_SCOPE, DEVICE_ID, NOW, existingTask, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(storage: InMemoryCommandStoragePort): TaskCommandDeps {
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

describe('convertChecklistItemToSubtaskCommand — §10: "preserves text/completed state"', () => {
  it('незавершённый пункт становится активным subtask с тем же текстом', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('1'), projectId: uuid('200'), sectionId: null });
    storage.seedTask(parent);
    storage.seedChecklistItem(existingItem({ done: false }));

    const result = await convertChecklistItemToSubtaskCommand(
      {
        checklistItemId: uuid('50'),
        parentTaskId: uuid('1'),
        ownerScope: OWNER_SCOPE,
        rank: { placement: 'empty-list' },
      },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.title).toBe('Купить молоко');
    expect(result.task.parentTaskId).toBe(uuid('1'));
    expect(result.task.projectId).toBe(uuid('200'));
    expect(result.task.status).toBe('active');
    expect(result.task.captureState).toBe('processed');
  });

  it('завершённый пункт (done:true) становится завершённым subtask', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));
    storage.seedChecklistItem(existingItem({ done: true }));

    const result = await convertChecklistItemToSubtaskCommand(
      {
        checklistItemId: uuid('50'),
        parentTaskId: uuid('1'),
        ownerScope: OWNER_SCOPE,
        rank: { placement: 'empty-list' },
      },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.task.status).toBe('completed');
    expect(result.task.completionKind).toBe('done');
  });

  it('исходный checklist item мягко удалён после конверсии', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));
    storage.seedChecklistItem(existingItem());

    const result = await convertChecklistItemToSubtaskCommand(
      {
        checklistItemId: uuid('50'),
        parentTaskId: uuid('1'),
        ownerScope: OWNER_SCOPE,
        rank: { placement: 'empty-list' },
      },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.deletedChecklistItemId).toBe(uuid('50'));
    expect(storage.findChecklistItem(uuid('50'))?.deletedAt).not.toBeNull();
  });

  it('101-й subtask (лимит 16) — rejected, исходный пункт НЕ удаляется (неразрушительно при отказе)', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('1') });
    storage.seedTask(parent);
    for (let i = 0; i < 100; i++) {
      storage.seedTask(
        existingTask({
          id: uuid(`${300 + i}`),
          parentTaskId: uuid('1'),
          captureState: 'processed',
        }),
      );
    }
    storage.seedChecklistItem(existingItem());

    const result = await convertChecklistItemToSubtaskCommand(
      {
        checklistItemId: uuid('50'),
        parentTaskId: uuid('1'),
        ownerScope: OWNER_SCOPE,
        rank: { placement: 'empty-list' },
      },
      deps(storage),
    );

    expect(result.status).toBe('rejected');
    expect(storage.findChecklistItem(uuid('50'))?.deletedAt).toBeNull();
  });

  it('несуществующий checklistItemId — not_found', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));

    const result = await convertChecklistItemToSubtaskCommand(
      {
        checklistItemId: uuid('404'),
        parentTaskId: uuid('1'),
        ownerScope: OWNER_SCOPE,
        rank: { placement: 'empty-list' },
      },
      deps(storage),
    );

    expect(result.status).toBe('not_found');
  });

  it('несуществующий parentTaskId — not_found', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await convertChecklistItemToSubtaskCommand(
      {
        checklistItemId: uuid('50'),
        parentTaskId: uuid('404'),
        ownerScope: OWNER_SCOPE,
        rank: { placement: 'empty-list' },
      },
      deps(storage),
    );

    expect(result.status).toBe('not_found');
  });
});

describe('convertSubtaskToChecklistItemCommand — §10: "warns about metadata loss" (предупреждение — забота UI выше по стеку)', () => {
  it('активный subtask становится незавершённым пунктом с тем же текстом', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('1') });
    const child = existingTask({ id: uuid('2'), parentTaskId: uuid('1'), title: 'Купить хлеб' });
    storage.seedTask(parent);
    storage.seedTask(child);

    const result = await convertSubtaskToChecklistItemCommand(
      { taskId: uuid('2'), targetTaskId: uuid('1'), rank: { placement: 'empty-list' } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.checklistItem.text).toBe('Купить хлеб');
    expect(result.checklistItem.done).toBe(false);
    expect(result.checklistItem.taskId).toBe(uuid('1'));
  });

  it('завершённый subtask становится пунктом с done:true', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));
    storage.seedTask(
      existingTask({
        id: uuid('2'),
        parentTaskId: uuid('1'),
        status: 'completed',
        completedAt: NOW.subtract({ hours: 1 }),
        completionKind: 'done',
      }),
    );

    const result = await convertSubtaskToChecklistItemCommand(
      { taskId: uuid('2'), targetTaskId: uuid('1'), rank: { placement: 'empty-list' } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.checklistItem.done).toBe(true);
  });

  it('исходный subtask мягко удалён после конверсии', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));
    storage.seedTask(existingTask({ id: uuid('2'), parentTaskId: uuid('1') }));

    const result = await convertSubtaskToChecklistItemCommand(
      { taskId: uuid('2'), targetTaskId: uuid('1'), rank: { placement: 'empty-list' } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.deletedTaskId).toBe(uuid('2'));
    expect(storage.allTasks().find((t) => t.id === uuid('2'))?.deletedAt).not.toBeNull();
  });

  it('несуществующий taskId — not_found', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));

    const result = await convertSubtaskToChecklistItemCommand(
      { taskId: uuid('404'), targetTaskId: uuid('1'), rank: { placement: 'empty-list' } },
      deps(storage),
    );

    expect(result.status).toBe('not_found');
  });
});
