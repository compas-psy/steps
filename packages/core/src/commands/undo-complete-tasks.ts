import type { Task } from '../entities/task.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import type { TaskValidationInput } from '../validation/task.js';
import type { ValidationResult } from '../validation/types.js';
import type { Uuid } from '../values.js';
import { buildCompletion, flattenTask } from './assemble.js';
import { buildPatchJson, diffChangedFields, pickClocks, tickClocks } from './clock-diff.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps } from './types.js';

/**
 * Undo завершения в 6-секундном окне (`01§8` "Undo", ST §58 U1) —
 * обратная доменная мутация к `completeTaskCommand`/`completeManyCommand`.
 *
 * Почему отдельная команда, а не переиспользование соседних:
 *
 * - `restoreTaskCommand` (`restore-task.ts`) — про экран «Завершённые»:
 *   произвольная давность и ПЯТЬ ветвлений §11.10/§11.11, часть которых
 *   требует явного выбора пользователя (архивный проект, пара
 *   родитель/подзадача). Undo сразу после действия не спрашивает ничего:
 *   прежнее состояние известно точно, оно было секунду назад.
 * - `undoCompleteOccurrenceCommand` — про повторы: снимает завершение и
 *   убирает сгенерированный next occurrence, если тот нетронут. Обычные
 *   задачи ничего такого не порождают, и смешивать эти две ответственности
 *   значило бы тащить в простой откат проверку `revision===1n` чужой
 *   сущности.
 *
 * Откат — это НОВАЯ мутация вперёд (`revision + 1`, свежие HLC, запись в
 * outbox), а не отмотка истории: `01§8` требует восстановить допустимое
 * доменное состояние, а не переписать прошлое, и только так откат остаётся
 * sync-safe (`MASTER §7`: domain validation → canonical mutation → outbox →
 * indexes → notification reconciliation → UI).
 *
 * Весь набор — ОДНА транзакция: «Завершить всё» завершает родителя и
 * активные подзадачи одной операцией (`01§8`), значит и обратная операция
 * обязана быть одной, иначе между двумя транзакциями возникает
 * запрещённое состояние «completed parent + active child».
 */
export interface UndoCompleteTasksInput {
  /** Id, ВОЗВРАЩЁННЫЕ прямой командой (`CompleteManyResult.completedIds`
   * или один id из `completeTaskCommand`) — не пересчитанные заново
   * вызывающим кодом: откат обязан затрагивать ровно то, что было
   * применено, иначе он «восстанавливает похожее», а не прежнее. */
  readonly ids: readonly Uuid[];
}

export type UndoCompleteTasksResult =
  | {
      readonly status: 'ok';
      readonly tasks: readonly Task[];
      readonly validation: ValidationResult;
    }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' }
  /** Среди откатываемых есть подзадача, чей родитель остаётся завершённым.
   * Отдельный исход, а не `ValidationIssue`: «активный ребёнок под
   * завершённым родителем» (`01§8`) — инвариант КОМАНДНОГО слоя, его не
   * проверяет ни одно правило валидатора, и выдумывать несуществующий код
   * ошибки ради красивого возврата значило бы соврать о происхождении
   * запрета. Тот же приём, что у `restoreTaskCommand`
   * (`hierarchy_choice_required`/`recurring_next_exists`). */
  | { readonly status: 'parent_still_completed'; readonly parentId: Uuid }
  /** Ни одна из указанных задач не находится в завершённом состоянии —
   * откатывать нечего. Отдельный исход, не ошибка: повторное нажатие
   * «Отменить» (двойной клик, повторный тап) обязано быть идемпотентным
   * (ST §58, UI contract), а не применять инверсию дважды. */
  | { readonly status: 'not_completed' };

