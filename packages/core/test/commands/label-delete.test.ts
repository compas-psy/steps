import { describe, expect, it } from 'vitest';

import { deleteLabelCommand, type DeleteLabelDeps } from '../../src/commands/label-delete.js';
import type {
  CommandLabelDomainMutation,
  CommandLabelStoragePort,
} from '../../src/commands/label-port.js';
import type {
  CommandTaskLabelDomainMutation,
  CommandTaskLabelStoragePort,
} from '../../src/commands/task-label-port.js';
import { normalizeLabelName } from '../../src/validation/label.js';
import type { Label } from '../../src/entities/label.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import type { TaskLabel } from '../../src/entities/task-label.js';
import { initialRank } from '../../src/order/index.js';
import type { Uuid } from '../../src/values.js';
import { DEVICE_ID, NOW, uuid } from './fixtures.js';

class DeleteLabelTestWorld {
  private readonly labelsById = new Map<Uuid, Label>();
  private readonly taskLabelsByKey = new Map<string, TaskLabel>();
  private readonly labelOutbox: SyncOutboxEntry[] = [];
  private readonly taskLabelOutbox: SyncOutboxEntry[] = [];

  readonly labelStorage: CommandLabelStoragePort = {
    labels: {
      findById: (id: Uuid): Promise<Label | null> =>
        Promise.resolve(this.labelsById.get(id) ?? null),
      loadValidationContext: () => Promise.resolve({ existingNormalizedNames: [] }),
    },
    runTransaction: async <T>(
      run: (tx: { applyMutation: (m: CommandLabelDomainMutation) => Promise<void> }) => Promise<T>,
    ) => {
      const tx = {
        applyMutation: (mutation: CommandLabelDomainMutation): Promise<void> => {
          for (const write of mutation.writes) this.labelsById.set(write.value.id, write.value);
          this.labelOutbox.push(...mutation.outbox);
          return Promise.resolve();
        },
      };
      return run(tx);
    },
  };

  readonly taskLabelStorage: CommandTaskLabelStoragePort = {
    taskLabels: {
      listByTask: (taskId: Uuid) =>
        Promise.resolve([...this.taskLabelsByKey.values()].filter((l) => l.taskId === taskId)),
      listByLabel: (labelId: Uuid) =>
        Promise.resolve([...this.taskLabelsByKey.values()].filter((l) => l.labelId === labelId)),
    },
    runTransaction: async <T>(
      run: (tx: {
        applyMutation: (m: CommandTaskLabelDomainMutation) => Promise<void>;
      }) => Promise<T>,
    ) => {
      const tx = {
        applyMutation: (mutation: CommandTaskLabelDomainMutation): Promise<void> => {
          for (const write of mutation.writes) {
            this.taskLabelsByKey.set(`${write.value.taskId}:${write.value.labelId}`, write.value);
          }
          this.taskLabelOutbox.push(...mutation.outbox);
          return Promise.resolve();
        },
      };
      return run(tx);
    },
  };

  seedLabel(label: Label): void {
    this.labelsById.set(label.id, label);
  }

  seedTaskLabel(link: TaskLabel): void {
    this.taskLabelsByKey.set(`${link.taskId}:${link.labelId}`, link);
  }

  findLabel(id: Uuid): Label | null {
    return this.labelsById.get(id) ?? null;
  }

  findTaskLabel(taskId: Uuid, labelId: Uuid): TaskLabel | null {
    return this.taskLabelsByKey.get(`${taskId}:${labelId}`) ?? null;
  }

  labelOutboxEntries(): readonly SyncOutboxEntry[] {
    return this.labelOutbox;
  }

  taskLabelOutboxEntries(): readonly SyncOutboxEntry[] {
    return this.taskLabelOutbox;
  }
}

function existingLabel(overrides: Partial<Label> = {}): Label {
  const base: Label = {
    id: uuid('1'),
    normalizedName: normalizeLabelName('Работа'),
    displayName: 'Работа',
    colorToken: null,
    rank: initialRank(),
    deletedAt: null,
    clocks: {},
  };
  return { ...base, ...overrides };
}

