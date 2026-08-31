import type { ChecklistItem } from '../entities/checklist-item.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import { flattenTask } from './assemble.js';
import {
  CHECKLIST_ITEM_MUTABLE_FIELDS,
  type ChecklistItemCommandDeps,
  type ChecklistItemCommandResult,
} from './checklist-item-port.js';
import {
  buildPatchJson,
  diffChangedFields,
  pickClocks,
  tickClocks,
} from './project-section-clock.js';
import { resolveRank, type NewRank } from './project-rank.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { Uuid } from '../values.js';

/**
 * Вход `createChecklistItemCommand` (`01§10`: чек-лист-пункт —
 * `{text, done, rank}`, живёт только внутри Task Detail). `rank` —
 * переиспользован тип `NewRank` из `project-rank.ts` (не заведён третий
 * копией `NewTaskRank`/`NewRank` для Section/Project — та же generic-
 * алгебра позиционирования подходит без изменений, см. комментарий
 * `project-rank.ts`).
 */
export interface CreateChecklistItemInput {
  readonly taskId: Uuid;
  readonly text: string;
  readonly rank: NewRank;
}

/**
 * Единая точка входа для создания ChecklistItem. Два независимых блокирующих
 * рубежа, оба ДО записи (CLAUDE.md, найденный пробел этого пакета работ —
 * "createChecklistItemCommand при добавлении пункта обязан повторно
 * провалидировать РОДИТЕЛЬСКУЮ задачу"):
 *
 *  1. `validateChecklistItem` — текст самого пункта (правило 39).
 *  2. `validateDomainMutation({entity:'task', ...})` на РОДИТЕЛЬСКОЙ Task с
 *     `checklistItemCount: текущее+1` — правило 17 (`TASK_CHECKLIST_LIMIT_EXCEEDED`).
 *     Без этого шага лимит 200 нигде фактически не проверяется — тот же
 *     класс пробела, что `MUTABLE_TASK_FIELDS` не включал новое поле
 *     (см. CLAUDE.md).
 *
 * Задача — цель операции (checklist item не существует без неё), поэтому её
 * отсутствие/tombstone — `not_found`, тот же приём, что у `update`/`complete`/
 * `deleteTaskCommand` для собственного `id`.
 */
export async function createChecklistItemCommand(
  input: CreateChecklistItemInput,
  deps: ChecklistItemCommandDeps,
): Promise<ChecklistItemCommandResult> {
  const textValidation = validateDomainMutation({
    entity: 'checklist_item',
    data: { text: input.text },
  });
  if (!textValidation.valid) {
    return { status: 'rejected', validation: textValidation };
  }

  const task = await deps.storage.tasks.findById(input.taskId);
  if (task === null || task.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const context = await deps.storage.tasks.loadValidationContext(task.id, task.parentTaskId);
  const taskValidation = validateDomainMutation({
    entity: 'task',
    data: flattenTask(task),
    context: { ...context, checklistItemCount: context.checklistItemCount + 1 },
  });
  if (!taskValidation.valid) {
    return { status: 'rejected', validation: taskValidation };
  }

  const generateId = deps.generateId ?? generateUuidV7;
  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const item: ChecklistItem = {
    id: generateId(),
    taskId: input.taskId,
    text: input.text,
    done: false,
    rank: resolveRank(input.rank),
    deletedAt: null,
    clocks: {},
  };

  const changedFields = diffChangedFields(null, item, CHECKLIST_ITEM_MUTABLE_FIELDS);
  const finalItem: ChecklistItem = {
    ...item,
    clocks: tickClocks(item.clocks, changedFields, hlc),
  };

  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'checklist_item',
    entityId: finalItem.id,
    patchJson: buildPatchJson(finalItem, changedFields),
    fieldClocksJson: pickClocks(finalItem.clocks, changedFields),
    baseRevision: 0n,
    createdAt: deps.now,
    retryCount: 0,
  };

  const write: CommandEntityWrite = { entity: 'checklist_item', value: finalItem };
  const mutation: CommandDomainMutation = { writes: [write], outbox: [outboxEntry] };

  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return { status: 'ok', item: finalItem };
}
