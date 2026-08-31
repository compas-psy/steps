import type { Temporal } from '@js-temporal/polyfill';

import type { Project } from '../entities/project.js';
import type { Task } from '../entities/task.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import type { ValidationResult } from '../validation/types.js';
import type { Uuid } from '../values.js';
import { deleteTaskCommand } from './delete-task.js';
import { updateTaskCommand } from './update-task.js';
import type { CommandStoragePort } from './storage-port.js';
import type { TaskCommandDeps } from './types.js';
import { listAllProjectTasks } from './project-archive.js';
import {
  buildPatchJson,
  diffChangedFields,
  pickClocks,
  tickClocks,
} from './project-section-clock.js';
import type {
  CommandProjectDomainMutation,
  CommandProjectEntityWrite,
  CommandProjectStoragePort,
  CommandProjectTaskReader,
} from './project-port.js';
import { PROJECT_MUTABLE_FIELDS, UNGATED_PROJECT_ORIGIN } from './project-port.js';
import type { CommandSectionReader } from './section-port.js';

/**
 * Зависимости обеих permanent-delete команд. Помимо чтения/записи Project
 * (`CommandProjectStoragePort`) и обхода задач проекта (`sections`/`tasks`,
 * тот же приём, что `project-archive.ts`), нужен полноценный
 * `CommandStoragePort` (`storage-port.ts`, Task) — обе команды делегируют
 * per-task работу уже готовым `updateTaskCommand`/`deleteTaskCommand`
 * (задание: "это патч через уже существующий updateTaskCommand... ПОТОМ
 * жёсткое tombstone-удаление самого Project" / "deleteTaskCommand, уже
 * готов, на каждую"), не переизобретают запись Task заново.
 */
export interface DeleteProjectDeps {
  readonly storage: CommandProjectStoragePort;
  readonly sections: CommandSectionReader;
  readonly tasks: CommandProjectTaskReader;
  readonly taskCommandStorage: CommandStoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
  readonly generateId?: () => Uuid;
  readonly generateOpId?: () => Uuid;
}

/**
 * `ok` несёт число реально задетых задач (перенесённых/удалённых) —
 * наблюдаемость для теста и будущего UI-тоста, не дословно из спеки, но не
 * противоречит ей. `taskFailures` — задачи, которые `updateTaskCommand`/
 * `deleteTaskCommand` отклонили (пусто в нормальном ходе — см. комментарий
 * `deleteProjectKeepingTasksCommand` про инвариант правила 9); непустым
 * список делает частичный сбой видимым вызывающему коду вместо того, чтобы
 * молча проглотить его и всё равно tombstone-нуть Project поверх
 * незаконченной миграции задач.
 */
export type DeleteProjectResult =
  | {
      readonly status: 'ok';
      readonly project: Project;
      readonly affectedTaskCount: number;
      readonly taskFailures: readonly Uuid[];
    }
  | { readonly status: 'not_found' }
  | { readonly status: 'rejected'; readonly validation: ValidationResult };

/** Та же дисциплина, что `validateUnchangedProject` (`project-archive.ts`)
 * — permanent delete не трогает title/description Project, но всё равно
 * идёт через единую точку входа валидатора (CLAUDE.md, «Один валидатор на
 * все инварианты»); негейтящийся `origin` — tombstone не меняет число
 * активных проектов (проект к этому моменту уже архивный по UI-флоу, но
 * эта команда, как и её соседи, не проверяет "уже архивный" — см.
 * комментарий ниже). */
function validateUnchangedProject(project: Project): ValidationResult {
  return validateDomainMutation({
    entity: 'project',
    data: { title: project.title, description: project.description },
    context: {
      origin: UNGATED_PROJECT_ORIGIN,
      activeProjectCountExcludingThis: 0,
      hasProEntitlement: false,
    },
  });
}

async function tombstoneProject(
  current: Project,
  deps: Pick<DeleteProjectDeps, 'storage' | 'now' | 'deviceId' | 'generateOpId'>,
): Promise<Project> {
  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const nextProject: Project = { ...current, deletedAt: deps.now, updatedAt: deps.now };
  const changedFields = diffChangedFields(current, nextProject, PROJECT_MUTABLE_FIELDS);
  const finalProject: Project = {
    ...nextProject,
    clocks: tickClocks(current.clocks, changedFields, hlc),
  };

  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'project',
    entityId: finalProject.id,
    patchJson: buildPatchJson(finalProject, changedFields),
    fieldClocksJson: pickClocks(finalProject.clocks, changedFields),
    baseRevision: 0n,
    createdAt: deps.now,
    retryCount: 0,
  };
  const write: CommandProjectEntityWrite = { entity: 'project', value: finalProject };
  const mutation: CommandProjectDomainMutation = { writes: [write], outbox: [outboxEntry] };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return finalProject;
}

/** Все задачи проекта, оба статуса (`active` + `completed`) — permanent
 * delete затрагивает "все задачи проекта" дословно (`01§12`: "у всех задач
 * проекта: project_id: null, section_id: null, capture_state=inbox" /
 * "Удалить проект и задачи" без оговорки "только активные") — в отличие от
 * архивации (`archiveProjectCommand`), которая по спеке отменяет
 * напоминания только "active tasks in that Project". */
async function listAllTasksBothStatuses(
  projectId: Uuid,
  sections: CommandSectionReader,
  tasks: CommandProjectTaskReader,
): Promise<readonly Task[]> {
  const active = await listAllProjectTasks(projectId, 'active', sections, tasks);
  const completed = await listAllProjectTasks(projectId, 'completed', sections, tasks);
  return [...active, ...completed];
}

