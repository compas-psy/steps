import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  archiveProjectCommand,
  unarchiveProjectCommand,
  type ArchiveProjectDeps,
} from '../../src/commands/project-archive.js';
import type {
  CommandProjectDomainMutation,
  CommandProjectReminderReader,
  CommandProjectStoragePort,
  CommandProjectTaskReader,
  CommandProjectWriteTransaction,
  ProjectCommandDeps,
} from '../../src/commands/project-port.js';
import type {
  CommandReminderDomainMutation,
  CommandReminderStoragePort,
  CommandReminderWriteTransaction,
} from '../../src/commands/reminder-port.js';
import type { CommandSectionReader } from '../../src/commands/section-port.js';
import type { Project } from '../../src/entities/project.js';
import type { Reminder } from '../../src/entities/reminder.js';
import type { Section } from '../../src/entities/section.js';
import type { Task, TaskStatus } from '../../src/entities/task.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import { initialRank } from '../../src/order/index.js';
import type { Uuid } from '../../src/values.js';
import { DEVICE_ID, NOW, existingTask, uuid } from './fixtures.js';

const NOW_LOCAL = Temporal.PlainDateTime.from('2026-08-31T09:00:00');

/**
 * Комбинированный in-memory "мир" — Project/Section/Task/Reminder в одних
 * `Map`, потому что `archiveProjectCommand` реально читает/пишет все
 * четыре через отдельные узкие порты (`project-port.ts`,
 * `section-port.ts`, `reminder-port.ts`) и обязан видеть согласованное
 * состояние между ними (отменённое напоминание должно быть видно и через
 * `reminderReader`, и через `reminderStorage`, раз это один и тот же
 * `Reminder.id`). Локальный класс файла, не общий хелпер — та же причина,
 * что в `project-create.test.ts`/`reminder-cancel.test.ts`.
 */
class ArchiveTestWorld {
  private readonly projectsById = new Map<Uuid, Project>();
  private readonly sectionsById = new Map<Uuid, Section>();
  private readonly tasksById = new Map<Uuid, Task>();
  private readonly remindersById = new Map<Uuid, Reminder>();
  private readonly projectOutbox: SyncOutboxEntry[] = [];
  private readonly reminderOutbox: SyncOutboxEntry[] = [];

  readonly projectStorage: CommandProjectStoragePort = {
    projects: {
      findById: (id: Uuid): Promise<Project | null> =>
        Promise.resolve(this.projectsById.get(id) ?? null),
      countActiveExcluding: (excludingId: Uuid | null): Promise<number> => {
        let count = 0;
        for (const project of this.projectsById.values()) {
          if (project.deletedAt !== null || project.archivedAt !== null) continue;
          if (excludingId !== null && project.id === excludingId) continue;
          count += 1;
        }
        return Promise.resolve(count);
      },
    },
    runTransaction: async <T>(
      run: (tx: CommandProjectWriteTransaction) => Promise<T>,
    ): Promise<T> => {
      const tx: CommandProjectWriteTransaction = {
        applyMutation: (mutation: CommandProjectDomainMutation): Promise<void> => {
          for (const write of mutation.writes) this.projectsById.set(write.value.id, write.value);
          this.projectOutbox.push(...mutation.outbox);
          return Promise.resolve();
        },
      };
      return run(tx);
    },
  };

  readonly sectionReader: CommandSectionReader = {
    findById: (id: Uuid): Promise<Section | null> =>
      Promise.resolve(this.sectionsById.get(id) ?? null),
    listByProject: (projectId: Uuid): Promise<readonly Section[]> =>
      Promise.resolve(
        [...this.sectionsById.values()].filter(
          (section) => section.projectId === projectId && section.deletedAt === null,
        ),
      ),
  };

  readonly taskReader: CommandProjectTaskReader = {
    listByProjectSection: (
      projectId: Uuid,
      sectionId: Uuid | null,
      status: TaskStatus,
    ): Promise<readonly Task[]> =>
      Promise.resolve(
        [...this.tasksById.values()].filter(
          (task) =>
            task.projectId === projectId &&
            task.sectionId === sectionId &&
            task.status === status &&
            task.deletedAt === null,
        ),
      ),
  };

