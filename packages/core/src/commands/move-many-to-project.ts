/**
 * Массовый перенос выбранных задач в проект — M37 «Multi-select»
 * (`01§20`, действие «Move project»), нормативные правила иерархии —
 * `01§12` «Parent/Subtask project moves».
 *
 * Отдельная команда, а не цикл по `updateTaskCommand`, ровно по той же
 * причине, что и `completeManyCommand`: ТЗ требует, чтобы перенос
 * родителя каскадировал прямые подзадачи «in one transaction». Цикл из
 * отдельных команд оставил бы при падении на середине родителя в новом
 * проекте, а его подзадачи — в старом, то есть нарушенным сам инвариант
 * «Parent and direct Subtasks share Project and Section».
 *
 * Что решает эта команда, а что — план (`bulk-project-move-plan.ts`):
 * план чисто и без хранилища отвечает «кого переносим, кого отцепляем»,
 * команда — читает текущее состояние, валидирует и пишет.
 *
 * Раздел (`sectionId`) при переносе всегда сбрасывается в `null`: разделы
 * принадлежат конкретному проекту, поэтому перенести задачу в другой
 * проект, сохранив ссылку на чужой раздел, нельзя в принципе. Задача
 * попадает в синтетический «Без раздела» — тот самый, который `01§12`
 * описывает как место приземления при удалении раздела.
 */
import type { Task } from '../entities/task.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { generateUuidV7 } from '../identity/index.js';
import { validateDomainMutation } from '../validation/index.js';
import type { TaskValidationInput } from '../validation/task.js';
import type { Uuid } from '../values.js';
import { buildHierarchy, buildProjectPlacement, flattenTask } from './assemble.js';
import { planBulkProjectMove, type BulkProjectMovePlan } from './bulk-project-move-plan.js';
import { buildPatchJson, diffChangedFields, pickClocks, tickClocks } from './clock-diff.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps } from './types.js';

export interface MoveManyToProjectInput {
  readonly ids: readonly Uuid[];
  /** Целевой проект; `null` — «Входящие». */
  readonly targetProjectId: Uuid | null;
  /** Имя целевого проекта на момент переноса — снимок для истории
   * (CLAUDE.md п.7, `01§12`). У команды нет доступа к `ProjectRepository`,
   * поэтому имя обязан передать вызывающий код — тот же принцип, что в
   * `createTaskCommand` и `updateTaskCommand`. */
  readonly targetProjectName: string | null;
}

export interface MoveManyToProjectResult {
  readonly status: 'ok' | 'rejected';
  readonly movedIds: readonly Uuid[];
  /** Сколько подзадач было отцеплено («Подзадача станет отдельной
   * задачей», `01§12`). */
  readonly detachedChildCount: number;
}

/** Считает план БЕЗ записи — по нему экран показывает единственное
 * агрегированное подтверждение отцепления. */
export async function previewBulkProjectMove(
  ids: readonly Uuid[],
  targetProjectId: Uuid | null,
  deps: TaskCommandDeps,
): Promise<BulkProjectMovePlan> {
  const activeChildrenOf = new Map<Uuid, readonly Uuid[]>();
  const parentOf = new Map<Uuid, Uuid>();
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop -- выбор человека, десятки задач максимум
    const children = await deps.storage.tasks.listDirectSubtasks(id, 'active');
    if (children.length > 0)
      activeChildrenOf.set(
        id,
        children.map((child) => child.id),
      );
    // eslint-disable-next-line no-await-in-loop -- та же причина
    const task = await deps.storage.tasks.findById(id);
    if (task !== null && task.parentTaskId !== null) parentOf.set(id, task.parentTaskId);
  }
  return planBulkProjectMove({ selectedIds: ids, activeChildrenOf, parentOf, targetProjectId });
}

