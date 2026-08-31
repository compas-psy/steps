import type { Temporal } from '@js-temporal/polyfill';

import type { CaptureState, DayBucket, Task } from '../entities/task.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import {
  clearDeadline,
  clearPlannedDate,
  setDayBucketLater,
  setPlannedDate,
  setPlannedTime,
} from '../rules/field-resets.js';
import { validateDomainMutation } from '../validation/index.js';
import type { TaskValidationInput } from '../validation/task.js';
import type { DurationMinutes, Priority, Uuid } from '../values.js';
import {
  buildCompletion,
  buildDeadline,
  buildHierarchy,
  buildPlanning,
  buildProjectPlacement,
  type FlatDeadline,
  type FlatPlanning,
} from './assemble.js';
import { buildPatchJson, diffChangedFields, pickClocks, tickClocks } from './clock-diff.js';
import { resolveTaskRank, type NewTaskRank } from './rank-input.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps, TaskCommandResult } from './types.js';

/**
 * Частичный патч существующей Task. Каждое поле — `?`, отсутствие ключа
 * означает "не трогать"; проверяется через `'field' in patch`, а не через
 * `??` — иначе явное намерение сбросить nullable-поле в `null` было бы
 * неотличимо от "поле не тронуто".
 *
 * `status`/`completedAt`/`completionKind` **не входят** в этот патч —
 * завершение задачи целиком принадлежит `completeTaskCommand` (задание,
 * раздел "Что реализовать", п.3); смешивать обе ответственности в одной
 * функции значило бы дублировать инвариант 12–13 в двух местах.
 */
export interface UpdateTaskPatch {
  readonly title?: string;
  readonly description?: string;
  readonly priority?: Priority;
  readonly projectId?: Uuid | null;
  readonly sectionId?: Uuid | null;
  /**
   * Снимок имени проекта/секции на момент ЭТОГО изменения `projectId`/
   * `sectionId` (CLAUDE.md, п.7 «снимок имени проекта на Task»; `01§12`
   * «Completed task history keeps project-name snapshot after project
   * deletion»). Опциональны и независимы от `projectId`/`sectionId` в этом
   * же патче намеренно: у `updateTaskCommand` нет доступа к
   * `ProjectRepository` (только Task-хранилище, `storage-port.ts`), поэтому
   * актуальное имя проекта на момент назначения обязан передать вызывающий
   * код (тот же принцип, что уже применён в `createTaskCommand` — снимок
   * там тоже вход, не вычисление команды). Найдено при приёмке E09.1:
   * `originalProjectNameSnapshot` уже существовал на `Task`/в
   * `createTaskCommand`, но не был доступен через `updateTaskCommand` —
   * единственный сегодня реальный путь назначить проект ПОСЛЕ создания
   * (`Inbox.tsx` «Проект», обработка Входящих) молча оставлял снимок
   * `null` навсегда, у задач, захваченных без проекта. Отсутствие ключа —
   * "не трогать снимок" (та же семантика `'field' in patch`, что у
   * остальных полей этого патча), не "очистить его".
   */
  readonly originalProjectNameSnapshot?: string | null;
  readonly originalSectionNameSnapshot?: string | null;
  readonly parentTaskId?: Uuid | null;
  readonly captureState?: CaptureState;
  readonly availableFrom?: Temporal.PlainDate | null;
  readonly plannedDate?: Temporal.PlainDate | null;
  readonly plannedTime?: Temporal.PlainTime | null;
  readonly durationMin?: DurationMinutes | null;
  readonly focusDate?: Temporal.PlainDate | null;
  readonly dayBucket?: DayBucket;
  readonly deadlineDate?: Temporal.PlainDate | null;
  readonly deadlineTime?: Temporal.PlainTime | null;
  readonly rank?: NewTaskRank;
}

export interface UpdateTaskInput {
  readonly id: Uuid;
  readonly patch: UpdateTaskPatch;
}

function flatPlanningOf(task: Task): FlatPlanning {
  return {
    availableFrom: task.availableFrom,
    plannedDate: task.plannedDate,
    plannedTime: task.plannedTime,
    durationMin: task.durationMin,
    focusDate: task.focusDate,
    dayBucket: task.dayBucket,
  };
}

