import type { ChecklistItem } from '../entities/checklist-item.js';
import type { Task } from '../entities/task.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { generateUuidV7 } from '../identity/index.js';
import { validateDomainMutation } from '../validation/index.js';
import type { TaskParentSnapshot } from '../validation/task.js';
import type { ValidationResult } from '../validation/types.js';
import type { Uuid } from '../values.js';
import { flattenTask } from './assemble.js';
import { CHECKLIST_ITEM_MUTABLE_FIELDS } from './checklist-item-port.js';
import { buildPatchJson, diffChangedFields, pickClocks, tickClocks } from './clock-diff.js';
import {
  buildPatchJson as buildItemPatchJson,
  diffChangedFields as diffItemFields,
  pickClocks as pickItemClocks,
  tickClocks as tickItemClocks,
} from './project-section-clock.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps } from './types.js';

/**
 * Undo удаления в 6-секундном окне (`01§9` "Delete", ST §58 U2) — обратная
 * доменная мутация к `deleteTaskCommand`.
 *
 * Удаление в R1 — tombstone (`deletedAt`), а не физическое стирание, и
 * пользовательской «Корзины» в продукте нет (`01§9`): пока живёт тост, этот
 * Undo — единственный способ вернуть задачу. Поэтому он обязан возвращать
 * ВЕСЬ граф, который снёс каскад (подзадачи и пункты чек-листа), одной
 * транзакцией: «родитель вернулся, а половина содержимого нет» — это не
 * прежнее состояние, а новое, которого пользователь не создавал.
 *
 * Откат — НОВАЯ мутация вперёд (`revision + 1`, свежие HLC, запись в
 * outbox), а не отмотка истории: только так он остаётся sync-safe
 * (`MASTER §7`), и ровно тем же приёмом сделан `undo-complete-tasks.ts`.
 *
 * Почему не `restoreTaskCommand`: та — про экран «Завершённые» (снятие
 * `completed`, произвольная давность, ветвления §11.10/§11.11 с выбором
 * пользователя). Она вообще не трогает `deletedAt`: удалённая задача на тот
 * экран не попадает.
 */
export interface UndoDeleteTasksInput {
  /** Корневые задачи операции — то, что пользователь удалил явно. */
  readonly ids: readonly Uuid[];
  /** `DeleteTaskResult.affectedSubtaskIds` — id, которые снёс каскад.
   * Передаются ВОЗВРАЩЁННЫМИ прямой командой, а не пересчитанными заново:
   * после удаления `listDirectSubtasks` уже не вернёт tombstone-детей, и
   * пересчёт восстановил бы «похожий» граф вместо прежнего. */
  readonly subtaskIds?: readonly Uuid[];
  /** `DeleteTaskResult.affectedChecklistItems` — СНИМКИ пунктов чек-листа
   * в состоянии tombstone, а не их id. Причина не в удобстве: у
   * `ChecklistItemRepository` есть только `listByTask`/`countActiveByTask`,
   * и обе отдают лишь живые пункты (`packages/storage`) — удалённый пункт
   * не читается из хранилища НИЧЕМ. Для Task такой проблемы нет
   * (`findById` читает и tombstone), поэтому задачи здесь перечитываются
   * из хранилища, а пункты приходят снимком. Это ровно тот узкий
   * UndoToken, который разрешает ST §58: только данные, необходимые
   * допустимой обратной мутации, и живущий не дольше окна Undo. */
  readonly checklistItems?: readonly ChecklistItem[];
}

export type UndoDeleteTasksResult =
  | {
      readonly status: 'ok';
      readonly tasks: readonly Task[];
      readonly checklistItems: readonly ChecklistItem[];
      readonly validation: ValidationResult;
    }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' }
  /** Возвращаемая подзадача осталась бы висеть под удалённым родителем —
   * состояние, которого в дереве не существует. Отдельный исход, а не
   * `ValidationIssue`: `deletedAt` вне `TaskValidationInput`, ни одно
   * правило валидатора этот запрет не проверяет, и выдумывать
   * несуществующий код ошибки ради красивого возврата значило бы соврать о
   * происхождении запрета (тот же приём, что `parent_still_completed` в
   * `undo-complete-tasks.ts`). */
  | { readonly status: 'parent_still_deleted'; readonly parentId: Uuid }
  /** Ни одна из указанных задач не находится в состоянии tombstone —
   * откатывать нечего. Не ошибка: повторное нажатие «Отменить» (двойной
   * тап, повторный клик) обязано быть идемпотентным (ST §58, UI contract),
   * а не применять инверсию дважды. */
  | { readonly status: 'not_deleted' };

