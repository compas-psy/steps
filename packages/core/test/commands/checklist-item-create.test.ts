import { describe, expect, it } from 'vitest';

import { createChecklistItemCommand } from '../../src/commands/checklist-item-create.js';
import type { ChecklistItemCommandDeps } from '../../src/commands/checklist-item-port.js';
import type { ChecklistItem } from '../../src/entities/checklist-item.js';
import { initialRank } from '../../src/order/index.js';
import { asUuid } from '../../src/values.js';
import { DEVICE_ID, NOW, existingTask, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(storage: InMemoryCommandStoragePort): ChecklistItemCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID };
}

function seedChecklistItems(
  storage: InMemoryCommandStoragePort,
  taskId: ReturnType<typeof uuid>,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const item: ChecklistItem = {
      id: asUuid(`00000000-0000-0000-0000-1${String(i).padStart(11, '0')}`),
      taskId,
      text: `Пункт ${i}`,
      done: false,
      rank: initialRank(),
      deletedAt: null,
      clocks: {},
    };
    storage.seedChecklistItem(item);
  }
}

describe('createChecklistItemCommand — успешный путь', () => {
  it('создаёт пункт чек-листа, пишет outbox-запись', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('1') });
    storage.seedTask(task);

    const result = await createChecklistItemCommand(
      { taskId: task.id, text: 'Купить молоко', rank: { placement: 'empty-list' } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.item.text).toBe('Купить молоко');
    expect(result.item.taskId).toBe(task.id);
    expect(result.item.done).toBe(false);
    expect(result.item.deletedAt).toBeNull();
    expect(storage.outboxEntries()).toHaveLength(1);
    expect(storage.outboxEntries()[0]?.entityType).toBe('checklist_item');
    expect(storage.outboxEntries()[0]?.entityId).toBe(result.item.id);
  });
});

describe('createChecklistItemCommand — валидация текста (правило 39)', () => {
  it('пустой текст — rejected, ничего не пишет', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('1') });
    storage.seedTask(task);

    const result = await createChecklistItemCommand(
      { taskId: task.id, text: '', rank: { placement: 'empty-list' } },
      deps(storage),
    );

    expect(result.status).toBe('rejected');
    expect(storage.outboxEntries()).toHaveLength(0);
    expect(storage.allChecklistItems()).toHaveLength(0);
  });
});

describe('createChecklistItemCommand — задача не найдена', () => {
  it('несуществующий taskId — not_found', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createChecklistItemCommand(
      { taskId: uuid('404'), text: 'Купить молоко', rank: { placement: 'empty-list' } },
      deps(storage),
    );

    expect(result.status).toBe('not_found');
  });

  it('tombstone-задача — not_found', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1'), deletedAt: NOW.subtract({ hours: 1 }) }));

    const result = await createChecklistItemCommand(
      { taskId: uuid('1'), text: 'Купить молоко', rank: { placement: 'empty-list' } },
      deps(storage),
    );

    expect(result.status).toBe('not_found');
  });
});

describe('createChecklistItemCommand — правило 17: лимит 200 пунктов на задачу', () => {
  it('200-й пункт — ok (граница включительно)', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('1') });
    storage.seedTask(task);
    seedChecklistItems(storage, task.id, 199);

    const result = await createChecklistItemCommand(
      { taskId: task.id, text: 'Двухсотый', rank: { placement: 'empty-list' } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
  });

  it('201-й пункт — rejected TASK_CHECKLIST_LIMIT_EXCEEDED, ничего не пишет', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('1') });
    storage.seedTask(task);
    seedChecklistItems(storage, task.id, 200);

    const result = await createChecklistItemCommand(
      { taskId: task.id, text: 'Двести первый', rank: { placement: 'empty-list' } },
      deps(storage),
    );

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.validation.issues.some((i) => i.code === 'TASK_CHECKLIST_LIMIT_EXCEEDED')).toBe(
      true,
    );
    expect(storage.allChecklistItems()).toHaveLength(200);
  });
});
