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
// Пакет работ E10 расширил порт до `checklistItems`/`listDirectSubtasks` —
// см. комментарий `storage-port.ts` про причину общего порта Task+ChecklistItem.
export type {
  CommandChecklistItemReader,
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
export {
  completeManyCommand,
  previewBulkCompletion,
  type CompleteManyInput,
  type CompleteManyResult,
} from './complete-many.js';
export { planBulkCompletion, type BulkCompletionPlan } from './bulk-completion-plan.js';
export {
  moveManyToProjectCommand,
  previewBulkProjectMove,
  type MoveManyToProjectInput,
  type MoveManyToProjectResult,
} from './move-many-to-project.js';
export {
  planBulkProjectMove,
  type BulkProjectMovePlan,
  type BulkProjectMoveStep,
} from './bulk-project-move-plan.js';
// `DeleteTaskResult` (не `TaskCommandResult`) — пакет работ E10 расширил
// исход аддитивно (`affectedSubtaskIds`/`affectedChecklistItemIds`, каскад
// `01§9`), см. комментарий `delete-task.ts`.
export { deleteTaskCommand, type DeleteTaskInput, type DeleteTaskResult } from './delete-task.js';

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
// Отпечаток ЖЕЛАЕМОГО расписания одного напоминания на момент записи
// (`02§14`, Task A3 → пересмотрено Task A6) — экспорт нужен командам
// `reminder-explicit.ts`/`reminder-deadline.ts` этого же пакета; сравнение
// reconciliation с реальным состоянием ОС читает это поле НИКОГДА (см.
// подробный разбор в `reminder-fingerprint.ts`), поэтому `packages/app` эту
// функцию для reconciliation не вызывает.
export { computeReminderFingerprint } from './reminder-fingerprint.js';

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

// --- Section: удаление (`01§12` "Delete section") -----------------------------
// Разблокировано решением владельца (см. историю `section-delete.ts`):
// «Без раздела» — Вариант 1, sectionId:null, не отдельная запись.
export {
  deleteSectionCommand,
  type DeleteSectionDeps,
  type DeleteSectionInput,
  type DeleteSectionResult,
} from './section-delete.js';

// --- Порт+deps+результат ChecklistItem (`01§10`) — E10 ------------------------
export {
  CHECKLIST_ITEM_MUTABLE_FIELDS,
  type ChecklistItemCommandDeps,
  type ChecklistItemCommandResult,
} from './checklist-item-port.js';

// --- Команды ChecklistItem (`01§10`) — E10 -------------------------------------
export {
  createChecklistItemCommand,
  type CreateChecklistItemInput,
} from './checklist-item-create.js';
export {
  updateChecklistItemCommand,
  type UpdateChecklistItemInput,
  type UpdateChecklistItemPatch,
} from './checklist-item-update.js';
export {
  deleteChecklistItemCommand,
  type DeleteChecklistItemInput,
} from './checklist-item-delete.js';

// --- Порт+deps+результат Label (`01§13` "Label lifecycle") — E10 --------------
export {
  LABEL_MUTABLE_FIELDS,
  type CommandLabelDomainMutation,
  type CommandLabelEntityWrite,
  type CommandLabelReader,
  type CommandLabelStoragePort,
  type CommandLabelWriteTransaction,
  type LabelCommandDeps,
  type LabelCommandResult,
} from './label-port.js';

// --- Команды Label — E10 --------------------------------------------------------
export { createLabelCommand, type CreateLabelInput } from './label-create.js';
export {
  updateLabelCommand,
  type UpdateLabelInput,
  type UpdateLabelPatch,
} from './label-update.js';
export {
  deleteLabelCommand,
  type DeleteLabelDeps,
  type DeleteLabelInput,
  type DeleteLabelResult,
} from './label-delete.js';

// --- Порт TaskLabel (`02§8` OR-set) — E10 ---------------------------------------
export type {
  CommandTaskLabelDomainMutation,
  CommandTaskLabelEntityWrite,
  CommandTaskLabelReader,
  CommandTaskLabelStoragePort,
  CommandTaskLabelWriteTransaction,
} from './task-label-port.js';

// --- Команды TaskLabel — E10 -----------------------------------------------------
export {
  attachLabelToTaskCommand,
  type AttachLabelDeps,
  type AttachLabelInput,
  type AttachLabelResult,
} from './task-label-attach.js';
export {
  detachLabelFromTaskCommand,
  type DetachLabelDeps,
  type DetachLabelInput,
  type DetachLabelResult,
} from './task-label-detach.js';

// --- Конверсия Checklist ↔ Subtask (`01§10`) — E10 ------------------------------
export {
  convertChecklistItemToSubtaskCommand,
  convertSubtaskToChecklistItemCommand,
  type ConvertChecklistItemToSubtaskInput,
  type ConvertChecklistItemToSubtaskResult,
  type ConvertSubtaskToChecklistItemInput,
  type ConvertSubtaskToChecklistItemResult,
} from './checklist-subtask-convert.js';

// --- Порт RecurrenceSeries (расширение `storage-port.ts`) — E11 -----------------
export type { CommandRecurrenceSeriesReader } from './storage-port.js';

// --- Мост RecurrenceRuleTemplate ↔ RecurrenceSeries JSON-полей — E11 -----------
export {
  buildRecurrenceAnchor,
  parseRecurrenceRuleTemplate,
  RECURRENCE_SERIES_MUTABLE_FIELDS,
  toRecurrenceTemplateJson,
  // --- M26: шаблон occurrence (time-of-day/duration/deadline+available offsets) --
  dayOffset,
  deriveRecurrenceOccurrenceTemplate,
  parseRecurrenceOccurrenceTemplate,
  shiftRelativeDate,
  toRecurrenceOccurrenceTemplateJson,
  type OccurrencePlanningSnapshot,
  type RecurrenceOccurrenceTemplate,
} from './recurrence-template.js';

// --- Повторы (`01§11`) — E11 ------------------------------------------------------
export {
  createRecurringTaskCommand,
  type CreateRecurringTaskInput,
  type CreateRecurringTaskResult,
} from './create-recurring-task.js';
export {
  completeOccurrenceCommand,
  skipOccurrenceCommand,
  type CompleteOccurrenceInput,
  type CompleteOccurrenceResult,
} from './complete-occurrence.js';
export {
  undoCompleteOccurrenceCommand,
  type UndoCompleteOccurrenceInput,
  type UndoCompleteOccurrenceResult,
} from './undo-complete-occurrence.js';
export {
  updateSeriesTemplateCommand,
  updateSeriesOccurrenceTemplateCommand,
  type UpdateSeriesTemplateInput,
  type UpdateSeriesTemplateResult,
  type UpdateSeriesOccurrenceTemplateInput,
} from './update-series-template.js';
export {
  deleteSeriesCommand,
  type DeleteSeriesInput,
  type DeleteSeriesResult,
} from './delete-series.js';

// --- «Это повторение» / «Вся серия» для Planning-полей (M26, `01§11.6`) ------
export {
  updateRecurringOccurrencePlanningCommand,
  type UpdateRecurringOccurrencePlanningInput,
  type UpdateRecurringOccurrencePlanningResult,
} from './update-recurring-occurrence-planning.js';

// --- Восстановление завершённых задач (`01§11.10`/`01§11.11`) — E12.4 ---------
// Экран «Завершённые» (M36, `12_SCREEN_STATE_MATRIX.md`) — последний
// недостающий кусок волны 1. См. заголовок `restore-task.ts` за полным
// разбором формы команды.
export {
  describeRestoreSituation,
  restoreTaskCommand,
  type RestoreArchivedProjectChoice,
  type RestoreHierarchyChoice,
  type RestoreSituationResult,
  type RestoreTaskDeps,
  type RestoreTaskInput,
  type RestoreTaskResult,
} from './restore-task.js';
