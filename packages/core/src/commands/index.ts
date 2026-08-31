/**
 * `@shagi/core/commands` — командный слой Task (пакет работ E01.4).
 * Собственный барель — сведение в общий `packages/core/src/index.ts`
 * выполняется отдельно при приёмке (см. CLAUDE.md, границы задания E01.4:
 * "Не трогай packages/core/src/index.ts").
 *
 * Единая точка входа для *мутаций* Task, обещанная в шапке
 * `packages/core/src/index.ts` ("Единственная точка входа для мутаций —
 * `CreateTaskCommand` и соседние команды... прямая запись в хранилище в
 * обход команд запрещена") — здесь она и реализована: `createTaskCommand`,
 * `updateTaskCommand`, `completeTaskCommand`, `deleteTaskCommand`.
 *
 * Архитектурное решение — инверсия порта хранения (`CommandStoragePort`
 * вместо импорта `StoragePort` из `@shagi/storage`, который создал бы
 * циклическую зависимость `storage → core → storage`) — разобрано целиком
 * в ADR-0003.
 */

// --- Порт хранения (инверсия зависимости, ADR-0003) --------------------------
export type {
  CommandDomainMutation,
  CommandEntityWrite,
  CommandStoragePort,
  CommandStorageWriteTransaction,
  CommandTaskReader,
  NonEmptyArray,
} from './storage-port.js';

// --- Общий результат команд и зависимости -------------------------------------
export type { TaskCommandDeps, TaskCommandResult } from './types.js';

// --- Позиция (`rank`) для create/move -----------------------------------------
export { resolveTaskRank, type NewTaskRank } from './rank-input.js';

// --- Четыре команды жизненного цикла Task -------------------------------------
export { createTaskCommand, type CreateTaskInput } from './create-task.js';
export { updateTaskCommand, type UpdateTaskInput, type UpdateTaskPatch } from './update-task.js';
export { completeTaskCommand, type CompleteTaskInput } from './complete-task.js';
export { deleteTaskCommand, type DeleteTaskInput } from './delete-task.js';

// --- Порт хранения Reminder (инверсия зависимости, ADR-0003) — E08 -----------
export type {
  CommandReminderDomainMutation,
  CommandReminderEntityWrite,
  CommandReminderReader,
  CommandReminderStoragePort,
  CommandReminderWriteTransaction,
  ReminderCommandDeps,
} from './reminder-port.js';

// --- Команды Reminder (`01§18`) — E08 -----------------------------------------
export {
  createExplicitReminderCommand,
  type CreateExplicitReminderInput,
  type CreateExplicitReminderResult,
} from './reminder-explicit.js';
export {
  createDeadlineApproachingReminderCommand,
  createDeadlineMissedReminderCommand,
  type CreateDeadlineApproachingReminderInput,
  type CreateDeadlineApproachingReminderResult,
  type CreateDeadlineMissedReminderInput,
  type CreateDeadlineMissedReminderResult,
} from './reminder-deadline.js';
export {
  cancelReminderCommand,
  type CancelReminderInput,
  type CancelReminderResult,
} from './reminder-cancel.js';

// --- Позиция (`rank`) для Project/Section (E09) -------------------------------
export { resolveRank, type NewRank } from './project-rank.js';

// --- Порт хранения Project (инверсия зависимости, ADR-0003) — E09 ------------
export type {
  CommandProjectDomainMutation,
  CommandProjectEntityWrite,
  CommandProjectReader,
  CommandProjectReminderReader,
  CommandProjectStoragePort,
  CommandProjectTaskReader,
  CommandProjectWriteTransaction,
  ProjectCommandDeps,
  ProjectCommandResult,
} from './project-port.js';

// --- Команды Project (`01§12`) — E09 ------------------------------------------
export { createProjectCommand, type CreateProjectInput } from './project-create.js';
export {
  updateProjectCommand,
  type UpdateProjectInput,
  type UpdateProjectPatch,
} from './project-update.js';
export {
  archiveProjectCommand,
  unarchiveProjectCommand,
  listAllProjectTasks,
  type ArchiveProjectDeps,
  type ArchiveProjectInput,
  type ArchiveProjectResult,
  type UnarchiveProjectInput,
  type UnarchiveProjectResult,
} from './project-archive.js';
export {
  deleteProjectAndTasksCommand,
  deleteProjectKeepingTasksCommand,
  type DeleteProjectDeps,
  type DeleteProjectResult,
} from './project-delete.js';

// --- Порт хранения Section (инверсия зависимости, ADR-0003) — E09 ------------
export type {
  CommandSectionDomainMutation,
  CommandSectionEntityWrite,
  CommandSectionReader,
  CommandSectionStoragePort,
  CommandSectionWriteTransaction,
  SectionCommandDeps,
  SectionCommandResult,
} from './section-port.js';

// --- Команды Section (`01§12`/`01§13`) — E09 ----------------------------------
export { createSectionCommand, type CreateSectionInput } from './section-create.js';
export {
  updateSectionCommand,
  type UpdateSectionInput,
  type UpdateSectionPatch,
} from './section-update.js';

// --- Section: удаление ЗАБЛОКИРОВАНО — см. JSDoc `section-delete.ts` ---------
// `deleteSectionCommand` не реализован и не экспортируется: соглашение о
// синтетической секции «Без раздела» не зафиксировано нигде в дереве
// пакетов (архитектурный блокер, не гадать — задание пакета работ E09).
export { DELETE_SECTION_COMMAND_BLOCKED_REASON } from './section-delete.js';
