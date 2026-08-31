import { describe, expect, it } from 'vitest';

import {
  describeRestoreSituation,
  restoreTaskCommand,
  type RestoreTaskDeps,
} from '../../src/commands/restore-task.js';
import type {
  CommandProjectDomainMutation,
  CommandProjectStoragePort,
  CommandProjectWriteTransaction,
} from '../../src/commands/project-port.js';
import type { Project } from '../../src/entities/project.js';
import type { Task } from '../../src/entities/task.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import { initialRank } from '../../src/order/index.js';
import type { Uuid } from '../../src/values.js';
import { DEVICE_ID, NOW, existingTask, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

/**
 * "Мир" для `restoreTaskCommand` — тот же приём, что `DeleteProjectTestWorld`
 * (`project-delete.test.ts`): Project в собственной `Map`, Task делегирован
 * уже готовому `InMemoryCommandStoragePort`, потому что команда реально
 * читает/пишет оба хранилища разом (`RestoreTaskDeps`).
 */
class RestoreTaskTestWorld {
  private readonly projectsById = new Map<Uuid, Project>();
  private readonly projectOutbox: SyncOutboxEntry[] = [];
  /** Управляемо тестом «архивный+restore_project поверх лимита 27/28». */
  activeProjectCount = 0;

  readonly taskStorage = new InMemoryCommandStoragePort();

  readonly projectStorage: CommandProjectStoragePort = {
    projects: {
      findById: (id: Uuid): Promise<Project | null> =>
        Promise.resolve(this.projectsById.get(id) ?? null),
      countActiveExcluding: (_excludingId: Uuid | null): Promise<number> =>
        Promise.resolve(this.activeProjectCount),
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

  seedProject(project: Project): void {
    this.projectsById.set(project.id, project);
  }

  findProject(id: Uuid): Project | null {
    return this.projectsById.get(id) ?? null;
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
    createdAt: NOW.subtract({ hours: 2 }),
    updatedAt: NOW.subtract({ hours: 2 }),
    deletedAt: null,
    clocks: {},
  };
  return { ...base, ...overrides };
}

function deps(world: RestoreTaskTestWorld): RestoreTaskDeps {
  return {
    storage: world.taskStorage,
    projectStorage: world.projectStorage,
    now: NOW,
    deviceId: DEVICE_ID,
  };
}

function completedTask(overrides: Partial<Task> = {}): Task {
  return existingTask({
    status: 'completed',
    completedAt: NOW.subtract({ hours: 1 }),
    completionKind: 'done',
    ...overrides,
  } as Partial<Task>);
}

describe('restoreTaskCommand — not_found/not_completed', () => {
  it('несуществующая задача — not_found', async () => {
    const world = new RestoreTaskTestWorld();
    const result = await restoreTaskCommand({ id: uuid('404') }, deps(world));
    expect(result).toEqual({ status: 'not_found' });
  });

  it('активная (не завершённая) задача — not_completed, не найдено-но-неверный-статус', async () => {
    const world = new RestoreTaskTestWorld();
    world.taskStorage.seedTask(existingTask({ id: uuid('1'), status: 'active' }));
    const result = await restoreTaskCommand({ id: uuid('1') }, deps(world));
    expect(result).toEqual({ status: 'not_completed' });
  });
});

describe('restoreTaskCommand — §11.11 нормальная задача, активный проект', () => {
  it('восстанавливает в тот же активный проект: снимает completed, projectId/sectionId не трогает', async () => {
    const world = new RestoreTaskTestWorld();
    world.seedProject(existingProject({ id: uuid('1'), archivedAt: null }));
    world.taskStorage.seedTask(
      completedTask({ id: uuid('10'), projectId: uuid('1'), sectionId: null }),
    );

    const situation = await describeRestoreSituation(uuid('10'), deps(world));
    expect(situation).toEqual({
      status: 'ok',
      recurringBlocked: false,
      hierarchyChoiceRequired: false,
      archivedProjectChoiceRequired: false,
      deletedParentAutoTopLevel: false,
      deletedProjectAutoInbox: false,
    });

    const result = await restoreTaskCommand({ id: uuid('10') }, deps(world));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.status).toBe('active');
    expect(result.tasks[0]?.completedAt).toBeNull();
    expect(result.tasks[0]?.completionKind).toBeNull();
    expect(result.tasks[0]?.projectId).toBe(uuid('1'));
    expect(result.project).toBeNull();
  });

  it('задача без проекта — восстанавливается на месте, без ветвления', async () => {
    const world = new RestoreTaskTestWorld();
    world.taskStorage.seedTask(completedTask({ id: uuid('11'), projectId: null, sectionId: null }));

    const result = await restoreTaskCommand({ id: uuid('11') }, deps(world));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.tasks[0]?.projectId).toBeNull();
  });
});

describe('restoreTaskCommand — §11.11 архивный проект', () => {
  it('без archivedProjectChoice — archived_project_choice_required, ничего не пишет', async () => {
    const world = new RestoreTaskTestWorld();
    world.seedProject(existingProject({ id: uuid('1'), archivedAt: NOW.subtract({ hours: 1 }) }));
    world.taskStorage.seedTask(completedTask({ id: uuid('20'), projectId: uuid('1') }));

    const situation = await describeRestoreSituation(uuid('20'), deps(world));
    expect(situation).toMatchObject({ status: 'ok', archivedProjectChoiceRequired: true });

    const result = await restoreTaskCommand({ id: uuid('20') }, deps(world));
    expect(result).toEqual({ status: 'archived_project_choice_required' });
    const stillCompleted = await world.taskStorage.tasks.findById(uuid('20'));
    expect(stillCompleted?.status).toBe('completed');
  });

  it('«Восстановить проект и задачу» — разархивирует проект, задача остаётся в нём', async () => {
    const world = new RestoreTaskTestWorld();
    world.seedProject(existingProject({ id: uuid('1'), archivedAt: NOW.subtract({ hours: 1 }) }));
    world.taskStorage.seedTask(
      completedTask({ id: uuid('21'), projectId: uuid('1'), sectionId: uuid('5') }),
    );

    const result = await restoreTaskCommand(
      { id: uuid('21'), archivedProjectChoice: 'restore_project', hasProEntitlement: false },
      deps(world),
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.project?.archivedAt).toBeNull();
    expect(world.findProject(uuid('1'))?.archivedAt).toBeNull();
    expect(result.tasks[0]?.projectId).toBe(uuid('1'));
    expect(result.tasks[0]?.sectionId).toBe(uuid('5'));
  });

  it('«Восстановить проект и задачу» поверх лимита 27/28 без Pro — rejected, ничего не меняет', async () => {
    const world = new RestoreTaskTestWorld();
    world.activeProjectCount = 10;
    world.seedProject(existingProject({ id: uuid('1'), archivedAt: NOW.subtract({ hours: 1 }) }));
    world.taskStorage.seedTask(completedTask({ id: uuid('22'), projectId: uuid('1') }));

    const result = await restoreTaskCommand(
      { id: uuid('22'), archivedProjectChoice: 'restore_project', hasProEntitlement: false },
      deps(world),
    );
    expect(result.status).toBe('rejected');
    expect(world.findProject(uuid('1'))?.archivedAt).not.toBeNull();
    const stillCompleted = await world.taskStorage.tasks.findById(uuid('22'));
    expect(stillCompleted?.status).toBe('completed');
  });

  it('«Восстановить во Входящие» — projectId/sectionId → null, captureState → inbox, проект остаётся архивным', async () => {
    const world = new RestoreTaskTestWorld();
    world.seedProject(existingProject({ id: uuid('1'), archivedAt: NOW.subtract({ hours: 1 }) }));
    world.taskStorage.seedTask(
      completedTask({ id: uuid('23'), projectId: uuid('1'), sectionId: uuid('5') }),
    );

    const result = await restoreTaskCommand(
      { id: uuid('23'), archivedProjectChoice: 'restore_to_inbox' },
      deps(world),
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.tasks[0]?.projectId).toBeNull();
    expect(result.tasks[0]?.sectionId).toBeNull();
    expect(result.tasks[0]?.captureState).toBe('inbox');
    expect(result.project).toBeNull();
    expect(world.findProject(uuid('1'))?.archivedAt).not.toBeNull();
  });
});

describe('restoreTaskCommand — §11.11 удалённый (tombstone) проект', () => {
  it('автоматически восстанавливает во Входящие, снимок имени проекта сохранён', async () => {
    const world = new RestoreTaskTestWorld();
    world.seedProject(existingProject({ id: uuid('1'), deletedAt: NOW.subtract({ hours: 1 }) }));
    world.taskStorage.seedTask(
      completedTask({
        id: uuid('30'),
        projectId: uuid('1'),
        sectionId: uuid('5'),
        originalProjectNameSnapshot: 'Старый проект',
      }),
    );

    const situation = await describeRestoreSituation(uuid('30'), deps(world));
    expect(situation).toMatchObject({ status: 'ok', deletedProjectAutoInbox: true });

    // Без явного выбора — восстанавливается автоматически (не блокирует, в
    // отличие от архивного): "restore top-level into Inbox" не альтернатива,
    // единственный путь.
    const result = await restoreTaskCommand({ id: uuid('30') }, deps(world));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.tasks[0]?.projectId).toBeNull();
    expect(result.tasks[0]?.sectionId).toBeNull();
    expect(result.tasks[0]?.captureState).toBe('inbox');
    expect(result.tasks[0]?.originalProjectNameSnapshot).toBe('Старый проект');
  });
});

