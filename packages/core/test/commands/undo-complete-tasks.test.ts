import { describe, expect, it } from 'vitest';

import { completeManyCommand } from '../../src/commands/complete-many.js';
import { completeTaskCommand } from '../../src/commands/complete-task.js';
import { undoCompleteTasksCommand } from '../../src/commands/undo-complete-tasks.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import { DEVICE_ID, NOW, d, existingTask, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(
  storage: InMemoryCommandStoragePort,
  overrides: Partial<TaskCommandDeps> = {},
): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID, ...overrides };
}

/**
 * Undo завершения в 6-секундном окне (`01§8` "Undo", ST §58 U1) — НЕ
 * `restoreTaskCommand` (та про экран «Завершённые», произвольную давность и
 * ветвления §11.10/§11.11 с выбором пользователя) и не
 * `undoCompleteOccurrenceCommand` (та про повторы и сгенерированный next).
 * Здесь: только что завершённый набор задач возвращается в точное прежнее
 * доменное состояние ОДНОЙ транзакцией, без вопросов пользователю.
 */
describe('undoCompleteTasksCommand — Undo завершения (ST §58 U1)', () => {
  it('обычная задача: complete → undo возвращает точное прежнее состояние', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('ad000000001'), title: 'Полить цветы' });
    storage.seedTask(task);

    const completed = await completeTaskCommand({ id: task.id }, deps(storage));
    expect(completed.status).toBe('ok');
    const afterComplete = await storage.tasks.findById(task.id);
    expect(afterComplete?.status).toBe('completed');

    const undone = await undoCompleteTasksCommand({ ids: [task.id] }, deps(storage));
    expect(undone.status).toBe('ok');

    const restored = await storage.tasks.findById(task.id);
    expect(restored?.status).toBe('active');
    expect(restored?.completedAt).toBeNull();
    expect(restored?.completionKind).toBeNull();
    // Ревизия растёт вперёд (откат — новая мутация, не «отмотка» истории):
    // sync-safe по построению, а не за счёт переписывания прошлого.
    expect(restored?.revision).toBe(afterComplete!.revision + 1n);
  });

  it('focus/day_bucket переживают complete → undo без изменений', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({
      id: uuid('ad000000002'),
      title: 'Сфокусированная задача',
      focusDate: d('2026-08-31'),
      dayBucket: 'later',
      plannedDate: d('2026-08-31'),
    });
    storage.seedTask(task);

    await completeTaskCommand({ id: task.id }, deps(storage));
    const undone = await undoCompleteTasksCommand({ ids: [task.id] }, deps(storage));
    expect(undone.status).toBe('ok');

    const restored = await storage.tasks.findById(task.id);
    expect(restored?.status).toBe('active');
    expect(restored?.focusDate?.toString()).toBe('2026-08-31');
    expect(restored?.dayBucket).toBe('later');
    expect(restored?.plannedDate?.toString()).toBe('2026-08-31');
  });

  it('«Завершить всё»: undo возвращает весь граф ОДНОЙ транзакцией', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('ad000000010'), title: 'Родитель' });
    const childA = existingTask({
      id: uuid('ad000000011'),
      title: 'Подзадача А',
      parentTaskId: parent.id,
    });
    const childB = existingTask({
      id: uuid('ad000000012'),
      title: 'Подзадача Б',
      parentTaskId: parent.id,
    });
    storage.seedTask(parent);
    storage.seedTask(childA);
    storage.seedTask(childB);

    const completed = await completeManyCommand(
      { ids: [parent.id, childA.id, childB.id] },
      deps(storage),
    );
    expect(completed.status).toBe('ok');
    for (const id of [parent.id, childA.id, childB.id]) {
      expect((await storage.tasks.findById(id))?.status).toBe('completed');
    }

    const before = storage.transactionCount;
    const undone = await undoCompleteTasksCommand(
      { ids: [parent.id, childA.id, childB.id] },
      deps(storage),
    );
    expect(undone.status).toBe('ok');
    // Одна транзакция на весь граф — «atomically» из ST §58 U1 проверяется
    // счётчиком, а не на глаз.
    expect(storage.transactionCount - before).toBe(1);

    for (const id of [parent.id, childA.id, childB.id]) {
      const restored = await storage.tasks.findById(id);
      expect(restored?.status).toBe('active');
      expect(restored?.completedAt).toBeNull();
    }
  });

  it('промежуточное состояние «completed parent + active child» не создаётся: подзадачи и родитель возвращаются вместе', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('ad000000020'), title: 'Родитель' });
    const child = existingTask({
      id: uuid('ad000000021'),
      title: 'Подзадача',
      parentTaskId: parent.id,
    });
    storage.seedTask(parent);
    storage.seedTask(child);
    await completeManyCommand({ ids: [parent.id, child.id] }, deps(storage));

    // Откат ТОЛЬКО подзадачи оставил бы активного ребёнка под завершённым
    // родителем — запрещённое состояние (`01§8`). Команда обязана его не
    // допустить, а не молча создать.
    const partial = await undoCompleteTasksCommand({ ids: [child.id] }, deps(storage));
    expect(partial.status).toBe('parent_still_completed');
    expect((await storage.tasks.findById(child.id))?.status).toBe('completed');
    expect((await storage.tasks.findById(parent.id))?.status).toBe('completed');
  });

  it('идемпотентность: повторный undo того же набора не меняет состояние и не пишет вторую мутацию', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('ad000000030'), title: 'Однократный откат' });
    storage.seedTask(task);
    await completeTaskCommand({ id: task.id }, deps(storage));
    await undoCompleteTasksCommand({ ids: [task.id] }, deps(storage));

    const afterFirst = await storage.tasks.findById(task.id);
    const outboxAfterFirst = storage.outboxEntries().length;

    const second = await undoCompleteTasksCommand({ ids: [task.id] }, deps(storage));
    expect(second.status).toBe('not_completed');
    const afterSecond = await storage.tasks.findById(task.id);
    expect(afterSecond?.revision).toBe(afterFirst!.revision);
    expect(storage.outboxEntries().length).toBe(outboxAfterFirst);
  });
});
