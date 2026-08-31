import { describe, expect, it } from 'vitest';

import {
  attachLabelToTaskCommand,
  type AttachLabelDeps,
} from '../../src/commands/task-label-attach.js';
import {
  detachLabelFromTaskCommand,
  type DetachLabelDeps,
} from '../../src/commands/task-label-detach.js';
import type {
  CommandTaskLabelDomainMutation,
  CommandTaskLabelStoragePort,
} from '../../src/commands/task-label-port.js';
import type { TaskLabel } from '../../src/entities/task-label.js';
import { isTaskLabelActive } from '../../src/entities/task-label.js';
import { DEVICE_ID, NOW, existingTask, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

/** Тестовый мир по образцу `DeleteSectionTestWorld`: `CommandTaskLabelStoragePort`
 * читает/пишет в состояние ТОГО ЖЕ `InMemoryCommandStoragePort` (через
 * `listTaskLabelsByTask`/`writeTaskLabel`), чтобы `taskStorage.tasks.
 * loadValidationContext(...).labelCount` (правило 18) видело реально
 * записанные этой же командой связи — та же связность, что в продакшене
 * даёт один общий `StoragePort`. */
function taskLabelStorageOver(
  taskStorage: InMemoryCommandStoragePort,
): CommandTaskLabelStoragePort {
  return {
    taskLabels: {
      listByTask: (taskId) => Promise.resolve(taskStorage.listTaskLabelsByTask(taskId)),
      listByLabel: (labelId) => Promise.resolve(taskStorage.listTaskLabelsByLabel(labelId)),
    },
    runTransaction: async <T>(
      run: (tx: {
        applyMutation: (m: CommandTaskLabelDomainMutation) => Promise<void>;
      }) => Promise<T>,
    ) => {
      const tx = {
        applyMutation: (mutation: CommandTaskLabelDomainMutation): Promise<void> => {
          for (const write of mutation.writes) taskStorage.writeTaskLabel(write.value);
          return Promise.resolve();
        },
      };
      return run(tx);
    },
  };
}

describe('attachLabelToTaskCommand — успешный путь', () => {
  it('создаёт новую связь (addHlc установлен, removeHlc=null)', async () => {
    const taskStorage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('1') });
    taskStorage.seedTask(task);
    const deps: AttachLabelDeps = {
      storage: taskLabelStorageOver(taskStorage),
      taskStorage,
      now: NOW,
      deviceId: DEVICE_ID,
    };

    const result = await attachLabelToTaskCommand(
      { taskId: uuid('1'), labelId: uuid('900') },
      deps,
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(isTaskLabelActive(result.taskLabel)).toBe(true);
    expect(taskStorage.findTaskLabel(uuid('1'), uuid('900'))).not.toBeNull();
  });

  it('повторный attach после detach — upsert той же строки, не новая запись (OR-set)', async () => {
    const taskStorage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('1') });
    taskStorage.seedTask(task);
    const removedLink: TaskLabel = {
      taskId: uuid('1'),
      labelId: uuid('900'),
      addHlc: { physical: NOW.subtract({ hours: 2 }), logical: 0, deviceId: DEVICE_ID },
      removeHlc: { physical: NOW.subtract({ hours: 1 }), logical: 0, deviceId: DEVICE_ID },
    };
    taskStorage.seedTaskLabel(removedLink);
    const deps: AttachLabelDeps = {
      storage: taskLabelStorageOver(taskStorage),
      taskStorage,
      now: NOW,
      deviceId: DEVICE_ID,
    };

    const result = await attachLabelToTaskCommand(
      { taskId: uuid('1'), labelId: uuid('900') },
      deps,
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(isTaskLabelActive(result.taskLabel)).toBe(true);
    expect(taskStorage.listTaskLabelsByTask(uuid('1'))).toHaveLength(1);
  });

  it('уже активная связь — идемпотентный ok, состояние не меняется', async () => {
    const taskStorage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('1') });
    taskStorage.seedTask(task);
    const activeLink: TaskLabel = {
      taskId: uuid('1'),
      labelId: uuid('900'),
      addHlc: { physical: NOW.subtract({ hours: 2 }), logical: 0, deviceId: DEVICE_ID },
      removeHlc: null,
    };
    taskStorage.seedTaskLabel(activeLink);
    const deps: AttachLabelDeps = {
      storage: taskLabelStorageOver(taskStorage),
      taskStorage,
      now: NOW,
      deviceId: DEVICE_ID,
    };

    const result = await attachLabelToTaskCommand(
      { taskId: uuid('1'), labelId: uuid('900') },
      deps,
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.taskLabel.addHlc).toEqual(activeLink.addHlc);
  });
});