describe('restoreTaskCommand — §11.11 Parent+Subtask оба завершены', () => {
  it('без hierarchyChoice — hierarchy_choice_required, ничего не пишет (блокирует "active child under completed Parent")', async () => {
    const world = new RestoreTaskTestWorld();
    world.taskStorage.seedTask(
      completedTask({ id: uuid('40'), parentTaskId: null, captureState: 'processed' }),
    );
    world.taskStorage.seedTask(
      completedTask({ id: uuid('41'), parentTaskId: uuid('40'), captureState: 'processed' }),
    );

    const situation = await describeRestoreSituation(uuid('41'), deps(world));
    expect(situation).toMatchObject({ status: 'ok', hierarchyChoiceRequired: true });

    const result = await restoreTaskCommand({ id: uuid('41') }, deps(world));
    expect(result).toEqual({ status: 'hierarchy_choice_required' });

    const parent = await world.taskStorage.tasks.findById(uuid('40'));
    const child = await world.taskStorage.tasks.findById(uuid('41'));
    expect(parent?.status).toBe('completed');
    expect(child?.status).toBe('completed');
  });

  it('«Восстановить родительскую и подзадачу» — обе становятся active одной операцией, child остаётся child', async () => {
    const world = new RestoreTaskTestWorld();
    world.taskStorage.seedTask(
      completedTask({ id: uuid('42'), parentTaskId: null, captureState: 'processed' }),
    );
    world.taskStorage.seedTask(
      completedTask({ id: uuid('43'), parentTaskId: uuid('42'), captureState: 'processed' }),
    );

    const result = await restoreTaskCommand(
      { id: uuid('43'), hierarchyChoice: 'restore_pair' },
      deps(world),
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    // Порядок фиксирован: родитель первым (см. заголовок `restore-task.ts`).
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0]?.id).toBe(uuid('42'));
    expect(result.tasks[1]?.id).toBe(uuid('43'));
    expect(result.tasks[0]?.status).toBe('active');
    expect(result.tasks[1]?.status).toBe('active');
    expect(result.tasks[1]?.parentTaskId).toBe(uuid('42'));

    // Одна атомарная запись — один вызов `applyMutation` с двумя outbox-записями.
    const outbox = world.taskStorage.outboxEntries();
    expect(
      outbox.filter((entry) => entry.entityId === uuid('42') || entry.entityId === uuid('43')),
    ).toHaveLength(2);
  });

  it('«Создать отдельную задачу» — subtask top-level, parent НЕ тронут (остаётся completed)', async () => {
    const world = new RestoreTaskTestWorld();
    world.taskStorage.seedTask(
      completedTask({ id: uuid('44'), parentTaskId: null, captureState: 'processed' }),
    );
    world.taskStorage.seedTask(
      completedTask({ id: uuid('45'), parentTaskId: uuid('44'), captureState: 'processed' }),
    );

    const result = await restoreTaskCommand(
      { id: uuid('45'), hierarchyChoice: 'restore_as_separate_task' },
      deps(world),
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.id).toBe(uuid('45'));
    expect(result.tasks[0]?.parentTaskId).toBeNull();
    expect(result.tasks[0]?.status).toBe('active');

    const parent = await world.taskStorage.tasks.findById(uuid('44'));
    expect(parent?.status).toBe('completed');
  });

  it('parent завершён, но родитель passed через hierarchyChoice=restore_pair не бьёт "active child under completed Parent", потому что parent тоже становится active', async () => {
    const world = new RestoreTaskTestWorld();
    world.taskStorage.seedTask(completedTask({ id: uuid('46'), parentTaskId: null }));
    world.taskStorage.seedTask(completedTask({ id: uuid('47'), parentTaskId: uuid('46') }));

    const result = await restoreTaskCommand(
      { id: uuid('47'), hierarchyChoice: 'restore_pair' },
      deps(world),
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const parent = result.tasks.find((task) => task.id === uuid('46'));
    const child = result.tasks.find((task) => task.id === uuid('47'));
    // По построению никогда не бывает: child active + parent completed.
    expect(parent?.status).toBe('active');
    expect(child?.status).toBe('active');
  });
});

