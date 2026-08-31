import { describe, expect, it } from 'vitest';

import { createLabelCommand } from '../../src/commands/label-create.js';
import type {
  CommandLabelDomainMutation,
  CommandLabelStoragePort,
} from '../../src/commands/label-port.js';
import { normalizeLabelName } from '../../src/validation/label.js';
import type { Label } from '../../src/entities/label.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import { initialRank } from '../../src/order/index.js';
import type { Uuid } from '../../src/values.js';
import { DEVICE_ID, NOW, uuid } from './fixtures.js';

class LabelTestWorld {
  private readonly byId = new Map<Uuid, Label>();
  private readonly outbox: SyncOutboxEntry[] = [];

  readonly storage: CommandLabelStoragePort = {
    labels: {
      findById: (id: Uuid): Promise<Label | null> => Promise.resolve(this.byId.get(id) ?? null),
      loadValidationContext: (excludingId: Uuid | null) =>
        Promise.resolve({
          existingNormalizedNames: [...this.byId.values()]
            .filter((label) => label.deletedAt === null && label.id !== excludingId)
            .map((label) => label.normalizedName),
        }),
    },
    runTransaction: async <T>(
      run: (tx: { applyMutation: (m: CommandLabelDomainMutation) => Promise<void> }) => Promise<T>,
    ) => {
      const tx = {
        applyMutation: (mutation: CommandLabelDomainMutation): Promise<void> => {
          for (const write of mutation.writes) this.byId.set(write.value.id, write.value);
          this.outbox.push(...mutation.outbox);
          return Promise.resolve();
        },
      };
      return run(tx);
    },
  };

  seedLabel(label: Label): void {
    this.byId.set(label.id, label);
  }

  outboxEntries(): readonly SyncOutboxEntry[] {
    return this.outbox;
  }
}

describe('createLabelCommand — успешный путь', () => {
  it('создаёт метку с нормализованным именем, пишет outbox', async () => {
    const world = new LabelTestWorld();

    const result = await createLabelCommand(
      { displayName: 'Работа', colorToken: 'blue', rank: { placement: 'empty-list' } },
      { storage: world.storage, now: NOW, deviceId: DEVICE_ID },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.label.displayName).toBe('Работа');
    expect(result.label.normalizedName).toBe(normalizeLabelName('Работа'));
    expect(result.label.colorToken).toBe('blue');
    expect(world.outboxEntries()).toHaveLength(1);
    expect(world.outboxEntries()[0]?.entityType).toBe('label');
  });
});

describe('createLabelCommand — правило 24: уникальность регистронезависимо', () => {
  it('"работа" при уже существующей "Работа" — rejected LABEL_NOT_UNIQUE', async () => {
    const world = new LabelTestWorld();
    world.seedLabel({
      id: uuid('1'),
      normalizedName: normalizeLabelName('Работа'),
      displayName: 'Работа',
      colorToken: null,
      rank: initialRank(),
      deletedAt: null,
      clocks: {},
    });

    const result = await createLabelCommand(
      { displayName: 'работа', colorToken: null, rank: { placement: 'empty-list' } },
      { storage: world.storage, now: NOW, deviceId: DEVICE_ID },
    );

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.validation.issues.some((i) => i.code === 'LABEL_NOT_UNIQUE')).toBe(true);
    expect(world.outboxEntries()).toHaveLength(0);
  });

  it('tombstone-метка с тем же именем не блокирует создание новой', async () => {
    const world = new LabelTestWorld();
    world.seedLabel({
      id: uuid('1'),
      normalizedName: normalizeLabelName('Работа'),
      displayName: 'Работа',
      colorToken: null,
      rank: initialRank(),
      deletedAt: NOW.subtract({ hours: 1 }),
      clocks: {},
    });

    const result = await createLabelCommand(
      { displayName: 'Работа', colorToken: null, rank: { placement: 'empty-list' } },
      { storage: world.storage, now: NOW, deviceId: DEVICE_ID },
    );

    expect(result.status).toBe('ok');
  });
});

describe('createLabelCommand — правило 23: длина 1..80', () => {
  it('пустое имя — rejected', async () => {
    const world = new LabelTestWorld();

    const result = await createLabelCommand(
      { displayName: '', colorToken: null, rank: { placement: 'empty-list' } },
      { storage: world.storage, now: NOW, deviceId: DEVICE_ID },
    );

    expect(result.status).toBe('rejected');
  });
});
