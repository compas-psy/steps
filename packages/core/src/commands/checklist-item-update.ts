import type { ChecklistItem } from '../entities/checklist-item.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
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
 * Патч ChecklistItem — `'field' in patch`, отсутствие ключа значит "не
 * трогать" (та же конвенция, что `UpdateTaskPatch`/`UpdateSectionPatch`).
 * `done` — просто булев тумблер, не требует `text` в том же патче (задание
 * пакета работ: "не обязана валидировать текст заново, если текст не в
 * патче" — но `validateChecklistItem` всё равно вызывается на итоговом
 * (текущем либо патченном) тексте ниже, той же дисциплиной, что
 * `updateSectionCommand` всегда прогоняет `title` через валидатор — просто
 * при отсутствии `text` в патче она тривиально проходит на уже валидном
 * значении).
 */
export interface UpdateChecklistItemPatch {
  readonly text?: string;
  readonly done?: boolean;
  readonly rank?: NewRank;
}

/**
 * `taskId` — обязателен наравне с `id`: у реального `ChecklistItemRepository`
 * (`packages/storage`) нет `findById` (только `listByTask`/`countActiveByTask`,
 * см. комментарий `CommandChecklistItemReader` в `storage-port.ts`) — без
 * `taskId` неоткуда взять список, в котором искать `id`. Отклонение от
 * буквальной формы задания пакета работ (там `{id, patch}` без `taskId`) —
 * задокументированное, вынужденное ADR-0003-совместимостью решение: вызывающий
 * UI-слой (Task Detail) в любом случае уже знает `taskId` контекстно (это
 * экран одной задачи), лишнее поле не создаёт для него неудобства.
 */
export interface UpdateChecklistItemInput {
  readonly taskId: Uuid;
  readonly id: Uuid;
  readonly patch: UpdateChecklistItemPatch;
}

export async function updateChecklistItemCommand(
  input: UpdateChecklistItemInput,
  deps: ChecklistItemCommandDeps,
): Promise<ChecklistItemCommandResult> {
  const siblings = await deps.storage.checklistItems.listByTask(input.taskId);
  const current = siblings.find((item) => item.id === input.id) ?? null;
  if (current === null) {
    return { status: 'not_found' };
  }

  const text = input.patch.text ?? current.text;
  const validation = validateDomainMutation({ entity: 'checklist_item', data: { text } });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const done = 'done' in input.patch ? (input.patch.done ?? current.done) : current.done;
  const rank = input.patch.rank !== undefined ? resolveRank(input.patch.rank) : current.rank;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const nextItem: ChecklistItem = { ...current, text, done, rank };
  const changedFields = diffChangedFields(current, nextItem, CHECKLIST_ITEM_MUTABLE_FIELDS);
  const finalItem: ChecklistItem = {
    ...nextItem,
    clocks: tickClocks(current.clocks, changedFields, hlc),
  };

  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'checklist_item',
    entityId: current.id,
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
