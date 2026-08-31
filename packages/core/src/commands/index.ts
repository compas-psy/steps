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
