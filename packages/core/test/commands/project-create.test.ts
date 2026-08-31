import { describe, expect, it } from 'vitest';

import { createProjectCommand } from '../../src/commands/project-create.js';
import type {
  CommandProjectStoragePort,
  CommandProjectWriteTransaction,
  ProjectCommandDeps,
} from '../../src/commands/project-port.js';
import type { CommandProjectDomainMutation } from '../../src/commands/project-port.js';
import type { Project } from '../../src/entities/project.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import { initialRank } from '../../src/order/index.js';
import type { Uuid } from '../../src/values.js';
import { DEVICE_ID, NOW, uuid } from './fixtures.js';

/** Минимальный in-memory `CommandProjectStoragePort` — тот же приём, что
 * `InMemoryReminderStoragePort` в `reminder-cancel.test.ts` (собственный,
 * локальный для файла, не общий хелпер — территория этого пакета работ не
 * включает новые не-тестовые файлы `test/commands/`). */
class InMemoryProjectStoragePort implements CommandProjectStoragePort {
  private readonly byId = new Map<Uuid, Project>();
  private readonly outboxLog: SyncOutboxEntry[] = [];

  readonly projects = {
    findById: (id: Uuid): Promise<Project | null> => Promise.resolve(this.byId.get(id) ?? null),
    countActiveExcluding: (excludingId: Uuid | null): Promise<number> => {
      let count = 0;
      for (const project of this.byId.values()) {
        if (project.deletedAt !== null || project.archivedAt !== null) continue;
        if (excludingId !== null && project.id === excludingId) continue;
        count += 1;
      }
      return Promise.resolve(count);
    },
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

  allProjects(): readonly Project[] {
    return [...this.byId.values()];
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

describe('createProjectCommand', () => {
  it('создаёт проект с валидными полями, пишет outbox', async () => {
    const storage = new InMemoryProjectStoragePort();

    const result = await createProjectCommand(
      {
        title: 'Ремонт',
        colorToken: 'red',
        defaultView: 'board',
        hasProEntitlement: false,
        rank: { placement: 'empty-list' },
      },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.project.title).toBe('Ремонт');
    expect(result.project.description).toBe('');
    expect(result.project.favorite).toBe(false);
    expect(result.project.archivedAt).toBeNull();

    expect(storage.allProjects()).toHaveLength(1);
    const entries = storage.outboxEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.entityType).toBe('project');
    expect(entries[0]?.baseRevision).toBe(0n);
  });

  it('отклоняет пустой title (правило 22), ничего не пишет', async () => {
    const storage = new InMemoryProjectStoragePort();

    const result = await createProjectCommand(
      {
        title: '',
        colorToken: 'red',
        defaultView: 'list',
        hasProEntitlement: false,
        rank: { placement: 'empty-list' },
      },
      deps(storage),
    );

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.validation.issues.some((issue) => issue.field === 'title')).toBe(true);
    expect(storage.allProjects()).toHaveLength(0);
    expect(storage.outboxEntries()).toHaveLength(0);
  });

  it('ровно 10 активных проектов — 11-я попытка отклонена Free-лимитом (правило 27)', async () => {
    const storage = new InMemoryProjectStoragePort();
    for (let i = 0; i < 10; i++) {
      storage.seedProject(existingProject({ id: uuid(String(100 + i)) }));
    }

    const result = await createProjectCommand(
      {
        title: 'Одиннадцатый',
        colorToken: 'red',
        defaultView: 'list',
        hasProEntitlement: false,
        rank: { placement: 'empty-list' },
      },
      deps(storage),
    );

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.validation.issues.some((issue) => issue.code === 'PROJECT_LIMIT_REACHED')).toBe(
      true,
    );
    expect(storage.allProjects()).toHaveLength(10);
  });

  it('ровно 9 активных проектов — 10-й создаётся успешно (граница не срабатывает раньше времени)', async () => {
    const storage = new InMemoryProjectStoragePort();
    for (let i = 0; i < 9; i++) {
      storage.seedProject(existingProject({ id: uuid(String(200 + i)) }));
    }

    const result = await createProjectCommand(
      {
        title: 'Десятый',
        colorToken: 'red',
        defaultView: 'list',
        hasProEntitlement: false,
        rank: { placement: 'empty-list' },
      },
      deps(storage),
    );

    expect(result.status).toBe('ok');
    expect(storage.allProjects()).toHaveLength(10);
  });

  it('Pro-пользователь создаёт 11-й проект без гейта', async () => {
    const storage = new InMemoryProjectStoragePort();
    for (let i = 0; i < 10; i++) {
      storage.seedProject(existingProject({ id: uuid(String(300 + i)) }));
    }

    const result = await createProjectCommand(
      {
        title: 'Одиннадцатый (Pro)',
        colorToken: 'red',
        defaultView: 'list',
        hasProEntitlement: true,
        rank: { placement: 'empty-list' },
      },
      deps(storage),
    );

    expect(result.status).toBe('ok');
  });

  it('архивные проекты не считаются активными для лимита', async () => {
    const storage = new InMemoryProjectStoragePort();
    for (let i = 0; i < 10; i++) {
      storage.seedProject(
        existingProject({ id: uuid(String(400 + i)), archivedAt: NOW.subtract({ hours: 2 }) }),
      );
    }

    const result = await createProjectCommand(
      {
        title: 'Первый активный',
        colorToken: 'red',
        defaultView: 'list',
        hasProEntitlement: false,
        rank: { placement: 'empty-list' },
      },
      deps(storage),
    );

    expect(result.status).toBe('ok');
  });
});