describe('restoreTaskCommand — §11.11 subtask под активным родителем (не требует выбора)', () => {
  it('нормально восстанавливается как child — родитель уже active, выбор не нужен', async () => {
    const world = new RestoreTaskTestWorld();
    world.taskStorage.seedTask(
      existingTask({ id: uuid('48'), parentTaskId: null, status: 'active' }),
    );
    world.taskStorage.seedTask(
      completedTask({ id: uuid('49'), parentTaskId: uuid('48'), captureState: 'processed' }),
    );

    const situation = await describeRestoreSituation(uuid('49'), deps(world));
    expect(situation).toMatchObject({ status: 'ok', hierarchyChoiceRequired: false });

    const result = await restoreTaskCommand({ id: uuid('49') }, deps(world));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.parentTaskId).toBe(uuid('48'));
    expect(result.tasks[0]?.status).toBe('active');
  });
});

describe('restoreTaskCommand — §11.11 Parent удалён (tombstone)', () => {
  it('subtask восстанавливается как top-level автоматически, без выбора', async () => {
    const world = new RestoreTaskTestWorld();
    world.taskStorage.seedTask(
      existingTask({
        id: uuid('50'),
        parentTaskId: null,
        status: 'active',
        deletedAt: NOW.subtract({ hours: 1 }),
      }),
    );
    world.taskStorage.seedTask(
      completedTask({ id: uuid('51'), parentTaskId: uuid('50'), captureState: 'processed' }),
    );

    const situation = await describeRestoreSituation(uuid('51'), deps(world));
    expect(situation).toMatchObject({ status: 'ok', deletedParentAutoTopLevel: true });

    const result = await restoreTaskCommand({ id: uuid('51') }, deps(world));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.parentTaskId).toBeNull();
    expect(result.tasks[0]?.status).toBe('active');
  });
});

