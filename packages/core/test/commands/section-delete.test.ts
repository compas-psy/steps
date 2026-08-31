import { describe, expect, it } from 'vitest';

import { deleteSectionCommand, type DeleteSectionDeps } from '../../src/commands/section-delete.js';
import type {
  CommandSectionDomainMutation,
  CommandSectionStoragePort,
  CommandSectionWriteTransaction,
} from '../../src/commands/section-port.js';
import type { CommandProjectTaskReader } from '../../src/commands/project-port.js';
import type { Section } from '../../src/entities/section.js';
import type { TaskStatus } from '../../src/entities/task.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import { initialRank } from '../../src/order/index.js';
import type { Uuid } from '../../src/values.js';
import { DEVICE_ID, NOW, existingTask, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

/**
 * «Без раздела» — решение владельца (см. историю `section-delete.ts`):
 * Вариант 1, `sectionId: null`, не отдельная запись. Этот тестовый мир —
 * тот же приём "test world", что `project-delete.test.ts`: Section в своей
 * `Map`, Task делегирован готовому `InMemoryCommandStoragePort` (реальная
 * команда действительно вызывает `updateTaskCommand` поверх того же
 * хранилища, которое `taskReader.listByProjectSection` обязано видеть
 * согласованно).
 */
class DeleteSectionTestWorld {
  private readonly sectionsById = new Map<Uuid, Section>();
  private readonly sectionOutbox: SyncOutboxEntry[] = [];

  readonly taskStorage = new InMemoryCommandStoragePort();

  readonly sectionStorage: CommandSectionStoragePort = {
    sections: {
      findById: (id: Uuid): Promise<Section | null> =>
        Promise.resolve(this.sectionsById.get(id) ?? null),
      listByProject: (projectId: Uuid): Promise<readonly Section[]> =>
        Promise.resolve(
          [...this.sectionsById.values()].filter(
            (section) => section.projectId === projectId && section.deletedAt === null,
          ),
        ),
    },
    runTransaction: async <T>(
      run: (tx: CommandSectionWriteTransaction) => Promise<T>,
    ): Promise<T> => {
      const tx: CommandSectionWriteTransaction = {
        applyMutation: (mutation: CommandSectionDomainMutation): Promise<void> => {
          for (const write of mutation.writes) this.sectionsById.set(write.value.id, write.value);
          this.sectionOutbox.push(...mutation.outbox);
          return Promise.resolve();
        },
      };
      return run(tx);
    },
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

  seedSection(section: Section): void {
    this.sectionsById.set(section.id, section);
  }

  outboxEntries(): readonly SyncOutboxEntry[] {
    return this.sectionOutbox;
  }
}

function existingSection(overrides: Partial<Section> = {}): Section {
  const base: Section = {
    id: uuid('1'),
    projectId: uuid('100'),
    title: 'В работе',
    rank: initialRank(),
    deletedAt: null,
    clocks: {},
  };
  return { ...base, ...overrides };
}

function deps(world: DeleteSectionTestWorld): DeleteSectionDeps {
  return {
    storage: world.sectionStorage,
    tasks: world.taskReader,
    taskCommandStorage: world.taskStorage,
    now: NOW,
    deviceId: DEVICE_ID,
  };
}

describe('deleteSectionCommand («Без раздела» = sectionId:null, решение владельца)', () => {
  it('переносит активные и завершённые задачи секции в sectionId:null, tombstone секции', async () => {
    const world = new DeleteSectionTestWorld();
    world.seedSection(existingSection());
    world.taskStorage.seedTask(
      existingTask({
        id: uuid('10'),
        projectId: uuid('100'),
        sectionId: uuid('1'),
        status: 'active',
      }),
    );
    world.taskStorage.seedTask(
      existingTask({
        id: uuid('11'),
        projectId: uuid('100'),
        sectionId: uuid('1'),
        status: 'completed',
        completedAt: NOW.subtract({ hours: 1 }),
        completionKind: 'done',
      }),
    );

    const result = await deleteSectionCommand({ id: uuid('1') }, deps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedTaskIds.toSorted()).toEqual([uuid('10'), uuid('11')].toSorted());
    expect(result.taskFailures).toHaveLength(0);
    expect(result.section.deletedAt).toEqual(NOW);

    const active = await world.taskStorage.tasks.findById(uuid('10'));
    const completed = await world.taskStorage.tasks.findById(uuid('11'));
    expect(active?.sectionId).toBeNull();
    expect(completed?.sectionId).toBeNull();
    // Проект/captureState не тронуты — это перенос внутри проекта, не в
    // Inbox (в отличие от `deleteProjectKeepingTasksCommand`).
    expect(active?.projectId).toBe(uuid('100'));
    expect(active?.captureState).toBe(existingTask().captureState);
  });

  it('rank задач не пересчитывается при переносе — сохраняется как был', async () => {
    const world = new DeleteSectionTestWorld();
    world.seedSection(existingSection());
    const rankBefore = initialRank();
    world.taskStorage.seedTask(
      existingTask({
        id: uuid('20'),
        projectId: uuid('100'),
        sectionId: uuid('1'),
        status: 'active',
        rank: rankBefore,
      }),
    );

    await deleteSectionCommand({ id: uuid('1') }, deps(world));

    const moved = await world.taskStorage.tasks.findById(uuid('20'));
    expect(moved?.rank).toBe(rankBefore);
  });

  it('задачи вне секции (другая секция/другой проект) не тронуты', async () => {
    const world = new DeleteSectionTestWorld();
    world.seedSection(existingSection());
    world.taskStorage.seedTask(
      existingTask({
        id: uuid('30'),
        projectId: uuid('100'),
        sectionId: uuid('999'),
        status: 'active',
      }),
    );

    const result = await deleteSectionCommand({ id: uuid('1') }, deps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedTaskIds).toHaveLength(0);

    const untouched = await world.taskStorage.tasks.findById(uuid('30'));
    expect(untouched?.sectionId).toBe(uuid('999'));
  });

  it('пустая секция (без задач) — успешно tombstone, affectedTaskIds пуст', async () => {
    const world = new DeleteSectionTestWorld();
    world.seedSection(existingSection());

    const result = await deleteSectionCommand({ id: uuid('1') }, deps(world));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.affectedTaskIds).toHaveLength(0);
    expect(result.section.deletedAt).toEqual(NOW);
  });

  it('несуществующая секция — not_found', async () => {
    const world = new DeleteSectionTestWorld();

    const result = await deleteSectionCommand({ id: uuid('404') }, deps(world));

    expect(result.status).toBe('not_found');
  });

  it('уже удалённая секция — not_found (идемпотентно, повторный вызов не ошибка сервера)', async () => {
    const world = new DeleteSectionTestWorld();
    world.seedSection(existingSection({ deletedAt: NOW.subtract({ hours: 1 }) }));

    const result = await deleteSectionCommand({ id: uuid('1') }, deps(world));

    expect(result.status).toBe('not_found');
  });

  it('outbox-запись пишется для tombstone секции', async () => {
    const world = new DeleteSectionTestWorld();
    world.seedSection(existingSection());

    await deleteSectionCommand({ id: uuid('1') }, deps(world));

    expect(world.outboxEntries()).toHaveLength(1);
    expect(world.outboxEntries()[0]?.entityId).toBe(uuid('1'));
    expect(world.outboxEntries()[0]?.patchJson).toHaveProperty('deletedAt');
  });
});
