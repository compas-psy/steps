import { describe, expect, it } from 'vitest';

import {
  deleteProjectAndTasksCommand,
  deleteProjectKeepingTasksCommand,
  type DeleteProjectDeps,
} from '../../src/commands/project-delete.js';
import type {
  CommandProjectDomainMutation,
  CommandProjectStoragePort,
  CommandProjectTaskReader,
  CommandProjectWriteTransaction,
} from '../../src/commands/project-port.js';
import type { CommandSectionReader } from '../../src/commands/section-port.js';
import type { Project } from '../../src/entities/project.js';
import type { Section } from '../../src/entities/section.js';
import type { TaskStatus } from '../../src/entities/task.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import { initialRank } from '../../src/order/index.js';
import type { Uuid } from '../../src/values.js';
import { DEVICE_ID, NOW, existingTask, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

/**
 * "Мир" для permanent-delete команд — Project/Section в собственных `Map`
 * (как `project-archive.test.ts`), Task делегирован уже готовому
 * `InMemoryCommandStoragePort` (`in-memory-storage-port.ts`, вне
 * территории — только чтение/переиспользование его публичного API), потому
 * что обе команды этого файла реально вызывают `updateTaskCommand`/
 * `deleteTaskCommand` (`taskCommandStorage`) поверх того же хранилища,
 * которое `taskReader.listByProjectSection` обязано видеть согласованно.
 */
class DeleteProjectTestWorld {
  private readonly projectsById = new Map<Uuid, Project>();
  private readonly sectionsById = new Map<Uuid, Section>();
  private readonly projectOutbox: SyncOutboxEntry[] = [];

  readonly taskStorage = new InMemoryCommandStoragePort();

  readonly projectStorage: CommandProjectStoragePort = {
    projects: {
      findById: (id: Uuid): Promise<Project | null> =>
        Promise.resolve(this.projectsById.get(id) ?? null),
      countActiveExcluding: (_excludingId: Uuid | null): Promise<number> => Promise.resolve(0),
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
    listByProjectSection: (projectId: Uuid, sectionId: Uuid | null, status: TaskStatus) =>
      Promise.resolve(
        this.taskStorage
          .allTasks()
          .filter(
            (task) =>
              task.projectId === projectId &&
              task.sectionId === sectionId &&
              task.status === status &&
              task.deletedAt === null,
          ),
      ),
  };

  seedProject(project: Project): void {
    this.projectsById.set(project.id, project);
  }

  seedSection(section: Section): void {
    this.sectionsById.set(section.id, section);
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
    archivedAt: NOW.subtract({ hours: 1 }),
    rank: initialRank(),
    createdAt: NOW.subtract({ hours: 2 }),
    updatedAt: NOW.subtract({ hours: 2 }),
    deletedAt: null,
    clocks: {},
  };
  return { ...base, ...overrides };
}

function deps(world: DeleteProjectTestWorld): DeleteProjectDeps {
  return {
    storage: world.projectStorage,
    sections: world.sectionReader,
    tasks: world.taskReader,
    taskCommandStorage: world.taskStorage,
    now: NOW,
    deviceId: DEVICE_ID,
  };
}

describe('deleteProjectKeepingTasksCommand («Переместить задачи во Входящие»)', () => {
  it('top-level задачу переносит в inbox: project/section очищены, captureState=inbox', async () => {
    const world = new DeleteProjectTestWorld();
    world.seedProject(existingProject());
    world.taskStorage.seedTask(
      existingTask({ id: uuid('10'), projectId: uuid('1'), sectionId: null, status: 'active' }),
    );

    const result = await deleteProjectKeepingTasksCommand({ id: uuid('1') }, deps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedTaskCount).toBe(1);
    expect(result.taskFailures).toHaveLength(0);
    expect(result.project.deletedAt).toEqual(NOW);

    const moved = await world.taskStorage.tasks.findById(uuid('10'));
    expect(moved?.projectId).toBeNull();
    expect(moved?.sectionId).toBeNull();
    expect(moved?.captureState).toBe('inbox');
  });

  it('subtask переносится в inbox проектом/секцией, но остаётся processed (01§12 "attached Subtasks remain processed")', async () => {
    const world = new DeleteProjectTestWorld();
    world.seedProject(existingProject());
    world.taskStorage.seedTask(
      existingTask({
        id: uuid('20'),
        projectId: uuid('1'),
        sectionId: null,
        status: 'active',
        parentTaskId: null,
        captureState: 'processed',
      }),
    );
    world.taskStorage.seedTask(
      existingTask({
        id: uuid('21'),
        projectId: uuid('1'),
        sectionId: null,
        status: 'active',
        parentTaskId: uuid('20'),
        captureState: 'processed',
      }),
    );

    const result = await deleteProjectKeepingTasksCommand({ id: uuid('1') }, deps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedTaskCount).toBe(2);

    const parent = await world.taskStorage.tasks.findById(uuid('20'));
    expect(parent?.projectId).toBeNull();
    expect(parent?.captureState).toBe('inbox');

    const subtask = await world.taskStorage.tasks.findById(uuid('21'));
    expect(subtask?.projectId).toBeNull();
    expect(subtask?.sectionId).toBeNull();
    expect(subtask?.captureState).toBe('processed');
  });

  it('переносит и завершённые задачи проекта, не только активные ("у всех задач проекта")', async () => {
    const world = new DeleteProjectTestWorld();
    world.seedProject(existingProject());
    world.taskStorage.seedTask(
      existingTask({
        id: uuid('30'),
        projectId: uuid('1'),
        sectionId: null,
        status: 'completed',
        completedAt: NOW.subtract({ hours: 1 }),
        completionKind: 'done',
      }),
    );

    const result = await deleteProjectKeepingTasksCommand({ id: uuid('1') }, deps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedTaskCount).toBe(1);

    const moved = await world.taskStorage.tasks.findById(uuid('30'));
    expect(moved?.projectId).toBeNull();
    expect(moved?.captureState).toBe('inbox');
    expect(moved?.status).toBe('completed');
  });

  it('несуществующий проект — not_found', async () => {
    const world = new DeleteProjectTestWorld();

    const result = await deleteProjectKeepingTasksCommand({ id: uuid('404') }, deps(world));

    expect(result).toEqual({ status: 'not_found' });
  });
});

describe('deleteProjectAndTasksCommand («Удалить проект и задачи»)', () => {
  it('tombstone-ит и Project, и все его задачи (активные и завершённые)', async () => {
    const world = new DeleteProjectTestWorld();
    world.seedProject(existingProject());
    world.taskStorage.seedTask(
      existingTask({ id: uuid('40'), projectId: uuid('1'), sectionId: null, status: 'active' }),
    );
    world.taskStorage.seedTask(
      existingTask({
        id: uuid('41'),
        projectId: uuid('1'),
        sectionId: null,
        status: 'completed',
        completedAt: NOW.subtract({ hours: 1 }),
        completionKind: 'done',
      }),
    );

    const result = await deleteProjectAndTasksCommand({ id: uuid('1') }, deps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedTaskCount).toBe(2);
    expect(result.taskFailures).toHaveLength(0);
    expect(result.project.deletedAt).toEqual(NOW);

    const task1 = await world.taskStorage.tasks.findById(uuid('40'));
    const task2 = await world.taskStorage.tasks.findById(uuid('41'));
    expect(task1?.deletedAt).toEqual(NOW);
    expect(task2?.deletedAt).toEqual(NOW);
  });

  it('несуществующий проект — not_found', async () => {
    const world = new DeleteProjectTestWorld();

    const result = await deleteProjectAndTasksCommand({ id: uuid('404') }, deps(world));

    expect(result).toEqual({ status: 'not_found' });
  });
});
