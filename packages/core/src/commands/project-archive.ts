import type { Temporal } from '@js-temporal/polyfill';

import type { Project } from '../entities/project.js';
import type { Task, TaskStatus } from '../entities/task.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import type { ValidationResult } from '../validation/types.js';
import type { Uuid } from '../values.js';
import { cancelReminderCommand } from './reminder-cancel.js';
import type { CommandReminderStoragePort, ReminderCommandDeps } from './reminder-port.js';
import {
  buildPatchJson,
  diffChangedFields,
  pickClocks,
  tickClocks,
} from './project-section-clock.js';
import type {
  CommandProjectDomainMutation,
  CommandProjectEntityWrite,
  CommandProjectReminderReader,
  CommandProjectStoragePort,
  CommandProjectTaskReader,
  ProjectCommandDeps,
} from './project-port.js';
import { PROJECT_MUTABLE_FIELDS, UNGATED_PROJECT_ORIGIN } from './project-port.js';
import type { CommandSectionReader } from './section-port.js';

/**
 * Обход всех задач проекта вне зависимости от секции. У реального
 * `TaskRepository` (`packages/storage`) нет метода "все задачи проекта" —
 * только `listByProjectSection(projectId, sectionId, status)`, секция за
 * раз (см. комментарий `CommandProjectTaskReader`, `project-port.ts`).
 * Поэтому: перечислить живые секции проекта (`sections.listByProject`),
 * добавить `null` (задачи без секции — `TaskProjectPlacement`,
 * `entities/task.ts`), и вызвать `listByProjectSection` на каждую — N+1
 * запросов, где N — число секций проекта. Тот же компромисс, что уже
 * принят заданием для отмены напоминаний ниже: последовательно, не
 * `Promise.all` (см. комментарий `archiveProjectCommand`).
 */
export async function listAllProjectTasks(
  projectId: Uuid,
  status: TaskStatus,
  sections: CommandSectionReader,
  tasks: CommandProjectTaskReader,
): Promise<readonly Task[]> {
  const liveSections = await sections.listByProject(projectId);
  const sectionIds: readonly (Uuid | null)[] = [null, ...liveSections.map((section) => section.id)];

  const collected: Task[] = [];
  for (const sectionId of sectionIds) {
    const found = await tasks.listByProjectSection(projectId, sectionId, status);
    collected.push(...found);
  }
  return collected;
}

/** Прогоняет неизменные title/description Project через `validateProject`
 * — та же дисциплина, что `deleteTaskCommand` (`delete-task.ts`) применяет
 * к Task: мягкая мутация, не трогающая ни одно из проверяемых полей, всё
 * равно идёт через единую точку входа валидатора, чтобы проверка не стала
 * опциональной для одной из команд по недосмотру (CLAUDE.md, «Один
 * валидатор на все инварианты»). `origin`/`activeProjectCountExcludingThis`
 * — как у `updateProjectCommand`: архивация уменьшает число активных
 * проектов, гейт 27/28 не может здесь сработать по построению. */
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

interface TickedProject {
  readonly project: Project;
  readonly changedFields: readonly (typeof PROJECT_MUTABLE_FIELDS)[number][];
}

function tickProject(
  current: Project,
  next: Project,
  now: Temporal.Instant,
  deviceId: Uuid,
): TickedProject {
  const hlc = { physical: now, logical: 0, deviceId };
  const changedFields = diffChangedFields(current, next, PROJECT_MUTABLE_FIELDS);
  return {
    project: { ...next, clocks: tickClocks(current.clocks, changedFields, hlc) },
    changedFields,
  };
}

async function writeProject(
  ticked: TickedProject,
  storage: CommandProjectStoragePort,
  now: Temporal.Instant,
  deviceId: Uuid,
  generateOpId: () => Uuid,
): Promise<void> {
  const { project: finalProject, changedFields } = ticked;
  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId,
    entityType: 'project',
    entityId: finalProject.id,
    patchJson: buildPatchJson(finalProject, changedFields),
    fieldClocksJson: pickClocks(finalProject.clocks, changedFields),
    baseRevision: 0n,
    createdAt: now,
    retryCount: 0,
  };
  const write: CommandProjectEntityWrite = { entity: 'project', value: finalProject };
  const mutation: CommandProjectDomainMutation = { writes: [write], outbox: [outboxEntry] };
  await storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });
}