function flatDeadlineOf(task: Task): FlatDeadline {
  return { deadlineDate: task.deadlineDate, deadlineTime: task.deadlineTime };
}

/**
 * Применяет уже готовые правила сброса из `rules/field-resets.ts` там, где
 * патч касается Planned Date/Time/day_bucket (задание, раздел "Что
 * реализовать", п.2 — не пишет эту логику заново). Работает на
 * промежуточном `FlatPlanning` (плоский, не union) — узкий `TaskPlanning`
 * нужен только на входе в сами функции `field-resets.ts`, и на каждом шаге
 * ниже промежуточное состояние гарантированно валидно (либо это исходная
 * задача, либо результат предыдущего валидного шага), поэтому
 * `buildPlanning` (та же сборка, что использует `createTaskCommand`)
 * безопасно конвертирует его в `TaskPlanning` прямо перед вызовом.
 *
 * Порядок шагов значим: сперва Planned Date (может сама сбросить
 * Time/Focus/day_bucket, `setPlannedDate`), затем Planned Time
 * (`setPlannedTime`, требует уже установленной даты — видит результат
 * предыдущего шага, не исходную задачу), затем явный `day_bucket='later'`
 * (`setDayBucketLater`, тоже требует даты и по определению правила следом
 * обнуляет Planned Time — если патч одновременно просил и время, и
 * "later", последнее побеждает как более специфичное действие).
 */
function applyPlanningPatch(current: Task, patch: UpdateTaskPatch): FlatPlanning {
  let flat = flatPlanningOf(current);

  if ('plannedDate' in patch) {
    const planning = buildPlanning(flat);
    flat =
      patch.plannedDate === null
        ? clearPlannedDate(planning)
        : setPlannedDate(planning, patch.plannedDate);
  }

  if ('plannedTime' in patch) {
    if (flat.plannedDate !== null) {
      const planningWithDate = buildPlanning(flat);
      if (planningWithDate.plannedDate === null) {
        throw new Error('applyPlanningPatch: недостижимо — flat.plannedDate уже проверен выше.');
      }
      flat = setPlannedTime(planningWithDate, patch.plannedTime ?? null);
    } else {
      // Нет Planned Date — специализированной функции применить не к чему;
      // проставляем как есть и оставляем `validateTask` (правило 1) поймать
      // несогласованность на шаге валидации ниже, а не молчать здесь.
      flat = { ...flat, plannedTime: patch.plannedTime ?? null };
    }
  }

  if ('dayBucket' in patch) {
    if (patch.dayBucket === 'later' && flat.plannedDate !== null) {
      const planningWithDate = buildPlanning(flat);
      if (planningWithDate.plannedDate === null) {
        throw new Error('applyPlanningPatch: недостижимо — flat.plannedDate уже проверен выше.');
      }
      flat = setDayBucketLater(planningWithDate);
    } else {
      flat = { ...flat, dayBucket: patch.dayBucket ?? flat.dayBucket };
    }
  }

  if ('availableFrom' in patch) {
    flat = { ...flat, availableFrom: patch.availableFrom ?? null };
  }
  if ('durationMin' in patch) {
    flat = { ...flat, durationMin: patch.durationMin ?? null };
  }
  if ('focusDate' in patch) {
    flat = { ...flat, focusDate: patch.focusDate ?? null };
  }

  return flat;
}

/** Удаление Deadline — переиспользует `clearDeadline` (задание, раздел "Что
 * реализовать", п.2). Смена/первое назначение Deadline не имеет
 * специализированной функции в `field-resets.ts` (только очистка) — прямое
 * поле-в-поле присваивание корректно и без неё. */
function applyDeadlinePatch(current: Task, patch: UpdateTaskPatch): FlatDeadline {
  let flat = flatDeadlineOf(current);

  if ('deadlineDate' in patch) {
    flat =
      patch.deadlineDate === null
        ? clearDeadline(buildDeadline(flat))
        : {
            deadlineDate: patch.deadlineDate,
            deadlineTime:
              'deadlineTime' in patch ? (patch.deadlineTime ?? null) : flat.deadlineTime,
          };
  } else if ('deadlineTime' in patch) {
    flat = { ...flat, deadlineTime: patch.deadlineTime ?? null };
  }

  return flat;
}