/**
 * Порядок внутри одной транзакции значения для хранилища не имеет (мутация
 * применяется целиком), но для ВАЛИДАЦИИ имеет: правило «активный ребёнок
 * под завершённым родителем запрещён» (`01§8`) проверяется по состоянию,
 * которое сложится ПОСЛЕ отката. Поэтому набор откатываемых id известен
 * заранее и передаётся в контекст проверки ниже.
 */
export async function undoCompleteTasksCommand(
  input: UndoCompleteTasksInput,
  deps: TaskCommandDeps,
): Promise<UndoCompleteTasksResult> {
  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const targets: Task[] = [];
  for (const id of input.ids) {
    // eslint-disable-next-line no-await-in-loop -- набор мал (родитель + прямые подзадачи), порядок чтения не влияет на результат
    const current = await deps.storage.tasks.findById(id);
    if (current === null || current.deletedAt !== null) return { status: 'not_found' };
    targets.push(current);
  }
  if (targets.length === 0) return { status: 'not_found' };

  const completedTargets = targets.filter((task) => task.status === 'completed');
  if (completedTargets.length === 0) return { status: 'not_completed' };

  // Родители раньше детей — зеркало прямого действия: `completeManyCommand`
  // применяет каскад ДЕТЬМИ раньше родителей (`bulk-completion-plan.ts`), и
  // вызывающий код передаёт сюда её `completedIds` как есть. В одной
  // транзакции хранилищу порядок безразличен, но журнал outbox будущий
  // сервер читает последовательно, и обратный порядок дал бы в нём
  // промежуточное «активный ребёнок под завершённым родителем» (`01§8`) —
  // ровно то, от чего защищается `undo-delete-tasks.ts`. Найдено ревью
  // пакета работ Undo/Restore R1.
  const orderedTargets = completedTargets.toReversed();

  const revertedIds = new Set(completedTargets.map((task) => task.id));

  const writes: CommandEntityWrite[] = [];
  const outbox: SyncOutboxEntry[] = [];
  let lastValidation: ValidationResult = { valid: true, issues: [] };

  for (const current of orderedTargets) {
    // Родитель, который ОСТАЁТСЯ завершённым, — запрещённое состояние для
    // возвращаемого в active ребёнка (`01§8`). Проверяется до сборки
    // мутации: половина отката хуже честного отказа.
    if (current.parentTaskId !== null && !revertedIds.has(current.parentTaskId)) {
      // eslint-disable-next-line no-await-in-loop -- см. выше
      const parent = await deps.storage.tasks.findById(current.parentTaskId);
      if (parent !== null && parent.deletedAt === null && parent.status === 'completed') {
        return { status: 'parent_still_completed', parentId: parent.id };
      }
    }

    const validationInput: TaskValidationInput = {
      ...flattenTask(current),
      status: 'active',
      completedAt: null,
      completionKind: null,
    };
    // eslint-disable-next-line no-await-in-loop -- см. выше
    const context = await deps.storage.tasks.loadValidationContext(
      current.id,
      current.parentTaskId,
    );
    const validation = validateDomainMutation({ entity: 'task', data: validationInput, context });
    lastValidation = validation;
    if (!validation.valid) return { status: 'rejected', validation };

    const revertedTask: Task = {
      ...current,
      ...buildCompletion({ status: 'active', completedAt: null, completionKind: null }),
      updatedAt: deps.now,
      revision: current.revision + 1n,
    };
    const changedFields = diffChangedFields(current, revertedTask);
    const finalTask: Task = {
      ...revertedTask,
      clocks: tickClocks(current.clocks, changedFields, hlc),
    };

    writes.push({ entity: 'task', value: finalTask });
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

  const mutation: CommandDomainMutation = {
    writes,
    // Непуст по построению: записи добавляются парой с `writes`, а пустой
    // `completedTargets` отсечён выше исходом `not_completed`.
    outbox: outbox as unknown as CommandDomainMutation['outbox'],
  };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return {
    status: 'ok',
    tasks: writes.map((write) => write.value as Task),
    validation: lastValidation,
  };
}