// --- Archive -------------------------------------------------------------------

export interface ArchiveProjectInput {
  readonly id: Uuid;
}

/**
 * Зависимости `archiveProjectCommand` — шире, чем `ProjectCommandDeps`
 * (create/update): архивация обязана отменить напоминания активных задач
 * проекта (`01§12` "Archiving immediately cancels/suppresses all future
 * explicit/deadline notifications belonging to active tasks in that
 * Project"), а для этого нужен доступ к трём вещам, которых нет в обычном
 * `ProjectCommandDeps`:
 *
 *  - `sections`/`tasks` — перечислить активные задачи проекта
 *    (`listAllProjectTasks` выше);
 *  - `reminders` — узнать включённые напоминания каждой задачи
 *    (`ReminderRepository.listByTask`, `CommandProjectReminderReader`);
 *  - `reminderStorage` — построить `ReminderCommandDeps` для вызова уже
 *    готового `cancelReminderCommand` (`reminder-cancel.ts`, E08.1).
 *
 * `nowLocal` нужен только потому, что `ReminderCommandDeps` его требует
 * (`reminder-port.ts`) — `cancelReminderCommand` его фактически не читает
 * (только `writeReminder` читает `now`/`deviceId`/`generateOpId`), но форма
 * зависимостей не различает "нужно по факту" и "нужно по контракту типа";
 * вызывающий код обязан передать значение, согласованное с `now` (то же
 * требование, что уже документирует `reminder-port.ts`).
 */
export interface ArchiveProjectDeps {
  readonly storage: CommandProjectStoragePort;
  readonly sections: CommandSectionReader;
  readonly tasks: CommandProjectTaskReader;
  readonly reminders: CommandProjectReminderReader;
  readonly reminderStorage: CommandReminderStoragePort;
  readonly now: Temporal.Instant;
  readonly nowLocal: Temporal.PlainDateTime;
  readonly deviceId: Uuid;
  readonly generateOpId?: () => Uuid;
}

/**
 * Итог архивации. `hadActiveTasks` — прямой ответ на «должен ли UI
 * спросить подтверждение» (`01§12` "If active tasks exist, confirm" —
 * подтверждение UI-забота, но команда обязана дать материал для решения,
 * задание, раздел Archive/Unarchive). `cancelledReminderCount` — сколько
 * включённых напоминаний реально отменено (наблюдаемость для теста и
 * будущего UI-тоста), не входит в спеку дословно, но не противоречит ей.
 */
export type ArchiveProjectResult =
  | {
      readonly status: 'ok';
      readonly project: Project;
      readonly hadActiveTasks: boolean;
      readonly cancelledReminderCount: number;
    }
  | { readonly status: 'already_archived' }
  | { readonly status: 'not_found' }
  | { readonly status: 'rejected'; readonly validation: ValidationResult };

/**
 * Архивация Project (`01§12` "Archive project"). Идемпотентна:
 * уже-архивный проект → `already_archived` (та же конвенция, что
 * `cancelReminderCommand` → `already_cancelled`), не ошибка.
 *
 * Отмена напоминаний — **последовательно**, не `Promise.all`: то же
 * решение, что уже применяет `Today.tsx` для bulk-действий (задание,
 * раздел Archive/Unarchive, явно указывает на этот прецедент). Причина не
 * только консервативность — три вложенных источника недетерминизма делают
 * параллельный вариант не быстрее на деле и труднее для тестирования:
 * (1) `cancelReminderCommand` сам открывает отдельную `runTransaction` на
 * каждый вызов (нет батч-примитива в `@shagi/storage`, задание прямо
 * запрещает его придумывать здесь); (2) реальные адаптеры SQLite/IndexedDB
 * почти наверняка сериализуют запись независимо от того, ждёт ли вызывающий
 * код `Promise.all` или `for`-цикл — выигрыша в быстродействии не будет,
 * будет только more сложная отладка порядка при частичном сбое;
 * (3) детерминированный порядок отмены (по задачам, затем по напоминаниям
 * задачи) упрощает тестирование и логи. Цена: O(число активных задач ×
 * напоминаний на задачу) последовательных `await` на одну архивацию — при
 * проекте с сотнями задач это заметно медленнее одного batch-запроса,
 * которого не существует; задокументированный компромисс, не забытая
 * оптимизация.
 */