/**
 * Частичное обновление полей существующей Task. Загружает текущее
 * состояние, применяет патч (с переиспользованием правил сброса), проверяет
 * результат через `validateDomainMutation` **до** записи — при блокирующем
 * нарушении не пишет ничего. При успехе обновляет `updatedAt`, инкрементирует
 * `revision`, обновляет HLC только реально изменившихся полей, пишет
 * атомарно через `deps.storage`.
 */
export async function updateTaskCommand(
  input: UpdateTaskInput,
  deps: TaskCommandDeps,
): Promise<TaskCommandResult> {
  const current = await deps.storage.tasks.findById(input.id);
  // Tombstone — не пользовательская цель новой мутации (`02§1`): для команд
  // этого пакета работ удалённая задача не считается найденной.
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const patch = input.patch;

  const title = patch.title ?? current.title;
  const description = patch.description ?? current.description;
  const priority = patch.priority ?? current.priority;
  const captureState = patch.captureState ?? current.captureState;
  const projectId = 'projectId' in patch ? (patch.projectId ?? null) : current.projectId;
  const sectionId = 'sectionId' in patch ? (patch.sectionId ?? null) : current.sectionId;
  const originalProjectNameSnapshot =
    'originalProjectNameSnapshot' in patch
      ? (patch.originalProjectNameSnapshot ?? null)
      : current.originalProjectNameSnapshot;
  const originalSectionNameSnapshot =
    'originalSectionNameSnapshot' in patch
      ? (patch.originalSectionNameSnapshot ?? null)
      : current.originalSectionNameSnapshot;
  const parentTaskId =
    'parentTaskId' in patch ? (patch.parentTaskId ?? null) : current.parentTaskId;

  const planning = applyPlanningPatch(current, patch);
  const deadline = applyDeadlinePatch(current, patch);

  const validationInput: TaskValidationInput = {
    title,
    description,
    projectId,
    sectionId,
    parentTaskId,
    captureState,
    seriesId: current.seriesId,
    availableFrom: planning.availableFrom,
    plannedDate: planning.plannedDate,
    plannedTime: planning.plannedTime,
    durationMin: planning.durationMin,
    focusDate: planning.focusDate,
    dayBucket: planning.dayBucket,
    deadlineDate: deadline.deadlineDate,
    deadlineTime: deadline.deadlineTime,
    status: current.status,
    completedAt: current.completedAt,
    completionKind: current.completionKind,
    priority,
  };

  const context = await deps.storage.tasks.loadValidationContext(current.id, parentTaskId);
  const validation = validateDomainMutation({ entity: 'task', data: validationInput, context });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const rank = patch.rank !== undefined ? resolveTaskRank(patch.rank) : current.rank;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const nextTask: Task = {
    id: current.id,
    ownerScope: current.ownerScope,
    title,
    description,
    priority,
    rank,
    ...buildHierarchy({
      parentTaskId,
      captureState,
      seriesId: current.seriesId,
      occurrenceSeq: current.occurrenceSeq,
      generatedFromOccurrenceId: current.generatedFromOccurrenceId,
    }),
    ...buildProjectPlacement({ projectId, sectionId }),
    ...buildPlanning(planning),
    ...buildDeadline(deadline),
    ...buildCompletion({
      status: current.status,
      completedAt: current.completedAt,
      completionKind: current.completionKind,
    }),
    source: current.source,
    sourceChannel: current.sourceChannel,
    sourceCaptureBatchId: current.sourceCaptureBatchId,
    sourceIntentId: current.sourceIntentId,
    originalProjectNameSnapshot,
    originalSectionNameSnapshot,
    createdAt: current.createdAt,
    updatedAt: deps.now,
    deletedAt: null,
    revision: current.revision + 1n,
    clocks: current.clocks,
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

  return { status: 'ok', task: finalTask, validation };
}