  readonly reminderReader: CommandProjectReminderReader = {
    listByTask: (taskId: Uuid): Promise<readonly Reminder[]> =>
      Promise.resolve(
        [...this.remindersById.values()].filter((reminder) => reminder.taskId === taskId),
      ),
  };

  readonly reminderStorage: CommandReminderStoragePort = {
    reminders: {
      countExplicitByTask: (_taskId: Uuid): Promise<number> => Promise.resolve(0),
    },
    // Task A6: `CommandReminderStoragePort` теперь несёт `tasks` (заголовок
    // для `computeReminderFingerprint` при создании) — тот же `tasksById`,
    // что уже видит `taskReader` выше, единый источник правды этого мира.
    tasks: {
      findById: (id: Uuid): Promise<Task | null> => Promise.resolve(this.tasksById.get(id) ?? null),
    },
    runTransaction: async <T>(
      run: (tx: CommandReminderWriteTransaction) => Promise<T>,
    ): Promise<T> => {
      const tx: CommandReminderWriteTransaction = {
        applyMutation: (mutation: CommandReminderDomainMutation): Promise<void> => {
          for (const write of mutation.writes) this.remindersById.set(write.value.id, write.value);
          this.reminderOutbox.push(...mutation.outbox);
          return Promise.resolve();
        },
      };
      return run(tx);
    },
  };

  seedProject(project: Project): void {
    this.projectsById.set(project.id, project);
  }

  seedSection(section: Section): void {
    this.sectionsById.set(section.id, section);
  }

  seedTask(task: Task): void {
    this.tasksById.set(task.id, task);
  }

  seedReminder(reminder: Reminder): void {
    this.remindersById.set(reminder.id, reminder);
  }

  reminder(id: Uuid): Reminder | undefined {
    return this.remindersById.get(id);
  }

  reminderOutboxEntries(): readonly SyncOutboxEntry[] {
    return [...this.reminderOutbox];
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

function enabledReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: uuid('900'),
    taskId: uuid('901'),
    kind: 'explicit',
    localRuleJson: {
      kind: 'explicit',
      date: '2026-09-05',
      time: null,
      firesAt: '2026-09-05T00:00:00',
    },
    enabled: true,
    scheduledFingerprint: '',
    ...overrides,
  };
}

function archiveDeps(world: ArchiveTestWorld): ArchiveProjectDeps {
  return {
    storage: world.projectStorage,
    sections: world.sectionReader,
    tasks: world.taskReader,
    reminders: world.reminderReader,
    reminderStorage: world.reminderStorage,
    now: NOW,
    nowLocal: NOW_LOCAL,
    deviceId: DEVICE_ID,
  };
}

function projectDeps(world: ArchiveTestWorld): ProjectCommandDeps {
  return { storage: world.projectStorage, now: NOW, deviceId: DEVICE_ID };
}