/**
 * Снимок родителя таким, каким он станет ПОСЛЕ отката: сам родитель берётся
 * из набора восстанавливаемых задач, а `directSubtaskCount` (правило 16)
 * складывается из живых прямых подзадач хранилища и тех, что оживают этой же
 * мутацией — обе группы без самой валидируемой задачи. Считать по одному
 * лишь хранилищу нельзя: там сейчас все дети — tombstone, и лимит 16
 * проверялся бы против нуля, то есть не проверялся бы вовсе.
 */
async function buildRestoredParentSnapshot(
  current: Task,
  deps: TaskCommandDeps,
  targets: readonly Task[],
): Promise<TaskParentSnapshot | null> {
  const parentId = current.parentTaskId;
  if (parentId === null) return null;
  const parent = targets.find((task) => task.id === parentId) ?? null;
  if (parent === null) return null;

  const [activeSubtasks, completedSubtasks] = await Promise.all([
    deps.storage.tasks.listDirectSubtasks(parentId, 'active'),
    deps.storage.tasks.listDirectSubtasks(parentId, 'completed'),
  ]);
  const liveIds = new Set(
    [...activeSubtasks, ...completedSubtasks]
      .filter((task) => task.deletedAt === null && task.id !== current.id)
      .map((task) => task.id),
  );
  for (const task of targets) {
    if (task.parentTaskId === parentId && task.id !== current.id && task.deletedAt !== null) {
      liveIds.add(task.id);
    }
  }

  return {
    id: parent.id,
    projectId: parent.projectId,
    sectionId: parent.sectionId,
    parentTaskId: parent.parentTaskId,
    directSubtaskCount: liveIds.size,
  };
}