function deps(world: DeleteLabelTestWorld): DeleteLabelDeps {
  return {
    storage: world.labelStorage,
    taskLabels: world.taskLabelStorage,
    now: NOW,
    deviceId: DEVICE_ID,
  };
}

describe('deleteLabelCommand — §13 "Label lifecycle": снимает только связи, задачи не трогает', () => {
  it('tombstone метки + снятие всех активных связей, возвращает pre-image affectedTaskLabels', async () => {
    const world = new DeleteLabelTestWorld();
    world.seedLabel(existingLabel());
    const link: TaskLabel = {
      taskId: uuid('10'),
      labelId: uuid('1'),
      addHlc: { physical: NOW.subtract({ hours: 2 }), logical: 0, deviceId: DEVICE_ID },
      removeHlc: null,
    };
    world.seedTaskLabel(link);

    const result = await deleteLabelCommand({ id: uuid('1') }, deps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.label.deletedAt?.equals(NOW)).toBe(true);
    expect(result.affectedTaskLabels).toEqual([link]);

    const afterLink = world.findTaskLabel(uuid('10'), uuid('1'));
    expect(afterLink?.removeHlc).not.toBeNull();
    expect(afterLink?.addHlc).toEqual(link.addHlc);
  });

  it('уже неактивная связь (removeHlc уже установлен) не попадает в affectedTaskLabels', async () => {
    const world = new DeleteLabelTestWorld();
    world.seedLabel(existingLabel());
    const inactiveLink: TaskLabel = {
      taskId: uuid('10'),
      labelId: uuid('1'),
      addHlc: { physical: NOW.subtract({ hours: 3 }), logical: 0, deviceId: DEVICE_ID },
      removeHlc: { physical: NOW.subtract({ hours: 2 }), logical: 0, deviceId: DEVICE_ID },
    };
    world.seedTaskLabel(inactiveLink);

    const result = await deleteLabelCommand({ id: uuid('1') }, deps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedTaskLabels).toHaveLength(0);
  });

  it('метка без связей — ok, affectedTaskLabels пуст, ни одной task_label outbox-записи', async () => {
    const world = new DeleteLabelTestWorld();
    world.seedLabel(existingLabel());

    const result = await deleteLabelCommand({ id: uuid('1') }, deps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedTaskLabels).toHaveLength(0);
    expect(world.taskLabelOutboxEntries()).toHaveLength(0);
    expect(world.labelOutboxEntries()).toHaveLength(1);
  });

  it('несколько связей на разных задачах — все снимаются', async () => {
    const world = new DeleteLabelTestWorld();
    world.seedLabel(existingLabel());
    world.seedTaskLabel({
      taskId: uuid('10'),
      labelId: uuid('1'),
      addHlc: { physical: NOW.subtract({ hours: 2 }), logical: 0, deviceId: DEVICE_ID },
      removeHlc: null,
    });
    world.seedTaskLabel({
      taskId: uuid('11'),
      labelId: uuid('1'),
      addHlc: { physical: NOW.subtract({ hours: 2 }), logical: 0, deviceId: DEVICE_ID },
      removeHlc: null,
    });

    const result = await deleteLabelCommand({ id: uuid('1') }, deps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedTaskLabels).toHaveLength(2);
    expect(world.findTaskLabel(uuid('10'), uuid('1'))?.removeHlc).not.toBeNull();
    expect(world.findTaskLabel(uuid('11'), uuid('1'))?.removeHlc).not.toBeNull();
  });
});

describe('deleteLabelCommand — не найдена', () => {
  it('несуществующий id — not_found', async () => {
    const world = new DeleteLabelTestWorld();

    const result = await deleteLabelCommand({ id: uuid('404') }, deps(world));

    expect(result.status).toBe('not_found');
  });

  it('уже удалённая — not_found', async () => {
    const world = new DeleteLabelTestWorld();
    world.seedLabel(existingLabel({ deletedAt: NOW.subtract({ hours: 1 }) }));

    const result = await deleteLabelCommand({ id: uuid('1') }, deps(world));

    expect(result.status).toBe('not_found');
  });
});
