import { describe, expect, it } from 'vitest';

import { createChecklistItemCommand } from '../../src/commands/checklist-item-create.js';
import { deleteTaskCommand } from '../../src/commands/delete-task.js';
import { undoDeleteTasksCommand } from '../../src/commands/undo-delete-tasks.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import { DEVICE_ID, NOW, existingTask, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(
  storage: InMemoryCommandStoragePort,
  overrides: Partial<TaskCommandDeps> = {},
): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID, ...overrides };
}

/**
 * Undo удаления в 6-секундном окне (`01§9` "Delete", ST §58 U2).
 *
 * Удаление в R1 — tombstone (`deleted_at`), а не физическое стирание, и
 * пользовательской «Корзины» нет: единственный способ вернуть задачу —
 * этот Undo, пока живёт тост. Поэтому он обязан возвращать ВЕСЬ граф,
 * который снесло каскадом (подзадачи, checklist), одной операцией — иначе
 * пользователь получит «родитель вернулся, а половина содержимого нет».
 */
describe('undoDeleteTasksCommand — Undo удаления (ST §58 U2)', () => {
  it('обычная задача: delete → undo возвращает её в active-состояние', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('de0000000001'), title: 'Случайно удалённая' });
    storage.seedTask(task);

    const deleted = await deleteTaskCommand({ id: task.id }, deps(storage));
    expect(deleted.status).toBe('ok');
    expect((await storage.tasks.findById(task.id))?.deletedAt).not.toBeNull();

    const undone = await undoDeleteTasksCommand({ ids: [task.id] }, deps(storage));
    expect(undone.status).toBe('ok');

    const restored = await storage.tasks.findById(task.id);
    expect(restored?.deletedAt).toBeNull();
    expect(restored?.status).toBe('active');
    expect(restored?.title).toBe('Случайно удалённая');
  });

  it('каскад: delete родителя сносит подзадачи и checklist ОДНОЙ транзакцией', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('de0000000010'), title: 'Родитель' });
    const child = existingTask({
      id: uuid('de0000000011'),
      title: 'Подзадача',
      parentTaskId: parent.id,
    });
    storage.seedTask(parent);
    storage.seedTask(child);
    await createChecklistItemCommand(
      { taskId: parent.id, text: 'Пункт', rank: { placement: 'empty-list' } },
      deps(storage),
    );

    const before = storage.transactionCount;
    const deleted = await deleteTaskCommand({ id: parent.id }, deps(storage));
    expect(deleted.status).toBe('ok');
    // `01§9`: «Parent delete cascades direct subtasks/checklist/links» —
    // ОДНА операция. Пока каскад идёт несколькими транзакциями, между ними
    // существует состояние «родитель удалён, подзадача жива», которое ни
    // один экран не должен уметь увидеть.
    expect(storage.transactionCount - before).toBe(1);
  });

  it('каскад: один undo возвращает весь граф — родителя, подзадачу и checklist', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('de0000000020'), title: 'Родитель' });
    const child = existingTask({
      id: uuid('de0000000021'),
      title: 'Подзадача',
      parentTaskId: parent.id,
    });
    storage.seedTask(parent);
    storage.seedTask(child);
    const item = await createChecklistItemCommand(
      { taskId: parent.id, text: 'Пункт', rank: { placement: 'empty-list' } },
      deps(storage),
    );
    expect(item.status).toBe('ok');

    const deleted = await deleteTaskCommand({ id: parent.id }, deps(storage));
    if (deleted.status !== 'ok') throw new Error('удаление не прошло — предпосылка теста');

    const before = storage.transactionCount;
    const undone = await undoDeleteTasksCommand(
      {
        ids: [parent.id],
        subtaskIds: deleted.affectedSubtaskIds,
        checklistItems: deleted.affectedChecklistItems,
      },
      deps(storage),
    );
    expect(undone.status).toBe('ok');
    expect(storage.transactionCount - before).toBe(1);

    expect((await storage.tasks.findById(parent.id))?.deletedAt).toBeNull();
    expect((await storage.tasks.findById(child.id))?.deletedAt).toBeNull();
    const items = await storage.checklistItems.listByTask(parent.id);
    expect(items.filter((entry) => entry.deletedAt === null)).toHaveLength(1);
  });

  it('идемпотентность: повторный undo не пишет вторую мутацию', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('de0000000030'), title: 'Однократный откат' });
    storage.seedTask(task);
    await deleteTaskCommand({ id: task.id }, deps(storage));
    await undoDeleteTasksCommand({ ids: [task.id] }, deps(storage));

    const afterFirst = await storage.tasks.findById(task.id);
    const outboxAfterFirst = storage.outboxEntries().length;

    const second = await undoDeleteTasksCommand({ ids: [task.id] }, deps(storage));
    expect(second.status).toBe('not_deleted');
    expect((await storage.tasks.findById(task.id))?.revision).toBe(afterFirst!.revision);
    expect(storage.outboxEntries().length).toBe(outboxAfterFirst);
  });
});

