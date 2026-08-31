import type { Task } from '../entities/task.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import type { ValidationResult } from '../validation/types.js';
import { flattenTask } from './assemble.js';
import { deleteChecklistItemCommand } from './checklist-item-delete.js';
import { buildPatchJson, diffChangedFields, pickClocks, tickClocks } from './clock-diff.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps } from './types.js';
import type { Uuid } from '../values.js';

export interface DeleteTaskInput {
  readonly id: Uuid;
}

/**
 * Итог мягкого удаления. `affectedSubtaskIds`/`affectedChecklistItemIds` —
 * добавлены пакетом работ E10, закрывающим найденный пробел `01§9`
 * ("Parent delete cascades direct subtasks/checklist/links; one Undo
 * restores graph"): материал для будущего Undo, по образцу
 * `DeleteSectionResult.affectedTaskIds`/`DeleteProjectResult.affectedTaskCount`
 * (`section-delete.ts`/`project-delete.ts`). **Аддитивное** расширение
 * `TaskCommandResult['ok']` — не новый тип результата: существующие
 * вызывающие (`packages/app` `Today.tsx`/`Inbox.tsx`/`ProjectDetail.tsx`),
 * типизированные на `Promise<TaskCommandResult>`, продолжают
 * компилироваться без изменений (структурная типизация: объект с ДОПОЛНИ-
 * ТЕЛЬНЫМИ полями по-прежнему присваивается более узкому типу `TaskCommandResult`).
 * Links — сознательно ВНЕ охвата (в `01§9` упомянуты в одном списке с
 * subtasks/checklist, но командного слоя `task-link` ещё нигде нет в дереве
 * пакетов — заведёт будущий эпик, не этот).
 */
export type DeleteTaskResult =
  | {
      readonly status: 'ok';
      readonly task: Task;
      readonly affectedSubtaskIds: readonly Uuid[];
      readonly affectedChecklistItemIds: readonly Uuid[];
    }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' };

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
 *
 * **Каскад (`01§9`, пакет работ E10).** Перед tombstone самой задачи:
 *
 *  1. Прямые живые subtasks (`tasks.listDirectSubtasks`, оба статуса —
 *     spec не оговаривает "только active" для этого каскада, в отличие от
 *     отмены напоминаний при архивации Project) — каждый tombstone-ится
 *     РЕКУРСИВНЫМ вызовом этой же функции (не второй копией логики
 *     удаления — переиспользует и собственный каскад чек-листа субтаска, и
 *     собственную повторную валидацию). Глубина иерархии ≤1 (правило 7)
 *     гарантирует, что рекурсия не уходит глубже одного уровня: у субтаска
 *     не может быть собственных subtasks.
 *  2. Живые checklist items самой задачи (`checklistItems.listByTask`) —
 *     каждый tombstone-ится через уже готовый `deleteChecklistItemCommand`
 *     (E10, тот же приём, что `project-delete.ts` переиспользует
 *     `deleteTaskCommand` на каждую задачу проекта — не пишет второй
 *     валидатор/каскад в обход).
 *
 * Не единая атомарная транзакция целиком (тот же задокументированный
 * компромисс, что уже принят `project-archive.ts`/`project-delete.ts`: нет
 * batch-примитива в `@shagi/storage`, каждый вложенный вызов открывает
 * собственную `runTransaction`). Failures отдельно не собираются (в отличие
 * от `DeleteSectionResult.taskFailures`): под этим каскадом нет параллельной
 * записи — subtasks/checklist items читаются `listDirectSubtasks`/
 * `listByTask` (только живые) непосредственно перед их же удалением в
 * рамках одного синхронного вызова команды, поэтому у вложенного
 * `deleteTaskCommand`/`deleteChecklistItemCommand` нет пути вернуть
 * `rejected`/`not_found` на только что прочитанной живой записи.
 */
export async function deleteTaskCommand(
  input: DeleteTaskInput,
  deps: TaskCommandDeps,
): Promise<DeleteTaskResult> {
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

  const [activeSubtasks, completedSubtasks] = await Promise.all([
    deps.storage.tasks.listDirectSubtasks(current.id, 'active'),
    deps.storage.tasks.listDirectSubtasks(current.id, 'completed'),
  ]);
  const affectedSubtaskIds: Uuid[] = [];
  for (const subtask of [...activeSubtasks, ...completedSubtasks]) {
    const subtaskResult = await deleteTaskCommand({ id: subtask.id }, deps);
    if (subtaskResult.status === 'ok') {
      affectedSubtaskIds.push(subtask.id);
    }
  }

  const checklistItems = await deps.storage.checklistItems.listByTask(current.id);
  const affectedChecklistItemIds: Uuid[] = [];
  for (const item of checklistItems) {
    const itemResult = await deleteChecklistItemCommand({ taskId: current.id, id: item.id }, deps);
    if (itemResult.status === 'ok') {
      affectedChecklistItemIds.push(item.id);
    }
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

  return { status: 'ok', task: finalTask, affectedSubtaskIds, affectedChecklistItemIds };
}
