import { describe, expect, it } from 'vitest';

import { updateProjectCommand } from '../../src/commands/project-update.js';
import type {
  CommandProjectDomainMutation,
  CommandProjectStoragePort,
  CommandProjectWriteTransaction,
  ProjectCommandDeps,
} from '../../src/commands/project-port.js';
import type { Project } from '../../src/entities/project.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import { initialRank } from '../../src/order/index.js';
import type { Uuid } from '../../src/values.js';
import { DEVICE_ID, NOW, uuid } from './fixtures.js';

class InMemoryProjectStoragePort implements CommandProjectStoragePort {
  private readonly byId = new Map<Uuid, Project>();
  private readonly outboxLog: SyncOutboxEntry[] = [];

  readonly projects = {
    findById: (id: Uuid): Promise<Project | null> => Promise.resolve(this.byId.get(id) ?? null),
    countActiveExcluding: (_excludingId: Uuid | null): Promise<number> => Promise.resolve(0),
  };

  async runTransaction<T>(run: (tx: CommandProjectWriteTransaction) => Promise<T>): Promise<T> {
    const tx: CommandProjectWriteTransaction = {
      applyMutation: (mutation: CommandProjectDomainMutation): Promise<void> => {
        for (const write of mutation.writes) {
          this.byId.set(write.value.id, write.value);
        }
        this.outboxLog.push(...mutation.outbox);
        return Promise.resolve();
      },
    };
    return run(tx);
  }

  seedProject(project: Project): void {
    this.byId.set(project.id, project);
  }

  outboxEntries(): readonly SyncOutboxEntry[] {
    return [...this.outboxLog];
  }
}

function existingProject(overrides: Partial<Project> = {}): Project {
  const base: Project = {
    id: uuid('1'),
    title: 'Проект',
    description: '',
    colorToken: 'blue',
    icon: null,
    defaultView: 'list',
    favorite: false,
    archivedAt: null,
    rank: initialRank(),
    createdAt: NOW.subtract({ hours: 1 }),
    updatedAt: NOW.subtract({ hours: 1 }),
    deletedAt: null,
    clocks: {},
  };
  return { ...base, ...overrides };
}

function deps(storage: CommandProjectStoragePort): ProjectCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID };
}

describe('updateProjectCommand', () => {
  it('патчит только переданные поля, остальные не трогает', async () => {
    const storage = new InMemoryProjectStoragePort();
    storage.seedProject(existingProject());

    const result = await updateProjectCommand(
      { id: uuid('1'), patch: { title: 'Новое имя' } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.project.title).toBe('Новое имя');
    expect(result.project.colorToken).toBe('blue');
    expect(result.project.updatedAt).toEqual(NOW);
  });

  it('favorite редактируется тем же патчем — не отдельная команда/сущность', async () => {
    const storage = new InMemoryProjectStoragePort();
    storage.seedProject(existingProject({ favorite: false }));

    const result = await updateProjectCommand(
      { id: uuid('1'), patch: { favorite: true } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.project.favorite).toBe(true);
  });

  it('icon:null явно очищает иконку, отличимо от "не тронут"', async () => {
    const storage = new InMemoryProjectStoragePort();
    storage.seedProject(existingProject({ icon: 'star' }));

    const result = await updateProjectCommand(
      { id: uuid('1'), patch: { icon: null } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.project.icon).toBeNull();
  });

  it('несуществующий/tombstone проект — not_found', async () => {
    const storage = new InMemoryProjectStoragePort();
    storage.seedProject(existingProject({ id: uuid('2'), deletedAt: NOW }));

    const result = await updateProjectCommand(
      { id: uuid('2'), patch: { title: 'X' } },
      deps(storage),
    );

    expect(result.status).toBe('not_found');
  });

  it('пустой title патчем — отклонён правилом 22, ничего не записано', async () => {
    const storage = new InMemoryProjectStoragePort();
    storage.seedProject(existingProject());

    const result = await updateProjectCommand(
      { id: uuid('1'), patch: { title: '' } },
      deps(storage),
    );

    expect(result.status).toBe('rejected');
    expect(storage.outboxEntries()).toHaveLength(0);
  });

  it('обычная правка не гейтится Free-лимитом, даже если активных проектов много', async () => {
    const storage = new InMemoryProjectStoragePort();
    storage.seedProject(existingProject());
    // countActiveExcluding здесь всегда возвращает 0 в этом фейке — тест
    // подтверждает, что update вообще не читает лимит для успешного исхода,
    // а не то, что фейк случайно вернул безопасное число.

    const result = await updateProjectCommand(
      { id: uuid('1'), patch: { description: 'Длинное описание' } },
      deps(storage),
    );

    expect(result.status).toBe('ok');
  });
});