describe('archiveProjectCommand', () => {
  it('архивирует проект без задач: archivedAt=now, hadActiveTasks=false', async () => {
    const world = new ArchiveTestWorld();
    world.seedProject(existingProject());

    const result = await archiveProjectCommand({ id: uuid('1') }, archiveDeps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.project.archivedAt).toEqual(NOW);
    expect(result.hadActiveTasks).toBe(false);
    expect(result.cancelledReminderCount).toBe(0);
  });

  it('отменяет включённое напоминание активной задачи проекта (без секции)', async () => {
    const world = new ArchiveTestWorld();
    world.seedProject(existingProject());
    const task = existingTask({
      id: uuid('11'),
      projectId: uuid('1'),
      sectionId: null,
      status: 'active',
    });
    world.seedTask(task);
    world.seedReminder(enabledReminder({ id: uuid('12'), taskId: uuid('11') }));

    const result = await archiveProjectCommand({ id: uuid('1') }, archiveDeps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.hadActiveTasks).toBe(true);
    expect(result.cancelledReminderCount).toBe(1);
    expect(world.reminder(uuid('12'))?.enabled).toBe(false);
  });

  it('находит активные задачи и в именованных секциях, не только без секции', async () => {
    const world = new ArchiveTestWorld();
    world.seedProject(existingProject());
    world.seedSection({
      id: uuid('13'),
      projectId: uuid('1'),
      title: 'Секция',
      rank: initialRank(),
      deletedAt: null,
      clocks: {},
    });
    const task = existingTask({
      id: uuid('11'),
      projectId: uuid('1'),
      sectionId: uuid('13'),
      status: 'active',
    });
    world.seedTask(task);
    world.seedReminder(enabledReminder({ id: uuid('12'), taskId: uuid('11') }));

    const result = await archiveProjectCommand({ id: uuid('1') }, archiveDeps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.hadActiveTasks).toBe(true);
    expect(result.cancelledReminderCount).toBe(1);
  });

  it('не трогает напоминания завершённых задач — только "active tasks" (01§12)', async () => {
    const world = new ArchiveTestWorld();
    world.seedProject(existingProject());
    const completedTask = existingTask({
      id: uuid('14'),
      projectId: uuid('1'),
      sectionId: null,
      status: 'completed',
      completedAt: NOW.subtract({ hours: 1 }),
      completionKind: 'done',
    });
    world.seedTask(completedTask);
    world.seedReminder(enabledReminder({ id: uuid('15'), taskId: uuid('14') }));

    const result = await archiveProjectCommand({ id: uuid('1') }, archiveDeps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.hadActiveTasks).toBe(false);
    expect(result.cancelledReminderCount).toBe(0);
    expect(world.reminder(uuid('15'))?.enabled).toBe(true);
  });

  it('уже архивный проект — already_archived, идемпотентно', async () => {
    const world = new ArchiveTestWorld();
    world.seedProject(existingProject({ archivedAt: NOW.subtract({ hours: 1 }) }));

    const result = await archiveProjectCommand({ id: uuid('1') }, archiveDeps(world));

    expect(result).toEqual({ status: 'already_archived' });
  });

  it('несуществующий проект — not_found', async () => {
    const world = new ArchiveTestWorld();

    const result = await archiveProjectCommand({ id: uuid('404') }, archiveDeps(world));

    expect(result).toEqual({ status: 'not_found' });
  });
});

describe('unarchiveProjectCommand', () => {
  it('восстанавливает видимость: archivedAt=null', async () => {
    const world = new ArchiveTestWorld();
    world.seedProject(existingProject({ archivedAt: NOW.subtract({ hours: 1 }) }));

    const result = await unarchiveProjectCommand(
      { id: uuid('1'), hasProEntitlement: false },
      projectDeps(world),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.project.archivedAt).toBeNull();
  });

  it('ровно 10 активных проектов помимо этого — unarchive отклонён тем же гейтом 27', async () => {
    const world = new ArchiveTestWorld();
    world.seedProject(existingProject({ archivedAt: NOW.subtract({ hours: 1 }) }));
    for (let i = 0; i < 10; i++) {
      world.seedProject(existingProject({ id: uuid(String(500 + i)) }));
    }

    const result = await unarchiveProjectCommand(
      { id: uuid('1'), hasProEntitlement: false },
      projectDeps(world),
    );

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.validation.issues.some((issue) => issue.code === 'PROJECT_LIMIT_REACHED')).toBe(
      true,
    );
  });

  it('Pro-пользователь может разархивировать сверх лимита', async () => {
    const world = new ArchiveTestWorld();
    world.seedProject(existingProject({ archivedAt: NOW.subtract({ hours: 1 }) }));
    for (let i = 0; i < 10; i++) {
      world.seedProject(existingProject({ id: uuid(String(600 + i)) }));
    }

    const result = await unarchiveProjectCommand(
      { id: uuid('1'), hasProEntitlement: true },
      projectDeps(world),
    );

    expect(result.status).toBe('ok');
  });

  it('уже активный проект — already_active', async () => {
    const world = new ArchiveTestWorld();
    world.seedProject(existingProject());

    const result = await unarchiveProjectCommand(
      { id: uuid('1'), hasProEntitlement: false },
      projectDeps(world),
    );

    expect(result).toEqual({ status: 'already_active' });
  });

  it('несуществующий проект — not_found', async () => {
    const world = new ArchiveTestWorld();

    const result = await unarchiveProjectCommand(
      { id: uuid('404'), hasProEntitlement: false },
      projectDeps(world),
    );

    expect(result).toEqual({ status: 'not_found' });
  });
});
