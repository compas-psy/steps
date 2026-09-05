import type { ChecklistItem } from '../entities/checklist-item.js';
import type { Task } from '../entities/task.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import type { ValidationResult } from '../validation/types.js';
import { flattenTask } from './assemble.js';
import { buildChecklistItemTombstone } from './checklist-item-delete.js';
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
 *
 * `ok.validation` — добавлено пакетом работ E08.2 вслед за тем же полем на
 * `TaskCommandResult['ok']` (`commands/types.ts`): `deleteTaskCommand` тоже
 * прогоняет `validateDomainMutation` на неизменных данных (см. комментарий
 * функции ниже) и держит результат локально — без этого поля структурное
 * присваивание `Promise<DeleteTaskResult>` в места, типизированные на
 * `Promise<TaskCommandResult>` (`Inbox.tsx`/`ProjectDetail.tsx`
 * `runCommand`), перестало бы компилироваться, как только `ok` того типа
 * стал требовать `validation`. Для мягкого удаления содержимое всегда
 * `{valid:true, issues:[]}` (удаление не меняет ни одно проверяемое поле),
 * но поле присутствует ради той же структурной совместимости, не потому что
 * оно содержательно здесь.
 */
export type DeleteTaskResult =
  | {
      readonly status: 'ok';
      readonly task: Task;
      readonly affectedSubtaskIds: readonly Uuid[];
      readonly affectedChecklistItemIds: readonly Uuid[];
      /** Снимки тех же пунктов уже в состоянии tombstone — материал Undo
       * (`01§9` "one Undo restores graph", пакет работ Undo/Restore R1).
       * Почему снимки, а не одни id, как у subtasks: `TaskRepository.findById`
       * читает и tombstone (её командам ЕСТЬ откуда перечитать), а
       * `ChecklistItemRepository` умеет только `listByTask`/`countActiveByTask`
       * и обе отдают исключительно живые пункты (`packages/storage`) —
       * удалённый пункт после каскада не читается вообще ничем. Либо этот
       * снимок, либо новый метод чтения tombstone во всех адаптерах
       * хранилища; ST §58 прямо разрешает узкий UndoToken, несущий ровно то,
       * что нужно допустимой обратной мутации, и это он и есть. */
      readonly affectedChecklistItems: readonly ChecklistItem[];
      readonly validation: ValidationResult;
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
 * **Одна транзакция на весь каскад** (пакет работ Undo/Restore R1, ST §58
 * U2). Раньше каскад шёл вложенными вызовами команд, каждый со своей
 * `runTransaction` — тот же компромисс, что у `project-archive.ts`/
 * `project-delete.ts`. Для Undo он оказался неприемлем: `01§9` требует
 * «one Undo restores graph», а откат может вернуть только то, что было
 * применено целиком. Пока каскад был цепочкой транзакций, падение на
 * середине оставляло состояние «часть графа удалена, часть жива», которого
 * не существует ни в одном допустимом доменном состоянии и которое нечем
 * откатить. Поэтому теперь записи собираются заранее (`collectTombstones`
 * ниже — обход без единой записи), а применяются ОДНИМ `applyMutation`:
 * либо снесён весь граф, либо не изменилось ничего.
 *
 * Failures отдельно не собираются (в отличие от
 * `DeleteSectionResult.taskFailures`): под этим каскадом нет параллельной
 * записи — subtasks/checklist items читаются `listDirectSubtasks`/
 * `listByTask` (только живые) непосредственно перед сборкой их tombstone в
 * рамках одного синхронного вызова команды.
 */
/** Пустой накопитель для `collectTombstones` — чтобы вызывающие команды не
 * повторяли форму по памяти. */
export function emptyTombstoneCollection(): TombstoneCollection {
  return { writes: [], outbox: [], subtaskIds: [], checklistItemIds: [], checklistItems: [] };
}

/** Накопитель обхода каскада: записи и outbox всего графа до применения.
 * Экспортируется, потому что каскад удаления нужен ещё двум командам
 * повторов (`delete-series.ts`, `undo-complete-occurrence.ts`) — им он
 * нужен ВНУТРИ их собственной мутации, а не отдельной транзакцией, иначе
 * «граница серии выставлена, а occurrence ещё жив» переживает падение. */
export interface TombstoneCollection {
  readonly writes: CommandEntityWrite[];
  readonly outbox: SyncOutboxEntry[];
  readonly subtaskIds: Uuid[];
  readonly checklistItemIds: Uuid[];
  readonly checklistItems: ChecklistItem[];
}

/**
 * Обход графа БЕЗ записи: собирает tombstone самой задачи, её живых прямых
 * подзадач (рекурсивно — глубина иерархии ≤1 по правилу 7, поэтому рекурсия
 * не уходит дальше одного уровня) и живых пунктов чек-листа каждой из них.
 * Возвращает `ValidationResult` первого отказа — тогда не применяется ничего.
 */
export async function collectTombstones(
  current: Task,
  deps: TaskCommandDeps,
  generateOpId: () => Uuid,
  acc: TombstoneCollection,
): Promise<ValidationResult> {
  // Мягкое удаление не меняет ни одно поле, покрытое инвариантами 1–26 —
  // `deletedAt` вне `TaskValidationInput`. Тем не менее прогоняем валидатор
  // на неизменных данных (единая точка входа для всех локальных команд,
  // CLAUDE.md, «Один валидатор на все инварианты») — так проверка не
  // становится опциональной для одной из четырёх команд по недосмотру.
  const validationInput = flattenTask(current);
  const context = await deps.storage.tasks.loadValidationContext(current.id, current.parentTaskId);
  const validation = validateDomainMutation({ entity: 'task', data: validationInput, context });
  if (!validation.valid) {
    return validation;
  }

  const [activeSubtasks, completedSubtasks] = await Promise.all([
    deps.storage.tasks.listDirectSubtasks(current.id, 'active'),
    deps.storage.tasks.listDirectSubtasks(current.id, 'completed'),
  ]);
  for (const subtask of [...activeSubtasks, ...completedSubtasks]) {
    if (subtask.deletedAt !== null) continue;
    // eslint-disable-next-line no-await-in-loop -- порядок значим: дети попадают в мутацию раньше родителя, чтобы журнал outbox читался так же, как в `complete-many.ts`
    const nested = await collectTombstones(subtask, deps, generateOpId, acc);
    if (!nested.valid) return nested;
    acc.subtaskIds.push(subtask.id);
  }

  const checklistItems = await deps.storage.checklistItems.listByTask(current.id);
  for (const item of checklistItems) {
    if (item.deletedAt !== null) continue;
    const built = buildChecklistItemTombstone(item, deps, generateOpId);
    if (built.status === 'rejected') return built.validation;
    acc.writes.push(built.write);
    acc.outbox.push(built.outbox);
    acc.checklistItemIds.push(item.id);
    acc.checklistItems.push(built.item);
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

  acc.writes.push({ entity: 'task', value: finalTask });
  acc.outbox.push({
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
  return validation;
}

export async function deleteTaskCommand(
  input: DeleteTaskInput,
  deps: TaskCommandDeps,
): Promise<DeleteTaskResult> {
  const current = await deps.storage.tasks.findById(input.id);
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const acc = emptyTombstoneCollection();
  const validation = await collectTombstones(current, deps, generateOpId, acc);
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const mutation: CommandDomainMutation = {
    writes: acc.writes,
    // Непуст по построению: последней в обходе всегда добавляется запись
    // самой удаляемой задачи вместе с её outbox-записью.
    outbox: acc.outbox as unknown as CommandDomainMutation['outbox'],
  };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  const rootWrite = acc.writes[acc.writes.length - 1];
  return {
    status: 'ok',
    task: (rootWrite as { readonly value: Task }).value,
    affectedSubtaskIds: acc.subtaskIds,
    affectedChecklistItemIds: acc.checklistItemIds,
    affectedChecklistItems: acc.checklistItems,
    validation,
  };
}