/**
 * `exactOptionalPropertyTypes` (`tsconfig.json`) запрещает присвоить
 * `undefined` полю, объявленному как `?: () => Uuid` (без явного
 * `| undefined` в типе) — значит ключ вообще нельзя включать в объект,
 * если исходное значение не задано, а не просто присвоить ему `undefined`.
 */
function buildTaskCommandDeps(deps: DeleteProjectDeps): TaskCommandDeps {
  return {
    storage: deps.taskCommandStorage,
    now: deps.now,
    deviceId: deps.deviceId,
    ...(deps.generateId !== undefined ? { generateId: deps.generateId } : {}),
    ...(deps.generateOpId !== undefined ? { generateOpId: deps.generateOpId } : {}),
  };
}

// --- Путь 1: «Переместить задачи во Входящие» -----------------------------------

/**
 * `Переместить задачи во Входящие` (`01§12` "Permanent delete archived
 * project", опция 1) → у всех задач проекта: `projectId: null,
 * sectionId: null, captureState: 'inbox'`, ПОТОМ tombstone самого Project.
 *
 * Одно исключение из "всех задач", не выдуманное здесь, а взятое дословно
 * из соседнего правила той же спеки (`01§12` "Parent/Subtask project
 * moves": "moving top-level Task to Inbox clears Project/Section and sets
 * Parent capture_state=inbox; attached Subtasks remain processed") —
 * перенос top-level задачи во Входящие ровно то, что здесь происходит для
 * каждой top-level задачи проекта, и спека прямо говорит, что её прямые
 * Subtasks (`parentTaskId !== null`) остаются `processed`, не `inbox`.
 * Полный каскад Parent→Subtasks (единая транзакция, детач-confirm) вне
 * этого пакета работ (задание, раздел «НЕ входит»), но эта конкретная
 * микро-инструкция — нет: без неё каждый subtask поймал бы правило 9
 * ("дочерняя задача обязана быть processed") и `updateTaskCommand` отклонил
 * бы его, оставив недоделанную миграцию. Поэтому: top-level задачи получают
 * `captureState:'inbox'`, subtasks — только `projectId:null,
 * sectionId:null` (сохраняя `processed`).
 *
 * Задачи обрабатываются **последовательно**, не `Promise.all` — тот же
 * компромисс, что `archiveProjectCommand` документирует для отмены
 * напоминаний (нет batch-примитива в `@shagi/storage`, реальные адаптеры
 * всё равно сериализуют запись, детерминированный порядок упрощает
 * отладку частичного сбоя).
 */
export async function deleteProjectKeepingTasksCommand(
  input: { readonly id: Uuid },
  deps: DeleteProjectDeps,
): Promise<DeleteProjectResult> {
  const current = await deps.storage.projects.findById(input.id);
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const validation = validateUnchangedProject(current);
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const projectTasks = await listAllTasksBothStatuses(current.id, deps.sections, deps.tasks);
  const taskDeps = buildTaskCommandDeps(deps);

  let affectedTaskCount = 0;
  const taskFailures: Uuid[] = [];
  for (const task of projectTasks) {
    const result = await updateTaskCommand(
      {
        id: task.id,
        patch:
          task.parentTaskId === null
            ? { projectId: null, sectionId: null, captureState: 'inbox' }
            : { projectId: null, sectionId: null },
      },
      taskDeps,
    );
    if (result.status === 'ok') {
      affectedTaskCount += 1;
    } else {
      taskFailures.push(task.id);
    }
  }

  const finalProject = await tombstoneProject(current, deps);

  return { status: 'ok', project: finalProject, affectedTaskCount, taskFailures };
}

// --- Путь 2: «Удалить проект и задачи» -------------------------------------------

/**
 * `Удалить проект и задачи` (`01§12` "Permanent delete archived project",
 * опция 2) → tombstone и Project, и все его задачи (`deleteTaskCommand`,
 * уже готов, на каждую). Все статусы, оба уровня иерархии — деструктивный
 * путь без исключений подобных пути 1: `deleteTaskCommand` не трогает
 * `captureState`, поэтому у subtasks нет инварианта, который здесь можно
 * было бы нарушить.
 *
 * "Completed task history keeps project-name snapshot after project
 * deletion" (`01§12`) не требует отдельной логики здесь —
 * `originalProjectNameSnapshot` (`entities/task.ts`) уже проставляется
 * `createTaskCommand` **в момент создания задачи**, не в момент удаления
 * проекта (см. отчёт пакета работ). Tombstone задачи не трогает это поле.
 */
export async function deleteProjectAndTasksCommand(
  input: { readonly id: Uuid },
  deps: DeleteProjectDeps,
): Promise<DeleteProjectResult> {
  const current = await deps.storage.projects.findById(input.id);
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const validation = validateUnchangedProject(current);
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const projectTasks = await listAllTasksBothStatuses(current.id, deps.sections, deps.tasks);
  const taskDeps = buildTaskCommandDeps(deps);

  let affectedTaskCount = 0;
  const taskFailures: Uuid[] = [];
  for (const task of projectTasks) {
    const result = await deleteTaskCommand({ id: task.id }, taskDeps);
    if (result.status === 'ok') {
      affectedTaskCount += 1;
    } else {
      taskFailures.push(task.id);
    }
  }

  const finalProject = await tombstoneProject(current, deps);

  return { status: 'ok', project: finalProject, affectedTaskCount, taskFailures };
}
