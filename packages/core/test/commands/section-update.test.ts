import { describe, expect, it } from 'vitest';

import { updateSectionCommand } from '../../src/commands/section-update.js';
import type {
  CommandSectionDomainMutation,
  CommandSectionStoragePort,
  CommandSectionWriteTransaction,
  SectionCommandDeps,
} from '../../src/commands/section-port.js';
import type { Section } from '../../src/entities/section.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import { initialRank, rankAfter } from '../../src/order/index.js';
import type { Uuid } from '../../src/values.js';
import { DEVICE_ID, NOW, uuid } from './fixtures.js';

class InMemorySectionStoragePort implements CommandSectionStoragePort {
  private readonly byId = new Map<Uuid, Section>();
  private readonly outboxLog: SyncOutboxEntry[] = [];

  readonly sections = {
    findById: (id: Uuid): Promise<Section | null> => Promise.resolve(this.byId.get(id) ?? null),
    listByProject: (projectId: Uuid): Promise<readonly Section[]> =>
      Promise.resolve(
        [...this.byId.values()].filter(
          (section) => section.projectId === projectId && section.deletedAt === null,
        ),
      ),
  };

  async runTransaction<T>(run: (tx: CommandSectionWriteTransaction) => Promise<T>): Promise<T> {
    const tx: CommandSectionWriteTransaction = {
      applyMutation: (mutation: CommandSectionDomainMutation): Promise<void> => {
        for (const write of mutation.writes) {
          this.byId.set(write.value.id, write.value);
        }
        this.outboxLog.push(...mutation.outbox);
        return Promise.resolve();
      },
    };
    return run(tx);
  }

  seedSection(section: Section): void {
    this.byId.set(section.id, section);
  }

  outboxEntries(): readonly SyncOutboxEntry[] {
    return [...this.outboxLog];
  }
}

function existingSection(overrides: Partial<Section> = {}): Section {
  const base: Section = {
    id: uuid('1'),
    projectId: uuid('9'),
    title: 'Существующая секция',
    rank: initialRank(),
    deletedAt: null,
    clocks: {},
  };
  return { ...base, ...overrides };
}

function deps(storage: CommandSectionStoragePort): SectionCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID };
}

describe('updateSectionCommand', () => {
  it('переименование — патч title, rank не тронут', async () => {
    const storage = new InMemorySectionStoragePort();
    const original = existingSection();
    storage.seedSection(original);

    const result = await updateSectionCommand(
      { id: uuid('1'), patch: { title: 'Гостиная' } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.section.title).toBe('Гостиная');
    expect(result.section.rank).toBe(original.rank);
  });

  it('reorder — патч rank через rankAfter/rankBefore/rankBetween, только запись', async () => {
    const storage = new InMemorySectionStoragePort();
    const original = existingSection();
    storage.seedSection(original);
    const targetRank = rankAfter(original.rank);

    const result = await updateSectionCommand(
      { id: uuid('1'), patch: { rank: { placement: 'explicit', rank: targetRank } } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.section.rank).toBe(targetRank);
    expect(result.section.title).toBe(original.title);
  });

  it('несуществующая/tombstone секция — not_found', async () => {
    const storage = new InMemorySectionStoragePort();
    storage.seedSection(existingSection({ id: uuid('2'), deletedAt: NOW }));

    const result = await updateSectionCommand(
      { id: uuid('2'), patch: { title: 'X' } },
      deps(storage),
    );

    expect(result.status).toBe('not_found');
  });

  it('пустой title патчем — отклонён, ничего не записано', async () => {
    const storage = new InMemorySectionStoragePort();
    storage.seedSection(existingSection());

    const result = await updateSectionCommand(
      { id: uuid('1'), patch: { title: '' } },
      deps(storage),
    );

    expect(result.status).toBe('rejected');
    expect(storage.outboxEntries()).toHaveLength(0);
  });
});