export async function moveManyToProjectCommand(
  input: MoveManyToProjectInput,
  deps: TaskCommandDeps,
): Promise<MoveManyToProjectResult> {
  const plan = await previewBulkProjectMove(input.ids, input.targetProjectId, deps);
  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const writes: CommandEntityWrite[] = [];
  const outbox: SyncOutboxEntry[] = [];
  const movedIds: Uuid[] = [];
  /** Кто переезжает в этом же плане — нужно для правки снимка родителя
   * перед валидацией, см. ниже. */
  const movingIds = new Set(plan.steps.map((step) => step.id));

  for (const step of plan.steps) {
    // eslint-disable-next-line no-await-in-loop -- порядок и объём те же, что в completeMany
    const current = await deps.storage.tasks.findById(step.id);
    if (current === null || current.deletedAt !== null) continue;

    const parentTaskId = step.detachFromParent ? null : current.parentTaskId;
    // `01§12`: «moving top-level Task to Inbox ... sets Parent
    // capture_state=inbox; attached Subtasks remain processed» — поэтому
    // флаг считает план, а не эта строка.
    const captureState = step.moveToInboxCapture ? 'inbox' : current.captureState;

    const validationInput: TaskValidationInput = {
      ...flattenTask(current),
      projectId: input.targetProjectId,
      sectionId: null,
      parentTaskId,
      captureState,
    };
    // eslint-disable-next-line no-await-in-loop -- та же причина
    const loaded = await deps.storage.tasks.loadValidationContext(current.id, parentTaskId);
    // Снимок родителя приходит из ХРАНИЛИЩА, то есть ещё с прежним
    // проектом: записи этой команды применяются одной транзакцией в самом
    // конце. Правило 6 валидатора («projectId подзадачи равен projectId
    // родителя») из-за этого отклоняло бы КАЖДЫЙ каскадный перенос —
    // именно так и упал первый прогон теста «переносит родителя и его
    // подзадачу ОДНОЙ транзакцией». Валидировать надо против того
    // состояния, которое транзакция создаёт, поэтому родителю, который
    // переезжает в этом же плане, снимок правится на целевое размещение.
    const parentMovesInThisPlan = parentTaskId !== null && movingIds.has(parentTaskId);
    const context =
      parentMovesInThisPlan && loaded.parent !== null
        ? {
            ...loaded,
            parent: { ...loaded.parent, projectId: input.targetProjectId, sectionId: null },
          }
        : loaded;
    const validation = validateDomainMutation({ entity: 'task', data: validationInput, context });
    // Один отказ отменяет ВЕСЬ набор — тот же принцип, что в
    // `completeManyCommand`: половина переноса хуже честного «ничего не
    // изменилось».
    if (!validation.valid) {
      return { status: 'rejected', movedIds: [], detachedChildCount: plan.detachedChildCount };
    }

    // Через сборщики `assemble.ts`, а не спредом: `Task` — размеченное
    // объединение (подзадача имеет `parentTaskId: Uuid` и обязательный
    // `captureState: 'processed'`), и отцепление переводит сущность в
    // другую ветку объединения. Спред этого не выражает — тип бы не сошёлся.
    const nextTask: Task = {
      ...current,
      ...buildHierarchy({
        parentTaskId,
        captureState,
        seriesId: current.seriesId,
        occurrenceSeq: current.occurrenceSeq,
        generatedFromOccurrenceId: current.generatedFromOccurrenceId,
      }),
      ...buildProjectPlacement({ projectId: input.targetProjectId, sectionId: null }),
      originalProjectNameSnapshot: input.targetProjectName,
      originalSectionNameSnapshot: null,
      updatedAt: deps.now,
      revision: current.revision + 1n,
    };
    const changedFields = diffChangedFields(current, nextTask);
    if (changedFields.length === 0) continue;
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
    movedIds.push(current.id);
  }

  if (writes.length > 0) {
    const mutation: CommandDomainMutation = {
      writes,
      outbox: outbox as unknown as CommandDomainMutation['outbox'],
    };
    await deps.storage.runTransaction(async (tx) => {
      await tx.applyMutation(mutation);
    });
  }

  return { status: 'ok', movedIds, detachedChildCount: plan.detachedChildCount };
}
