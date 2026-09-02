/**
 * Массовое завершение выбранных задач — M37 «Multi-select», нормативное
 * поведение `01§20` «Bulk completion hierarchy».
 *
 * --- Почему отдельная команда, а не цикл по `completeTaskCommand` --------
 *
 * ТЗ требует, чтобы каскад «родитель + его активные прямые подзадачи»
 * применялся АТОМАРНО. Цикл из отдельных команд этого не даёт: каждая
 * открывает свою транзакцию, и падение на середине оставило бы часть
 * выбора завершённой, а часть — нет. Здесь все записи и все outbox-записи
 * собираются заранее и применяются ОДНОЙ транзакцией: либо завершилось
 * всё, либо не изменилось ничего.
 *
 * Порядок внутри плана всё равно важен (дети раньше родителей, см.
 * `bulk-completion-plan.ts`): в одной транзакции промежуточных состояний
 * не видно снаружи, но тот же порядок сохраняет смысл журнала outbox для
 * будущего сервера — сначала приходит завершение ребёнка, потом родителя.
 *
 * --- Повторы -------------------------------------------------------------
 *
 * `01§20`: «Mixed recurring selection applies to current occurrences only;
 * no silent series-wide edit». Задачи с `seriesId != null` эта команда НЕ
 * трогает и честно возвращает их отдельным списком (`skippedRecurringIds`)
 * — генерация следующего occurrence живёт в `completeOccurrenceCommand` и
 * не сводится к записи одной строки, а тихо завершить occurrence «как
 * обычную задачу» значило бы сломать серию. Вызывающий код решает, что с
 * ними делать; экран M37 применяет к ним ту самую команду по одной.
 *
 * --- Инвариант «нет завершённого родителя с активным ребёнком» ------------
 *
 * `01§8` его формулирует, но валидатор (`validation/task.ts`) его НЕ
 * проверяет: в `TaskValidationContext` нет счётчика активных подзадач.
 * Поэтому за него отвечает эта команда — через план, который всегда тянет
 * активных детей выбранного родителя вместе с ним. Обнаружено при
 * реализации M37; отдельным правилом валидатора это не закрывается здесь,
 * потому что валидатор — общий и для входящих sync-патчей (CLAUDE.md), и
 * его расширение требует своего пакета работ.
 */
import type { Task } from '../entities/task.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { generateUuidV7 } from '../identity/index.js';
import { validateDomainMutation } from '../validation/index.js';
import type { TaskValidationInput } from '../validation/task.js';
import type { Uuid } from '../values.js';
import { buildCompletion, flattenTask } from './assemble.js';
import { planBulkCompletion, type BulkCompletionPlan } from './bulk-completion-plan.js';
import { buildPatchJson, diffChangedFields, pickClocks, tickClocks } from './clock-diff.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps } from './types.js';

export interface CompleteManyInput {
  readonly ids: readonly Uuid[];
}

export interface CompleteManyResult {
  readonly status: 'ok' | 'rejected';
  /** Что реально завершено этой транзакцией. */
  readonly completedIds: readonly Uuid[];
  /** Повторяющиеся occurrence — не тронуты, см. заголовок файла. */
  readonly skippedRecurringIds: readonly Uuid[];
  /** Сколько подзадач добавил каскад сверх явного выбора (`01§20`). */
  readonly additionalChildCount: number;
}

/**
 * Считает план БЕЗ записи — экран показывает по нему единственное
 * агрегированное подтверждение. Отдельный шаг, а не флаг у команды: «Отмена
 * не меняет ничего» (`01§20`) достигается тем, что до подтверждения
 * хранилище вообще не трогают.
 */
export async function previewBulkCompletion(
  ids: readonly Uuid[],
  deps: TaskCommandDeps,
): Promise<BulkCompletionPlan> {
  const childrenOf = new Map<Uuid, readonly Uuid[]>();
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop -- выбор человека, десятки задач максимум; параллелить не за чем
    const children = await deps.storage.tasks.listDirectSubtasks(id, 'active');
    if (children.length > 0)
      childrenOf.set(
        id,
        children.map((child) => child.id),
      );
  }
  return planBulkCompletion(ids, childrenOf);
}

export async function completeManyCommand(
  input: CompleteManyInput,
  deps: TaskCommandDeps,
): Promise<CompleteManyResult> {
  const plan = await previewBulkCompletion(input.ids, deps);
  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const writes: CommandEntityWrite[] = [];
  const outbox: SyncOutboxEntry[] = [];
  const completedIds: Uuid[] = [];
  const skippedRecurringIds: Uuid[] = [];

  for (const id of plan.orderedIds) {
    // eslint-disable-next-line no-await-in-loop -- порядок значим (дети раньше родителей), см. заголовок
    const current = await deps.storage.tasks.findById(id);
    if (current === null || current.deletedAt !== null || current.status === 'completed') continue;
    if (current.seriesId !== null) {
      skippedRecurringIds.push(id);
      continue;
    }

    const validationInput: TaskValidationInput = {
      ...flattenTask(current),
      status: 'completed',
      completedAt: deps.now,
      completionKind: 'done',
    };
    // eslint-disable-next-line no-await-in-loop -- та же причина
    const context = await deps.storage.tasks.loadValidationContext(
      current.id,
      current.parentTaskId,
    );
    const validation = validateDomainMutation({ entity: 'task', data: validationInput, context });
    // Один отказ отменяет ВЕСЬ набор: половина выбора, применённая молча,
    // хуже честного «ничего не изменилось» (`01§20`, «Cancel leaves the
    // entire selection unchanged» — тот же принцип и для отказа).
    if (!validation.valid) {
      return {
        status: 'rejected',
        completedIds: [],
        skippedRecurringIds: [],
        additionalChildCount: plan.additionalChildCount,
      };
    }

    const nextTask: Task = {
      ...current,
      ...buildCompletion({ status: 'completed', completedAt: deps.now, completionKind: 'done' }),
      updatedAt: deps.now,
      revision: current.revision + 1n,
    };
    const changedFields = diffChangedFields(current, nextTask);
    const finalTask: Task = { ...nextTask, clocks: tickClocks(current.clocks, changedFields, hlc) };

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
    completedIds.push(current.id);
  }

  if (writes.length > 0) {
    const mutation: CommandDomainMutation = {
      writes,
      // `outbox` объявлен непустым массивом (`NonEmptyArray`) — здесь он
      // непуст по построению: записи добавляются парой с `writes`.
      outbox: outbox as unknown as CommandDomainMutation['outbox'],
    };
    await deps.storage.runTransaction(async (tx) => {
      await tx.applyMutation(mutation);
    });
  }

  return {
    status: 'ok',
    completedIds,
    skippedRecurringIds,
    additionalChildCount: plan.additionalChildCount,
  };
}
