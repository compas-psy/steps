import type { ChecklistItem } from '../entities/checklist-item.js';
import type { Task, TaskSource } from '../entities/task.js';
import type { ValidationResult } from '../validation/types.js';
import type { OwnerScope, Uuid } from '../values.js';
import { completeTaskCommand } from './complete-task.js';
import { createChecklistItemCommand } from './checklist-item-create.js';
import { deleteChecklistItemCommand } from './checklist-item-delete.js';
import { createTaskCommand } from './create-task.js';
import { deleteTaskCommand } from './delete-task.js';
import type { NewRank } from './project-rank.js';
import type { TaskCommandDeps } from './types.js';
import { updateChecklistItemCommand } from './checklist-item-update.js';

/**
 * `01§10`: "Checklist → subtask preserves text/completed state." /
 * "Subtask → checklist warns about metadata loss and requires confirm."
 * Confirm — забота UI, выше по стеку (тот же принцип, что уже применён для
 * "Подзадача станет отдельной задачей", `01§12`): обе команды этого файла
 * исполняют конверсию БЕЗУСЛОВНО, когда их вызвали — согласие уже получено
 * до вызова.
 *
 * Единый `deps: TaskCommandDeps` на обе команды и все их внутренние шаги —
 * возможно именно потому, что `ChecklistItemCommandDeps` структурно
 * идентичен `TaskCommandDeps` (см. комментарий `checklist-item-port.ts`):
 * не нужно собирать два разных объекта зависимостей и передавать оба.
 */

// --- Checklist item → Subtask ------------------------------------------------

export interface ConvertChecklistItemToSubtaskInput {
  readonly checklistItemId: Uuid;
  /** Задача, которой принадлежит конвертируемый пункт — и одновременно
   * родитель нового subtask. Один параметр играет обе роли намеренно: в
   * Task Detail пункт чек-листа всегда живёт ровно в одной задаче, и
   * конверсия делает его подзадачей ЭТОЙ ЖЕ задачи — другой сценарий
   * (перенести пункт под ДРУГУЮ задачу) нигде не описан в `01§10`. */
  readonly parentTaskId: Uuid;
  readonly ownerScope: OwnerScope;
  readonly rank: NewRank;
  readonly source?: TaskSource;
}

export type ConvertChecklistItemToSubtaskResult =
  | { readonly status: 'ok'; readonly task: Task; readonly deletedChecklistItemId: Uuid }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' };

/**
 * Механически (задание пакета работ): читает `ChecklistItem` (текст/`done`),
 * создаёт Task через `createTaskCommand` с `parentTaskId`, `title: item.text`
 * — `createTaskCommand` умеет создавать только АКТИВНУЮ задачу (см. её
 * собственный комментарий), поэтому завершённость строится ВТОРЫМ шагом,
 * тем же приёмом, что `completeTaskCommand` (не изобретается прямая сборка
 * `TaskCompletion`, задание прямо просит "используй ту же форму"), затем
 * мягко удаляет исходный `ChecklistItem`. Порядок — создание СНАЧАЛА,
 * удаление исходного пункта ПОСЛЕДНИМ и только при успехе: при отказе
 * (например, лимит 16 прямых subtasks родителя) исходный пункт остаётся
 * нетронутым, не теряется в недописанной конверсии.
 */
export async function convertChecklistItemToSubtaskCommand(
  input: ConvertChecklistItemToSubtaskInput,
  deps: TaskCommandDeps,
): Promise<ConvertChecklistItemToSubtaskResult> {
  const siblings = await deps.storage.checklistItems.listByTask(input.parentTaskId);
  const item = siblings.find((candidate) => candidate.id === input.checklistItemId) ?? null;
  if (item === null) {
    return { status: 'not_found' };
  }

  const parentTask = await deps.storage.tasks.findById(input.parentTaskId);
  if (parentTask === null || parentTask.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const created = await createTaskCommand(
    {
      ownerScope: input.ownerScope,
      title: item.text,
      captureState: 'processed',
      parentTaskId: input.parentTaskId,
      projectId: parentTask.projectId,
      sectionId: parentTask.sectionId,
      source: input.source ?? 'user',
      rank: input.rank,
    },
    deps,
  );
  if (created.status !== 'ok') {
    return created;
  }

  const finalTaskResult = item.done
    ? await completeTaskCommand({ id: created.task.id }, deps)
    : created;
  if (finalTaskResult.status !== 'ok') {
    return finalTaskResult;
  }

  await deleteChecklistItemCommand({ taskId: input.parentTaskId, id: item.id }, deps);

  return {
    status: 'ok',
    task: finalTaskResult.task,
    deletedChecklistItemId: item.id,
  };
}

// --- Subtask → Checklist item ------------------------------------------------

export interface ConvertSubtaskToChecklistItemInput {
  readonly taskId: Uuid;
  readonly targetTaskId: Uuid;
  readonly rank: NewRank;
}

export type ConvertSubtaskToChecklistItemResult =
  | { readonly status: 'ok'; readonly checklistItem: ChecklistItem; readonly deletedTaskId: Uuid }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' };

/**
 * Обратное направление (задание пакета работ): читает Task (subtask),
 * создаёт `ChecklistItem` с `text: task.title`, `done: task.status===
 * 'completed'`, на `targetTaskId`, затем мягко удаляет исходный Task
 * (`deleteTaskCommand`, уже готова — заодно каскадирует checklist items
 * самого субтаска, если были; глубина ≤1 исключает у него собственные
 * subtasks). Метаданные subtask (сроки, приоритет) действительно теряются
 * — это и есть "warns about metadata loss", подтверждение получено выше по
 * стеку до вызова этой команды, не здесь.
 */
export async function convertSubtaskToChecklistItemCommand(
  input: ConvertSubtaskToChecklistItemInput,
  deps: TaskCommandDeps,
): Promise<ConvertSubtaskToChecklistItemResult> {
  const subtask = await deps.storage.tasks.findById(input.taskId);
  if (subtask === null || subtask.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const created = await createChecklistItemCommand(
    { taskId: input.targetTaskId, text: subtask.title, rank: input.rank },
    deps,
  );
  if (created.status !== 'ok') {
    return created;
  }

  const finalItemResult =
    subtask.status === 'completed'
      ? await updateChecklistItemCommand(
          { taskId: input.targetTaskId, id: created.item.id, patch: { done: true } },
          deps,
        )
      : created;
  if (finalItemResult.status !== 'ok') {
    return finalItemResult;
  }

  await deleteTaskCommand({ id: input.taskId }, deps);

  return {
    status: 'ok',
    checklistItem: finalItemResult.item,
    deletedTaskId: input.taskId,
  };
}