export async function undoDeleteTasksCommand(
  input: UndoDeleteTasksInput,
  deps: TaskCommandDeps,
): Promise<UndoDeleteTasksResult> {
  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  // Родители раньше детей — зеркало порядка удаления (`delete-task.ts`
  // собирает детей раньше родителя). Внутри одной транзакции хранилищу
  // порядок безразличен, но журнал outbox читается будущим сервером
  // последовательно, и в нём «родитель ожил, потом ребёнок» — единственная
  // последовательность, не проходящая через висячую ссылку.
  const orderedIds = [...input.ids, ...(input.subtaskIds ?? [])];

  const targets: Task[] = [];
  for (const id of orderedIds) {
    // eslint-disable-next-line no-await-in-loop -- граф мал (родитель + прямые подзадачи), порядок чтения на результат не влияет
    const current = await deps.storage.tasks.findById(id);
    if (current === null) return { status: 'not_found' };
    targets.push(current);
  }
  if (targets.length === 0) return { status: 'not_found' };

  const deletedTargets = targets.filter((task) => task.deletedAt !== null);
  if (deletedTargets.length === 0) return { status: 'not_deleted' };

  const restoredIds = new Set(deletedTargets.map((task) => task.id));

  const writes: CommandEntityWrite[] = [];
  const outbox: SyncOutboxEntry[] = [];
  const restoredTasks: Task[] = [];
  let lastValidation: ValidationResult = { valid: true, issues: [] };

  for (const current of deletedTargets) {
    if (current.parentTaskId !== null && !restoredIds.has(current.parentTaskId)) {
      // eslint-disable-next-line no-await-in-loop -- см. выше
      const parent = await deps.storage.tasks.findById(current.parentTaskId);
      if (parent === null || parent.deletedAt !== null) {
        return { status: 'parent_still_deleted', parentId: current.parentTaskId };
      }
    }

    // Валидатор прогоняется на неизменных полях: `deletedAt` вне
    // `TaskValidationInput`, восстановление не меняет ни одно проверяемое
    // поле. Та же дисциплина, что у `deleteTaskCommand` — единая точка
    // входа для всех локальных команд (CLAUDE.md, «Один валидатор на все
    // инварианты»), проверка не должна быть опциональной по недосмотру.
    // eslint-disable-next-line no-await-in-loop -- см. выше
    const storageContext = await deps.storage.tasks.loadValidationContext(
      current.id,
      current.parentTaskId,
    );
    // Проверять надо состояние ПОСЛЕ отката, а не до него. Родитель прямо
    // сейчас ещё tombstone, поэтому `loadValidationContext` отдаёт
    // `parent: null` (и настоящий `TaskRepository`, и его in-memory тень
    // одинаково не считают удалённую задачу родителем) — а `validateTask`
    // на непустом `parentTaskId` с `parent === null` бросает TypeError.
    // Восстанавливаем снимок родителя из той же мутации: в ней он оживает
    // раньше ребёнка (см. `orderedIds`).
    // eslint-disable-next-line no-await-in-loop -- см. выше
    const context =
      current.parentTaskId !== null && storageContext.parent === null
        ? { ...storageContext, parent: await buildRestoredParentSnapshot(current, deps, targets) }
        : storageContext;
    const validation = validateDomainMutation({
      entity: 'task',
      data: flattenTask(current),
      context,
    });
    lastValidation = validation;
    if (!validation.valid) return { status: 'rejected', validation };

    const restored: Task = {
      ...current,
      deletedAt: null,
      updatedAt: deps.now,
      revision: current.revision + 1n,
    };
    const changedFields = diffChangedFields(current, restored);
    const finalTask: Task = { ...restored, clocks: tickClocks(current.clocks, changedFields, hlc) };

    writes.push({ entity: 'task', value: finalTask });
    restoredTasks.push(finalTask);
    outbox.push({
      opId: generateOpId(),
      deviceId: deps.deviceId,
      entityType: 'task',
      entityId: current.id,
      patchJson: buildPatchJson(finalTask, changedFields),
      fieldClocksJson: pickClocks(finalTask.clocks, changedFields),
      baseRevision: current.revision,
      createdAt: deps.now,
      retryCount: 0,
    });
  }

  // Пункты чек-листа восстанавливаются из переданных снимков — см.
  // `UndoDeleteTasksInput.checklistItems`: из хранилища tombstone-пункт
  // не читается ничем.
  const restoredTaskIds = new Set(restoredTasks.map((task) => task.id));
  const restoredItems: ChecklistItem[] = [];
  for (const item of input.checklistItems ?? []) {
    // Пункт возвращается только вместе со СВОЕЙ задачей: оживший пункт под
    // всё ещё удалённой задачей не виден ни на одном экране и остаётся
    // мусором в синхронизации.
    if (!restoredTaskIds.has(item.taskId) || item.deletedAt === null) continue;
    const restoredItem: ChecklistItem = { ...item, deletedAt: null };
    const changedFields = diffItemFields(item, restoredItem, CHECKLIST_ITEM_MUTABLE_FIELDS);
    const finalItem: ChecklistItem = {
      ...restoredItem,
      clocks: tickItemClocks(item.clocks, changedFields, hlc),
    };
    writes.push({ entity: 'checklist_item', value: finalItem });
    restoredItems.push(finalItem);
    outbox.push({
      opId: generateOpId(),
      deviceId: deps.deviceId,
      entityType: 'checklist_item',
      entityId: item.id,
      patchJson: buildItemPatchJson(finalItem, changedFields),
      fieldClocksJson: pickItemClocks(finalItem.clocks, changedFields),
      baseRevision: 0n,
      createdAt: deps.now,
      retryCount: 0,
    });
  }

  const mutation: CommandDomainMutation = {
    writes,
    // Непуст по построению: записи добавляются парой с `writes`, а пустой
    // `deletedTargets` отсечён выше исходом `not_deleted`.
    outbox: outbox as unknown as CommandDomainMutation['outbox'],
  };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return {
    status: 'ok',
    tasks: restoredTasks,
    checklistItems: restoredItems,
    validation: lastValidation,
  };
}
