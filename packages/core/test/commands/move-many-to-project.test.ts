import { describe, expect, it } from 'vitest';

import {
  moveManyToProjectCommand,
  previewBulkProjectMove,
} from '../../src/commands/move-many-to-project.js';
import { planBulkProjectMove } from '../../src/commands/bulk-project-move-plan.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import type { Uuid } from '../../src/values.js';
import { DEVICE_ID, NOW, existingTask, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(storage: InMemoryCommandStoragePort): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID };
}

const id = (name: string): Uuid => name as unknown as Uuid;

describe('planBulkProjectMove (01§12 «Parent/Subtask project moves»)', () => {
  const P = id('parent');
  const C = id('child');
  const T = id('top');

  it('выбран родитель — ребёнок едет каскадом и НЕ отцепляется, подтверждение не нужно', () => {
    const plan = planBulkProjectMove({
      selectedIds: [P],
      activeChildrenOf: new Map([[P, [C]]]),
      parentOf: new Map([[C, P]]),
      targetProjectId: id('project'),
    });

    expect(plan.steps.map((s) => s.id)).toEqual([P, C]);
    expect(plan.steps.every((s) => !s.detachFromParent)).toBe(true);
    expect(plan.cascadedChildCount).toBe(1);
    expect(plan.detachedChildCount).toBe(0);
    expect(plan.needsConfirmation).toBe(false);
  });

  it('выбрана ОДНА подзадача без родителя — она отцепляется, и это требует подтверждения', () => {
    const plan = planBulkProjectMove({
      selectedIds: [C],
      activeChildrenOf: new Map(),
      parentOf: new Map([[C, P]]),
      targetProjectId: id('project'),
    });

    expect(plan.steps).toEqual([{ id: C, detachFromParent: true, moveToInboxCapture: false }]);
    expect(plan.detachedChildCount).toBe(1);
    expect(plan.needsConfirmation).toBe(true);
  });

  it('родитель и ребёнок выбраны оба — каскад побеждает, ребёнок не отцепляется', () => {
    const plan = planBulkProjectMove({
      selectedIds: [P, C],
      activeChildrenOf: new Map([[P, [C]]]),
      parentOf: new Map([[C, P]]),
      targetProjectId: id('project'),
    });

    expect(plan.detachedChildCount).toBe(0);
    expect(plan.needsConfirmation).toBe(false);
    expect(plan.steps.filter((s) => s.id === C)).toHaveLength(1);
  });

  it('перенос во «Входящие»: верхний уровень получает capture_state=inbox, каскадная подзадача — нет', () => {
    const plan = planBulkProjectMove({
      selectedIds: [T, P],
      activeChildrenOf: new Map([[P, [C]]]),
      parentOf: new Map([[C, P]]),
      targetProjectId: null,
    });

    const byId = new Map(plan.steps.map((s) => [s.id, s]));
    expect(byId.get(T)?.moveToInboxCapture).toBe(true);
    expect(byId.get(P)?.moveToInboxCapture).toBe(true);
    // «attached Subtasks remain processed» — дословная оговорка 01§12.
    expect(byId.get(C)?.moveToInboxCapture).toBe(false);
  });
});

describe('moveManyToProjectCommand (M37 «Move project»)', () => {
  it('переносит родителя и его подзадачу ОДНОЙ транзакцией', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('e1'), title: 'Родитель' });
    const child = existingTask({ id: uuid('e2'), title: 'Ребёнок', parentTaskId: parent.id });
    storage.seedTask(parent);
    storage.seedTask(child);
    const target = uuid('e9');

    const preview = await previewBulkProjectMove([parent.id], target, deps(storage));
    expect(preview.needsConfirmation).toBe(false);

    const result = await moveManyToProjectCommand(
      { ids: [parent.id], targetProjectId: target, targetProjectName: 'Работа' },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    expect(result.movedIds).toHaveLength(2);
    expect(storage.allTasks().every((task) => task.projectId === target)).toBe(true);
    // «cascades direct Subtasks in one transaction» (01§12) — буквально одна.
    expect(storage.transactionCount).toBe(1);
    // Инвариант «Parent and direct Subtasks share Project» не нарушен —
    // связь сохранена, а не разорвана.
    expect(storage.allTasks().find((t) => t.id === child.id)?.parentTaskId).toBe(parent.id);
    expect(storage.allTasks().every((t) => t.originalProjectNameSnapshot === 'Работа')).toBe(true);
  });

  it('одинокая подзадача при переносе отцепляется и становится отдельной задачей', async () => {
    const storage = new InMemoryCommandStoragePort();
    const parent = existingTask({ id: uuid('f1'), title: 'Родитель' });
    const child = existingTask({ id: uuid('f2'), title: 'Ребёнок', parentTaskId: parent.id });
    storage.seedTask(parent);
    storage.seedTask(child);
    const target = uuid('f9');

    const preview = await previewBulkProjectMove([child.id], target, deps(storage));
    expect(preview.detachedChildCount).toBe(1);
    expect(preview.needsConfirmation).toBe(true);

    const result = await moveManyToProjectCommand(
      { ids: [child.id], targetProjectId: target, targetProjectName: 'Работа' },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    expect(result.detachedChildCount).toBe(1);
    const moved = storage.allTasks().find((t) => t.id === child.id);
    expect(moved?.parentTaskId).toBeNull();
    expect(moved?.projectId).toBe(target);
    // Родитель не тронут — переносили не его.
    expect(storage.allTasks().find((t) => t.id === parent.id)?.projectId).toBeNull();
  });

  it('перенос во «Входящие» сбрасывает проект и раздел и ставит capture_state=inbox', async () => {
    const storage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('ba1'), title: 'Задача', projectId: uuid('ba9') });
    storage.seedTask(task);

    const result = await moveManyToProjectCommand(
      { ids: [task.id], targetProjectId: null, targetProjectName: null },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    const moved = storage.allTasks()[0];
    expect(moved?.projectId).toBeNull();
    expect(moved?.sectionId).toBeNull();
    expect(moved?.captureState).toBe('inbox');
  });
});