describe('restoreTaskCommand — §11.10 recurring без next occurrence', () => {
  it('обычное восстановление — снимает completed, seriesId остаётся', async () => {
    const world = new RestoreTaskTestWorld();
    const seriesId = uuid('900');
    world.taskStorage.seedTask(
      completedTask({
        id: uuid('60'),
        parentTaskId: null,
        seriesId,
        occurrenceSeq: 3n,
        generatedFromOccurrenceId: null,
      }),
    );

    const situation = await describeRestoreSituation(uuid('60'), deps(world));
    expect(situation).toMatchObject({ status: 'ok', recurringBlocked: false });

    const result = await restoreTaskCommand({ id: uuid('60') }, deps(world));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.tasks[0]?.status).toBe('active');
    expect(result.tasks[0]?.seriesId).toBe(seriesId);
  });
});

describe('restoreTaskCommand — §11.10 recurring с next occurrence: "no normal restore"', () => {
  it('обычное восстановление заблокировано — recurring_next_exists, ничего не пишет', async () => {
    const world = new RestoreTaskTestWorld();
    const seriesId = uuid('901');
    world.taskStorage.seedTask(
      completedTask({ id: uuid('70'), parentTaskId: null, seriesId, occurrenceSeq: 3n }),
    );
    // Next occurrence уже существует и активен.
    world.taskStorage.seedTask(
      existingTask({
        id: uuid('71'),
        parentTaskId: null,
        status: 'active',
        seriesId,
        occurrenceSeq: 4n,
        generatedFromOccurrenceId: uuid('70'),
      }),
    );

    const situation = await describeRestoreSituation(uuid('70'), deps(world));
    expect(situation).toMatchObject({ status: 'ok', recurringBlocked: true });

    const result = await restoreTaskCommand({ id: uuid('70') }, deps(world));
    expect(result).toEqual({ status: 'recurring_next_exists' });

    const stillCompleted = await world.taskStorage.tasks.findById(uuid('70'));
    expect(stillCompleted?.status).toBe('completed');
  });

  it('«Создать отдельную копию» — создаёт новую НЕ recurring задачу, исходный occurrence остаётся completed', async () => {
    const world = new RestoreTaskTestWorld();
    const seriesId = uuid('902');
    world.taskStorage.seedTask(
      completedTask({
        id: uuid('72'),
        parentTaskId: null,
        seriesId,
        occurrenceSeq: 3n,
        title: 'Полить цветы',
        projectId: null,
        plannedDate: null,
      }),
    );
    world.taskStorage.seedTask(
      existingTask({
        id: uuid('73'),
        parentTaskId: null,
        status: 'active',
        seriesId,
        occurrenceSeq: 4n,
        generatedFromOccurrenceId: uuid('72'),
      }),
    );

    const result = await restoreTaskCommand({ id: uuid('72'), action: 'create_copy' }, deps(world));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.tasks).toHaveLength(1);
    const copy = result.tasks[0];
    expect(copy?.id).not.toBe(uuid('72'));
    expect(copy?.title).toBe('Полить цветы');
    expect(copy?.seriesId).toBeNull();
    expect(copy?.occurrenceSeq).toBeNull();
    expect(copy?.status).toBe('active');

    // Исходный occurrence не тронут — остаётся completed, историческая копия.
    const original = await world.taskStorage.tasks.findById(uuid('72'));
    expect(original?.status).toBe('completed');
  });
});

describe('restoreTaskCommand — action:"create_copy" на не-recurring задаче', () => {
  it('not_recurring — копия имеет смысл только у recurring occurrence', async () => {
    const world = new RestoreTaskTestWorld();
    world.taskStorage.seedTask(completedTask({ id: uuid('80'), seriesId: null }));

    const result = await restoreTaskCommand({ id: uuid('80'), action: 'create_copy' }, deps(world));
    expect(result).toEqual({ status: 'not_recurring' });
  });
});