export async function archiveProjectCommand(
  input: ArchiveProjectInput,
  deps: ArchiveProjectDeps,
): Promise<ArchiveProjectResult> {
  const current = await deps.storage.projects.findById(input.id);
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }
  if (current.archivedAt !== null) {
    return { status: 'already_archived' };
  }

  const validation = validateUnchangedProject(current);
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const activeTasks = await listAllProjectTasks(current.id, 'active', deps.sections, deps.tasks);

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const reminderDeps: ReminderCommandDeps = {
    storage: deps.reminderStorage,
    now: deps.now,
    nowLocal: deps.nowLocal,
    deviceId: deps.deviceId,
    generateOpId,
  };

  let cancelledReminderCount = 0;
  for (const task of activeTasks) {
    const taskReminders = await deps.reminders.listByTask(task.id);
    for (const reminder of taskReminders) {
      if (!reminder.enabled) {
        continue;
      }
      const cancelled = await cancelReminderCommand({ reminder }, reminderDeps);
      if (cancelled.status === 'ok') {
        cancelledReminderCount += 1;
      }
    }
  }

  const nextProject: Project = { ...current, archivedAt: deps.now, updatedAt: deps.now };
  const ticked = tickProject(current, nextProject, deps.now, deps.deviceId);
  await writeProject(ticked, deps.storage, deps.now, deps.deviceId, generateOpId);

  return {
    status: 'ok',
    project: ticked.project,
    hadActiveTasks: activeTasks.length > 0,
    cancelledReminderCount,
  };
}

// --- Unarchive -------------------------------------------------------------------

export interface UnarchiveProjectInput {
  readonly id: Uuid;
  /** Билинг-флаг — та же роль, что `CreateProjectInput.hasProEntitlement`
   * (нужен только когда гейт реально может сработать, `01§12`:
   * "Unarchive that would exceed limit uses the same gate"). */
  readonly hasProEntitlement: boolean;
}

export type UnarchiveProjectResult =
  | { readonly status: 'ok'; readonly project: Project }
  | { readonly status: 'already_active' }
  | { readonly status: 'not_found' }
  | { readonly status: 'rejected'; readonly validation: ValidationResult };

/**
 * Разархивация (`01§12` "Unarchive project"). Гейт лимита 27/28 —
 * `origin:'reactivate'`, тот же расчёт `countActiveExcluding`, что при
 * создании (задание: "Unarchive that would exceed limit uses the same
 * gate"). Restore видимости — единственный эффект этой команды:
 * `archivedAt: null`. Реконсиляция уведомлений ("Unarchive restores
 * visibility and triggers notification reconciliation from current task
 * state; expired reminders are not replayed as a storm", `01§12`) здесь
 * **намеренно не вызывается** — реальный `NotificationSchedulerPort` ещё
 * нигде не построен в дереве пакетов (тот же задокументированный
 * незакрытый шов, что `reminder-cancel.ts`/E08.1 уже фиксирует для
 * реконсиляции в целом). Эта команда восстанавливает только видимость;
 * пересчёт расписания уведомлений — забота будущего пакета работ, когда
 * реконсиляция появится где-то в дереве.
 */
export async function unarchiveProjectCommand(
  input: UnarchiveProjectInput,
  deps: ProjectCommandDeps,
): Promise<UnarchiveProjectResult> {
  const current = await deps.storage.projects.findById(input.id);
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }
  if (current.archivedAt === null) {
    return { status: 'already_active' };
  }

  const activeProjectCountExcludingThis = await deps.storage.projects.countActiveExcluding(
    current.id,
  );
  const validation = validateDomainMutation({
    entity: 'project',
    data: { title: current.title, description: current.description },
    context: {
      origin: 'reactivate',
      activeProjectCountExcludingThis,
      hasProEntitlement: input.hasProEntitlement,
    },
  });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const nextProject: Project = { ...current, archivedAt: null, updatedAt: deps.now };
  const ticked = tickProject(current, nextProject, deps.now, deps.deviceId);
  await writeProject(ticked, deps.storage, deps.now, deps.deviceId, generateOpId);

  return { status: 'ok', project: ticked.project };
}
