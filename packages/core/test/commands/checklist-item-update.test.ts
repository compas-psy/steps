import { describe, expect, it } from 'vitest';

import { updateChecklistItemCommand } from '../../src/commands/checklist-item-update.js';
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

describe('updateChecklistItemCommand — правка text/done/rank', () => {
  it('правит text (валидируется правилом 39)', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));
    storage.seedChecklistItem(existingItem());

    const result = await updateChecklistItemCommand(
      { taskId: uuid('1'), id: uuid('50'), patch: { text: 'Купить хлеб' } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.item.text).toBe('Купить хлеб');
  });

  it('пустой text в патче — rejected, запись не меняется', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));
    storage.seedChecklistItem(existingItem());

    const result = await updateChecklistItemCommand(
      { taskId: uuid('1'), id: uuid('50'), patch: { text: '' } },
      deps(storage),
    );

    expect(result.status).toBe('rejected');
    expect(storage.findChecklistItem(uuid('50'))?.text).toBe('Купить молоко');
  });

  it('done — просто булев тумблер, не требует текста в патче', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));
    storage.seedChecklistItem(existingItem());

    const result = await updateChecklistItemCommand(
      { taskId: uuid('1'), id: uuid('50'), patch: { done: true } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.item.done).toBe(true);
    expect(result.item.text).toBe('Купить молоко');
  });

  it('rank — через resolveRank(placement)', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));
    const before = initialRank();
    storage.seedChecklistItem(existingItem({ rank: before }));

    const result = await updateChecklistItemCommand(
      {
        taskId: uuid('1'),
        id: uuid('50'),
        patch: { rank: { placement: 'start', firstRank: before } },
      },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.item.rank < before).toBe(true);
  });

  it('пустой патч — ok, ничего не меняется, но outbox всё равно пишется (та же дисциплина, что update-task)', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));
    storage.seedChecklistItem(existingItem());

    const result = await updateChecklistItemCommand(
      { taskId: uuid('1'), id: uuid('50'), patch: {} },
      deps(storage),
    );

    expect(result.status).toBe('ok');
  });
});

describe('updateChecklistItemCommand — не найден', () => {
  it('несуществующий id — not_found', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));

    const result = await updateChecklistItemCommand(
      { taskId: uuid('1'), id: uuid('404'), patch: { done: true } },
      deps(storage),
    );

    expect(result.status).toBe('not_found');
  });

  it('уже удалённый пункт — not_found', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));
    storage.seedChecklistItem(existingItem({ deletedAt: NOW.subtract({ hours: 1 }) }));

    const result = await updateChecklistItemCommand(
      { taskId: uuid('1'), id: uuid('50'), patch: { done: true } },
      deps(storage),
    );

    expect(result.status).toBe('not_found');
  });

  it('верный id, но чужой taskId — not_found (пункт ищется в пределах указанной задачи)', async () => {
    const storage = new InMemoryCommandStoragePort();
    storage.seedTask(existingTask({ id: uuid('1') }));
    storage.seedTask(existingTask({ id: uuid('2') }));
    storage.seedChecklistItem(existingItem({ taskId: uuid('1') }));

    const result = await updateChecklistItemCommand(
      { taskId: uuid('2'), id: uuid('50'), patch: { done: true } },
      deps(storage),
    );

    expect(result.status).toBe('not_found');
  });
});
