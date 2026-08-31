import type { Temporal } from '@js-temporal/polyfill';

import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { isTaskLabelActive, type TaskLabel } from '../entities/task-label.js';
import { validateDomainMutation } from '../validation/index.js';
import type { ValidationResult } from '../validation/types.js';
import { flattenTask } from './assemble.js';
import type { CommandStoragePort } from './storage-port.js';
import type {
  CommandTaskLabelDomainMutation,
  CommandTaskLabelEntityWrite,
  CommandTaskLabelStoragePort,
} from './task-label-port.js';
import type { Uuid } from '../values.js';

export interface AttachLabelInput {
  readonly taskId: Uuid;
  readonly labelId: Uuid;
}

/**
 * `taskStorage` — тот же `CommandStoragePort` (Task, `storage-port.ts`), что
 * уже используют `create/update/complete/deleteTaskCommand` — нужен только
 * для повторной валидации правила 18 (`tasks.loadValidationContext`), не
 * для существования Label (эта команда, как и `createSectionCommand` не
 * проверяет существование Project, не проверяет существование Label — вне
 * территории, тот же прецедент).
 */
export interface AttachLabelDeps {
  readonly storage: CommandTaskLabelStoragePort;
  readonly taskStorage: CommandStoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
  readonly generateOpId?: () => Uuid;
}

export type AttachLabelResult =
  | { readonly status: 'ok'; readonly taskLabel: TaskLabel }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' };

/**
 * Attach — upsert одной строки `TaskLabel` по `(taskId, labelId)` (`02§8`
 * OR-set, комментарий `task-label-port.ts`): повторный attach после detach
 * обновляет ЭТУ ЖЕ строку (свежий `addHlc`), не создаёт новую. Уже активная
 * связь — идемпотентный `ok` без записи (задача не потеряла бы лимит,
 * повторное присвоение не должно провоцировать лишний outbox).
 *
 * Правило 18 (`TASK_LABEL_LIMIT_EXCEEDED`) проверяется, только когда связь
 * РЕАЛЬНО становится активной впервые за этот вызов (не была активна до
 * него) — та же ловушка, что checklist item (CLAUDE.md): без повторной
 * валидации родительской Task с `labelCount+1` лимит 50 нигде не сработал
 * бы фактически.
 */
export async function attachLabelToTaskCommand(
  input: AttachLabelInput,
  deps: AttachLabelDeps,
): Promise<AttachLabelResult> {
  const task = await deps.taskStorage.tasks.findById(input.taskId);
  if (task === null || task.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const existingLinks = await deps.storage.taskLabels.listByTask(input.taskId);
  const existing = existingLinks.find((link) => link.labelId === input.labelId) ?? null;

  if (existing !== null && isTaskLabelActive(existing)) {
    return { status: 'ok', taskLabel: existing };
  }

  const context = await deps.taskStorage.tasks.loadValidationContext(task.id, task.parentTaskId);
  const validation = validateDomainMutation({
    entity: 'task',
    data: flattenTask(task),
    context: { ...context, labelCount: context.labelCount + 1 },
  });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };
  const finalLink: TaskLabel = {
    taskId: input.taskId,
    labelId: input.labelId,
    addHlc: hlc,
    removeHlc: null,
  };

  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'task_label',
    // Составной ключ `(taskId, labelId)` не сводится к одному `Uuid` —
    // конвенция хранилища (см. `label-delete.ts`): entityId — id задачи.
    entityId: input.taskId,
    patchJson: { taskId: input.taskId, labelId: input.labelId, addHlc: hlc, removeHlc: null },
    fieldClocksJson: {},
    baseRevision: 0n,
    createdAt: deps.now,
    retryCount: 0,
  };
  const write: CommandTaskLabelEntityWrite = { entity: 'task_label', value: finalLink };
  const mutation: CommandTaskLabelDomainMutation = { writes: [write], outbox: [outboxEntry] };

  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return { status: 'ok', taskLabel: finalLink };
}
