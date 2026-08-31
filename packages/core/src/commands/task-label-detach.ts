import type { Temporal } from '@js-temporal/polyfill';

import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { isTaskLabelActive, type TaskLabel } from '../entities/task-label.js';
import type {
  CommandTaskLabelDomainMutation,
  CommandTaskLabelEntityWrite,
  CommandTaskLabelStoragePort,
} from './task-label-port.js';
import type { Uuid } from '../values.js';

export interface DetachLabelInput {
  readonly taskId: Uuid;
  readonly labelId: Uuid;
}

/** Detach не проверяет лимиты (снятие связи никогда не может нарушить
 * правило 18, задание пакета работ) — нужен только `CommandTaskLabelStoragePort`,
 * не `CommandStoragePort`(Task). */
export interface DetachLabelDeps {
  readonly storage: CommandTaskLabelStoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
  readonly generateOpId?: () => Uuid;
}

/** Нет `rejected`-ветки — detach ничего не валидирует. Отсутствующая или
 * уже неактивная связь — `not_found` ("нечего снимать"), тот же приём, что
 * `deleteTaskCommand`/`updateChecklistItemCommand` для отсутствующей цели. */
export type DetachLabelResult =
  { readonly status: 'ok'; readonly taskLabel: TaskLabel } | { readonly status: 'not_found' };

export async function detachLabelFromTaskCommand(
  input: DetachLabelInput,
  deps: DetachLabelDeps,
): Promise<DetachLabelResult> {
  const links = await deps.storage.taskLabels.listByTask(input.taskId);
  const current = links.find((link) => link.labelId === input.labelId) ?? null;
  if (current === null || !isTaskLabelActive(current)) {
    return { status: 'not_found' };
  }

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };
  const finalLink: TaskLabel = { ...current, removeHlc: hlc };

  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'task_label',
    entityId: input.taskId,
    patchJson: {
      taskId: input.taskId,
      labelId: input.labelId,
      addHlc: current.addHlc,
      removeHlc: hlc,
    },
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