/**
 * Срыв транзакции на многосущностной операции (ST §58: «Добавь rollback/
 * fault-injection там, где операция затрагивает несколько сущностей»).
 * Проверяется не сообщение об ошибке, а то, ЧТО ОСТАЛОСЬ в хранилище:
 * половина снесённого графа — состояние, которого не должно существовать,
 * и вернуть его одним Undo нечем.
 */
describe('каскад удаления — срыв транзакции не оставляет полуснесённый граф', () => {
  it('delete родителя падает целиком: ни родитель, ни подзадача, ни checklist не тронуты', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('de0000000040'), title: 'Родитель' });
    const child = existingTask({
      id: uuid('de0000000041'),
      title: 'Подзадача',
      parentTaskId: parent.id,
    });
    storage.seedTask(parent);
    storage.seedTask(child);
    await createChecklistItemCommand(
      { taskId: parent.id, text: 'Пункт', rank: { placement: 'empty-list' } },
      deps(storage),
    );
    const outboxBefore = storage.outboxEntries().length;

    storage.failNextMutation();
    await expect(deleteTaskCommand({ id: parent.id }, deps(storage))).rejects.toThrow();

    expect((await storage.tasks.findById(parent.id))?.deletedAt).toBeNull();
    expect((await storage.tasks.findById(child.id))?.deletedAt).toBeNull();
    expect(await storage.checklistItems.listByTask(parent.id)).toHaveLength(1);
    expect(storage.outboxEntries().length).toBe(outboxBefore);
  });

  it('второй мутации не существует: сбой, взведённый на неё, не срабатывает вовсе', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('de0000000060'), title: 'Родитель' });
    const child = existingTask({
      id: uuid('de0000000061'),
      title: 'Подзадача',
      parentTaskId: parent.id,
    });
    storage.seedTask(parent);
    storage.seedTask(child);
    await createChecklistItemCommand(
      { taskId: parent.id, text: 'Пункт', rank: { placement: 'empty-list' } },
      deps(storage),
    );

    // Сбой на ВТОРОЙ мутации каскада. У атомарной реализации второй мутации
    // нет: удаление проходит целиком, а сбой остаётся взведённым. У прежней
    // цепочки транзакций он выстрелил бы и оставил полуснесённый граф —
    // именно это и отличает одну проверку от другой (проверка на срыв
    // ПЕРВОЙ мутации проходит у обеих реализаций, потому что каскад пишет
    // детей раньше корня; найдено ревью пакета работ Undo/Restore R1).
    storage.failMutationAfter(1);
    const deleted = await deleteTaskCommand({ id: parent.id }, deps(storage));
    expect(deleted.status).toBe('ok');
    expect(storage.isFailureArmed()).toBe(true);
    storage.disarmFailure();

    expect((await storage.tasks.findById(parent.id))?.deletedAt).not.toBeNull();
    expect((await storage.tasks.findById(child.id))?.deletedAt).not.toBeNull();
  });

  it('undo падает целиком: граф остаётся удалённым, повторный undo снова возможен', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('de0000000050'), title: 'Родитель' });
    const child = existingTask({
      id: uuid('de0000000051'),
      title: 'Подзадача',
      parentTaskId: parent.id,
    });
    storage.seedTask(parent);
    storage.seedTask(child);
    const deleted = await deleteTaskCommand({ id: parent.id }, deps(storage));
    if (deleted.status !== 'ok') throw new Error('удаление не прошло — предпосылка теста');

    storage.failNextMutation();
    await expect(
      undoDeleteTasksCommand(
        { ids: [parent.id], subtaskIds: deleted.affectedSubtaskIds },
        deps(storage),
      ),
    ).rejects.toThrow();
    expect((await storage.tasks.findById(parent.id))?.deletedAt).not.toBeNull();
    expect((await storage.tasks.findById(child.id))?.deletedAt).not.toBeNull();

    // Сорванный откат не «израсходовал» право на откат: повтор проходит.
    const retry = await undoDeleteTasksCommand(
      { ids: [parent.id], subtaskIds: deleted.affectedSubtaskIds },
      deps(storage),
    );
    expect(retry.status).toBe('ok');
    expect((await storage.tasks.findById(parent.id))?.deletedAt).toBeNull();
    expect((await storage.tasks.findById(child.id))?.deletedAt).toBeNull();
  });
});
