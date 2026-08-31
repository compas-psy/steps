import type { Task, CompletionKind } from '../entities/task.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import type { TaskValidationInput } from '../validation/task.js';
import type { Uuid } from '../values.js';
import { buildCompletion, flattenTask } from './assemble.js';
import { buildPatchJson, diffChangedFields, pickClocks, tickClocks } from './clock-diff.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps, TaskCommandResult } from './types.js';

export interface CompleteTaskInput {
  readonly id: Uuid;
  /** По умолчанию `'done'` — обычное завершение (`01§1`, инвариант 13).
   * `'skipped'` — пропуск occurrence повтора (`01§11.5`); передаётся
   * явно вызывающим кодом движка повторов, эта команда сама не решает,
   * какой из двух смыслов уместен. */
  readonly completionKind?: CompletionKind;
}

/**
 * Завершение задачи (задание, раздел "Что реализовать", п.3). Устанавливает
 * `status='completed'`, `completedAt`, `completionKind` согласованно —
 * согласованность проверяет `validateTask` (инварианты 12–13, уже готовые
 * правила, не дублируются здесь заново).
 *
 * **Шов для следующего пакета работ (эпик E11, движок повторов):** если
 * `task.seriesId != null`, эта команда **не** генерирует следующий
 * occurrence серии — она лишь завершает переданную задачу как обычную.
 * Генерация следующего графа occurrence (детерминированный UUIDv5,
 * `derive*Id` из `identity/uuid-v5.ts`, atomic completion одной
 * транзакцией с `complete current + generate next` в outbox, `02§13`) —
 * задача будущего пакета работ, который, вероятно, обернёт вызов этой же
 * функции дополнительным шагом, а не будет дублировать её тело.
 */
export async function completeTaskCommand(
  input: CompleteTaskInput,
  deps: TaskCommandDeps,
): Promise<TaskCommandResult> {
  const current = await deps.storage.tasks.findById(input.id);
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const completionKind = input.completionKind ?? 'done';

  const validationInput: TaskValidationInput = {
    ...flattenTask(current),
    status: 'completed',
    completedAt: deps.now,
    completionKind,
  };

  const context = await deps.storage.tasks.loadValidationContext(current.id, current.parentTaskId);
  const validation = validateDomainMutation({ entity: 'task', data: validationInput, context });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const nextTask: Task = {
    ...current,
    ...buildCompletion({ status: 'completed', completedAt: deps.now, completionKind }),
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
