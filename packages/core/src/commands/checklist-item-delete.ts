import type { ChecklistItem } from '../entities/checklist-item.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import type { ValidationResult } from '../validation/types.js';
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
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { Uuid } from '../values.js';

/** `taskId` обязателен — то же обоснование, что `UpdateChecklistItemInput`
 * (`checklist-item-update.ts`): реальный `ChecklistItemRepository` не имеет
 * `findById`. */
export interface DeleteChecklistItemInput {
  readonly taskId: Uuid;
  readonly id: Uuid;
}

/**
 * Мягкое удаление пункта чек-листа (`deletedAt`, тот же приём, что
 * `deleteTaskCommand`/`deleteSectionCommand`). Прогоняет неизменный `text`
 * через `validateChecklistItem` перед записью — та же дисциплина, что
 * `deleteTaskCommand` применяет к Task (CLAUDE.md, «Один валидатор на все
 * инварианты»: проверка не должна быть опциональной для одной из команд по
 * недосмотру), хотя удаление не меняет ни одно проверяемое поле.
 */
/**
 * Сборка tombstone-записи пункта чек-листа БЕЗ обращения к хранилищу —
 * выделена из команды ниже пакетом работ Undo/Restore R1 (ST §58 U2).
 *
 * Причина: `01§9` требует, чтобы удаление родителя сносило подзадачи и
 * чек-лист ОДНОЙ операцией, а `deleteTaskCommand` до этого пакета собирал
 * каскад вложенными вызовами команд, каждый со своей `runTransaction`. Между
 * этими транзакциями существовало состояние «родитель ещё жив, а его пункты
 * уже удалены», которое переживало бы падение на середине. Чтобы каскад стал
 * одной мутацией, вычисление записи должно быть отделено от её применения —
 * это и есть выделенная функция. Сама команда ниже осталась ровно тем же
 * поведением: чтение → эта сборка → одна транзакция.
 */
export type ChecklistItemTombstone =
  | {
      readonly status: 'ok';
      readonly item: ChecklistItem;
      readonly write: CommandEntityWrite;
      readonly outbox: SyncOutboxEntry;
    }
  | { readonly status: 'rejected'; readonly validation: ValidationResult };

export function buildChecklistItemTombstone(
  current: ChecklistItem,
  deps: ChecklistItemCommandDeps,
  generateOpId: () => Uuid,
): ChecklistItemTombstone {
  const validation = validateDomainMutation({
    entity: 'checklist_item',
    data: { text: current.text },
  });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };
  const nextItem: ChecklistItem = { ...current, deletedAt: deps.now };
  const changedFields = diffChangedFields(current, nextItem, CHECKLIST_ITEM_MUTABLE_FIELDS);
  const finalItem: ChecklistItem = {
    ...nextItem,
    clocks: tickClocks(current.clocks, changedFields, hlc),
  };

  return {
    status: 'ok',
    item: finalItem,
    write: { entity: 'checklist_item', value: finalItem },
    outbox: {
      opId: generateOpId(),
      deviceId: deps.deviceId,
      entityType: 'checklist_item',
      entityId: current.id,
      patchJson: buildPatchJson(finalItem, changedFields),
      fieldClocksJson: pickClocks(finalItem.clocks, changedFields),
      baseRevision: 0n,
      createdAt: deps.now,
      retryCount: 0,
    },
  };
}

export async function deleteChecklistItemCommand(
  input: DeleteChecklistItemInput,
  deps: ChecklistItemCommandDeps,
): Promise<ChecklistItemCommandResult> {
  const siblings = await deps.storage.checklistItems.listByTask(input.taskId);
  const current = siblings.find((item) => item.id === input.id) ?? null;
  if (current === null) {
    return { status: 'not_found' };
  }

  const built = buildChecklistItemTombstone(current, deps, deps.generateOpId ?? generateUuidV7);
  if (built.status === 'rejected') {
    return built;
  }

  const mutation: CommandDomainMutation = { writes: [built.write], outbox: [built.outbox] };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return { status: 'ok', item: built.item };
}
