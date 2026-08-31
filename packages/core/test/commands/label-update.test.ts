import { describe, expect, it } from 'vitest';

import { updateLabelCommand } from '../../src/commands/label-update.js';
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

  findLabel(id: Uuid): Label | null {
    return this.byId.get(id) ?? null;
  }

  outboxEntries(): readonly SyncOutboxEntry[] {
    return this.outbox;
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

describe('updateLabelCommand — правка displayName пересчитывает normalizedName', () => {
  it('меняет displayName и normalizedName вместе', async () => {
    const world = new LabelTestWorld();
    world.seedLabel(existingLabel());

    const result = await updateLabelCommand(
      { id: uuid('1'), patch: { displayName: 'Дом' } },
      { storage: world.storage, now: NOW, deviceId: DEVICE_ID },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.label.displayName).toBe('Дом');
    expect(result.label.normalizedName).toBe(normalizeLabelName('Дом'));
  });

  it('без изменения имени — не конфликтует само с собой (excludingId=id)', async () => {
    const world = new LabelTestWorld();
    world.seedLabel(existingLabel());

    const result = await updateLabelCommand(
      { id: uuid('1'), patch: { colorToken: 'green' } },
      { storage: world.storage, now: NOW, deviceId: DEVICE_ID },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.label.displayName).toBe('Работа');
    expect(result.label.colorToken).toBe('green');
  });

  it('переименование в имя другой существующей метки — rejected LABEL_NOT_UNIQUE', async () => {
    const world = new LabelTestWorld();
    world.seedLabel(existingLabel({ id: uuid('1'), displayName: 'Работа' }));
    world.seedLabel(
      existingLabel({
        id: uuid('2'),
        displayName: 'Дом',
        normalizedName: normalizeLabelName('Дом'),
      }),
    );

    const result = await updateLabelCommand(
      { id: uuid('1'), patch: { displayName: 'дом' } },
      { storage: world.storage, now: NOW, deviceId: DEVICE_ID },
    );

    expect(result.status).toBe('rejected');
    expect(world.findLabel(uuid('1'))?.displayName).toBe('Работа');
  });

  it('rank — через resolveRank', async () => {
    const world = new LabelTestWorld();
    const before = initialRank();
    world.seedLabel(existingLabel({ rank: before }));

    const result = await updateLabelCommand(
      { id: uuid('1'), patch: { rank: { placement: 'start', firstRank: before } } },
      { storage: world.storage, now: NOW, deviceId: DEVICE_ID },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.label.rank < before).toBe(true);
  });
});

describe('updateLabelCommand — не найдена', () => {
  it('несуществующий id — not_found', async () => {
    const world = new LabelTestWorld();

    const result = await updateLabelCommand(
      { id: uuid('404'), patch: { colorToken: 'red' } },
      { storage: world.storage, now: NOW, deviceId: DEVICE_ID },
    );

    expect(result.status).toBe('not_found');
  });

  it('tombstone-метка — not_found', async () => {
    const world = new LabelTestWorld();
    world.seedLabel(existingLabel({ deletedAt: NOW.subtract({ hours: 1 }) }));

    const result = await updateLabelCommand(
      { id: uuid('1'), patch: { colorToken: 'red' } },
      { storage: world.storage, now: NOW, deviceId: DEVICE_ID },
    );

    expect(result.status).toBe('not_found');
  });
});
