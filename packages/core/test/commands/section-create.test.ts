import { describe, expect, it } from 'vitest';

import { createSectionCommand } from '../../src/commands/section-create.js';
import type {
  CommandSectionDomainMutation,
  CommandSectionStoragePort,
  CommandSectionWriteTransaction,
  SectionCommandDeps,
} from '../../src/commands/section-port.js';
import type { Section } from '../../src/entities/section.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
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

  allSections(): readonly Section[] {
    return [...this.byId.values()];
  }

  outboxEntries(): readonly SyncOutboxEntry[] {
    return [...this.outboxLog];
  }
}

function deps(storage: CommandSectionStoragePort): SectionCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID };
}

describe('createSectionCommand', () => {
  it('создаёт секцию с валидным title, пишет outbox', async () => {
    const storage = new InMemorySectionStoragePort();

    const result = await createSectionCommand(
      { projectId: uuid('9'), title: 'Кухня', rank: { placement: 'empty-list' } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.section.title).toBe('Кухня');
    expect(result.section.projectId).toBe(uuid('9'));
    expect(result.section.deletedAt).toBeNull();

    expect(storage.allSections()).toHaveLength(1);
    const entries = storage.outboxEntries();
    expect(entries[0]?.entityType).toBe('section');
    expect(entries[0]?.baseRevision).toBe(0n);
  });

  it('отклоняет пустой title (правило 23), ничего не пишет', async () => {
    const storage = new InMemorySectionStoragePort();

    const result = await createSectionCommand(
      { projectId: uuid('9'), title: '', rank: { placement: 'empty-list' } },
      deps(storage),
    );

    expect(result.status).toBe('rejected');
    expect(storage.allSections()).toHaveLength(0);
    expect(storage.outboxEntries()).toHaveLength(0);
  });

  it('title длиннее 80 символов отклонён', async () => {
    const storage = new InMemorySectionStoragePort();
    const longTitle = 'а'.repeat(81);

    const result = await createSectionCommand(
      { projectId: uuid('9'), title: longTitle, rank: { placement: 'empty-list' } },
      deps(storage),
    );

    expect(result.status).toBe('rejected');
  });
});
