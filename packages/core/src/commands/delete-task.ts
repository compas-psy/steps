import type { Task } from '../entities/task.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import { flattenTask } from './assemble.js';
import { buildPatchJson, diffChangedFields, pickClocks, tickClocks } from './clock-diff.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps, TaskCommandResult } from './types.js';
import type { Uuid } from '../values.js';

export interface DeleteTaskInput {
  readonly id: Uuid;
}

/**
 * Мягкое удаление (задание, раздел "Что реализовать", п.4; CLAUDE.md,
 * пункт 6 «Tombstone вместо жёсткого удаления, retention 90 дней»).
 * Устанавливает `deletedAt` — не физическое стирание записи. Физическая
 * чистка просроченных (>90 дней) tombstone — `StoragePort.purgeExpiredTombstones`
 * (`packages/storage`), системная задача, не пользовательская команда: этот
 * пакет работ её не касается (см. `commands/storage-port.ts`).
 *
 * Уже удалённая задача не считается допустимой целью повторного удаления —
 * `{status:'not_found'}`, то же соглашение, что у `update`/`complete`.
 */
export async function deleteTaskCommand(
  input: DeleteTaskInput,
  deps: TaskCommandDeps,
): Promise<TaskCommandResult> {
  const current = await deps.storage.tasks.findById(input.id);
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const generateOpId = deps.generateOpId ?? generateUuidV7;

  // Мягкое удаление не меняет ни одно поле, покрытое инвариантами 1–26 —
  // `deletedAt` вне `TaskValidationInput`. Тем не менее прогоняем валидатор
  // на неизменных данных (единая точка входа для всех локальных команд,
  // CLAUDE.md, «Один валидатор на все инварианты») — так проверка не
  // становится опциональной для одной из четырёх команд по недосмотру.
  const validationInput = flattenTask(current);
  const context = await deps.storage.tasks.loadValidationContext(current.id, current.parentTaskId);
  const validation = validateDomainMutation({ entity: 'task', data: validationInput, context });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const nextTask: Task = {
    ...current,
    deletedAt: deps.now,
    updatedAt: deps.now,
    revision: current.revision + 1n,
  };

  const changedFields = diffChangedFields(current, nextTask);
  const finalTask: Task = { ...nextTask, clocks: tickClocks(current.clocks, changedFields, hlc) };

  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'task',
    entityId: current.id,
    patchJson: buildPatchJson(finalTask, changedFields),
    fieldClocksJson: pickClocks(finalTask.clocks, changedFields),
    baseRevision: current.revision,
    createdAt: deps.now,
    retryCount: 0,
  };

  const write: CommandEntityWrite = { entity: 'task', value: finalTask };
  const mutation: CommandDomainMutation = { writes: [write], outbox: [outboxEntry] };

  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return { status: 'ok', task: finalTask };
}