describe('attachLabelToTaskCommand — правило 18: лимит 50 меток на задачу', () => {
  it('50-я метка — ok', async () => {
    const taskStorage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('1') });
    taskStorage.seedTask(task);
    for (let i = 0; i < 49; i++) {
      taskStorage.seedTaskLabel({
        taskId: uuid('1'),
        labelId: uuid(`${800 + i}`),
        addHlc: { physical: NOW.subtract({ hours: 1 }), logical: 0, deviceId: DEVICE_ID },
        removeHlc: null,
      });
    }
    const deps: AttachLabelDeps = {
      storage: taskLabelStorageOver(taskStorage),
      taskStorage,
      now: NOW,
      deviceId: DEVICE_ID,
    };

    const result = await attachLabelToTaskCommand(
      { taskId: uuid('1'), labelId: uuid('900') },
      deps,
    );

    expect(result.status).toBe('ok');
  });

  it('51-я метка — rejected TASK_LABEL_LIMIT_EXCEEDED, связь не создаётся', async () => {
    const taskStorage = new InMemoryCommandStoragePort();
    const task = existingTask({ id: uuid('1') });
    taskStorage.seedTask(task);
    for (let i = 0; i < 50; i++) {
      taskStorage.seedTaskLabel({
        taskId: uuid('1'),
        labelId: uuid(`${800 + i}`),
        addHlc: { physical: NOW.subtract({ hours: 1 }), logical: 0, deviceId: DEVICE_ID },
        removeHlc: null,
      });
    }
    const deps: AttachLabelDeps = {
      storage: taskLabelStorageOver(taskStorage),
      taskStorage,
      now: NOW,
      deviceId: DEVICE_ID,
    };

    const result = await attachLabelToTaskCommand(
      { taskId: uuid('1'), labelId: uuid('900') },
      deps,
    );

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.validation.issues.some((i) => i.code === 'TASK_LABEL_LIMIT_EXCEEDED')).toBe(true);
    expect(taskStorage.findTaskLabel(uuid('1'), uuid('900'))).toBeNull();
  });
});

describe('attachLabelToTaskCommand — задача не найдена', () => {
  it('несуществующий taskId — not_found', async () => {
    const taskStorage = new InMemoryCommandStoragePort();
    const deps: AttachLabelDeps = {
      storage: taskLabelStorageOver(taskStorage),
      taskStorage,
      now: NOW,
      deviceId: DEVICE_ID,
    };

    const result = await attachLabelToTaskCommand(
      { taskId: uuid('404'), labelId: uuid('900') },
      deps,
    );

    expect(result.status).toBe('not_found');
  });
});

describe('detachLabelFromTaskCommand — успешный путь', () => {
  it('снимает активную связь (removeHlc установлен)', async () => {
    const taskStorage = new InMemoryCommandStoragePort();
    taskStorage.seedTaskLabel({
      taskId: uuid('1'),
      labelId: uuid('900'),
      addHlc: { physical: NOW.subtract({ hours: 1 }), logical: 0, deviceId: DEVICE_ID },
      removeHlc: null,
    });
    const deps: DetachLabelDeps = {
      storage: taskLabelStorageOver(taskStorage),
      now: NOW,
      deviceId: DEVICE_ID,
    };

    const result = await detachLabelFromTaskCommand(
      { taskId: uuid('1'), labelId: uuid('900') },
      deps,
    );

    expect(result.status).toBe('ok');
    const afterLink = taskStorage.findTaskLabel(uuid('1'), uuid('900'));
    expect(afterLink).not.toBeNull();
    expect(afterLink !== null && isTaskLabelActive(afterLink)).toBe(false);
  });
});

describe('detachLabelFromTaskCommand — нечего снимать', () => {
  it('связи не существует — not_found', async () => {
    const taskStorage = new InMemoryCommandStoragePort();
    const deps: DetachLabelDeps = {
      storage: taskLabelStorageOver(taskStorage),
      now: NOW,
      deviceId: DEVICE_ID,
    };

    const result = await detachLabelFromTaskCommand(
      { taskId: uuid('1'), labelId: uuid('900') },
      deps,
    );

    expect(result.status).toBe('not_found');
  });

  it('связь уже неактивна — not_found (нечего снимать повторно)', async () => {
    const taskStorage = new InMemoryCommandStoragePort();
    taskStorage.seedTaskLabel({
      taskId: uuid('1'),
      labelId: uuid('900'),
      addHlc: { physical: NOW.subtract({ hours: 2 }), logical: 0, deviceId: DEVICE_ID },
      removeHlc: { physical: NOW.subtract({ hours: 1 }), logical: 0, deviceId: DEVICE_ID },
    });
    const deps: DetachLabelDeps = {
      storage: taskLabelStorageOver(taskStorage),
      now: NOW,
      deviceId: DEVICE_ID,
    };

    const result = await detachLabelFromTaskCommand(
      { taskId: uuid('1'), labelId: uuid('900') },
      deps,
    );

    expect(result.status).toBe('not_found');
  });
});
