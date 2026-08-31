import type { Temporal } from '@js-temporal/polyfill';

import type { CaptureState, DayBucket, SourceChannel, Task, TaskSource } from '../entities/task.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import type { TaskValidationInput } from '../validation/task.js';
import {
  makePriority,
  type DurationMinutes,
  type OwnerScope,
  type Priority,
  type Uuid,
} from '../values.js';
import {
  buildCompletion,
  buildDeadline,
  buildHierarchy,
  buildPlanning,
  buildProjectPlacement,
} from './assemble.js';
import { buildPatchJson, diffChangedFields, pickClocks, tickClocks } from './clock-diff.js';
import { resolveTaskRank, type NewTaskRank } from './rank-input.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps, TaskCommandResult } from './types.js';

/**
 * Вход `createTaskCommand` — CLAUDE.md, пункт 1: единая точка входа для
 * создания задачи, через которую идут Quick Add, импорт и все будущие
 * адаптеры. Ровно то подмножество `Task`, что задаётся при создании — без
 * `id`/`createdAt`/`updatedAt`/`revision`/`clocks`/`rank`/`deletedAt`/
 * `status`/`completedAt`/`completionKind` (последние три всегда
 * `active`/`null`/`null` при создании — завершённую задачу этой командой не
 * создать, для этого нужно было бы уже существующую, `completeTaskCommand`).
 *
 * `captureState` — без умолчания и намеренно: `01§2`/`01§3` показывают, что
 * значение зависит от того, откуда пришло создание (голый Quick Add без
 * контекста → `inbox`; contextual Quick Add с датой/проектом → `processed`)
 * — это решение вызывающего UI-слоя (следующие пакеты работ), не то, что
 * команда может безопасно угадать по умолчанию.
 */
export interface CreateTaskInput {
  readonly ownerScope: OwnerScope;
  readonly title: string;
  readonly description?: string;
  readonly priority?: Priority;
  readonly projectId?: Uuid | null;
  readonly sectionId?: Uuid | null;
  readonly parentTaskId?: Uuid | null;
  readonly captureState: CaptureState;
  readonly seriesId?: Uuid | null;
  readonly occurrenceSeq?: bigint | null;
  readonly generatedFromOccurrenceId?: Uuid | null;
  readonly availableFrom?: Temporal.PlainDate | null;
  readonly plannedDate?: Temporal.PlainDate | null;
  readonly plannedTime?: Temporal.PlainTime | null;
  readonly durationMin?: DurationMinutes | null;
  readonly focusDate?: Temporal.PlainDate | null;
  readonly dayBucket?: DayBucket;
  readonly deadlineDate?: Temporal.PlainDate | null;
  readonly deadlineTime?: Temporal.PlainTime | null;
  readonly source: TaskSource;
  readonly sourceChannel?: SourceChannel | null;
  readonly sourceCaptureBatchId?: Uuid | null;
  readonly sourceIntentId?: Uuid | null;
  readonly originalProjectNameSnapshot?: string | null;
  readonly originalSectionNameSnapshot?: string | null;
  /** Позиция в списке соседей — см. обоснование в `rank-input.ts`. */
  readonly rank: NewTaskRank;
}

/**
 * Единая точка входа для создания Task (CLAUDE.md, пункт 1). Прогоняет вход
 * через `validateDomainMutation` **до** записи; при блокирующем нарушении
 * не пишет ничего и возвращает `{status:'rejected', validation}` вызывающему
 * коду (не бросает исключение). При успехе пишет сущность и outbox-запись
 * одной транзакцией через инжектированный `deps.storage`.
 */
export async function createTaskCommand(
  input: CreateTaskInput,
  deps: TaskCommandDeps,
): Promise<TaskCommandResult> {
  const generateId = deps.generateId ?? generateUuidV7;
  const generateOpId = deps.generateOpId ?? generateUuidV7;

  const description = input.description ?? '';
  const priority = input.priority ?? makePriority(4);
  const projectId = input.projectId ?? null;
  const sectionId = input.sectionId ?? null;
  const parentTaskId = input.parentTaskId ?? null;
  const seriesId = input.seriesId ?? null;
  const occurrenceSeq = input.occurrenceSeq ?? null;
  const generatedFromOccurrenceId = input.generatedFromOccurrenceId ?? null;
  const availableFrom = input.availableFrom ?? null;
  const plannedDate = input.plannedDate ?? null;
  const plannedTime = input.plannedTime ?? null;
  const durationMin = input.durationMin ?? null;
  const focusDate = input.focusDate ?? null;
  const dayBucket = input.dayBucket ?? 'default';
  const deadlineDate = input.deadlineDate ?? null;
  const deadlineTime = input.deadlineTime ?? null;
  const sourceChannel = input.sourceChannel ?? null;
  const sourceCaptureBatchId = input.sourceCaptureBatchId ?? null;
  const sourceIntentId = input.sourceIntentId ?? null;
  const originalProjectNameSnapshot = input.originalProjectNameSnapshot ?? null;
  const originalSectionNameSnapshot = input.originalSectionNameSnapshot ?? null;

  const validationInput: TaskValidationInput = {
    title: input.title,
    description,
    projectId,
    sectionId,
    parentTaskId,
    captureState: input.captureState,
    seriesId,
    availableFrom,
    plannedDate,
    plannedTime,
    durationMin,
    focusDate,
    dayBucket,
    deadlineDate,
    deadlineTime,
    status: 'active',
    completedAt: null,
    completionKind: null,
    priority,
  };

  // Новая задача ещё не существует — `id=null`; `loadValidationContext`
  // сама вернёт нулевые счётчики лимитов (17–21) и снимок родителя, если он
  // задан (правила 6–9, 16).
  const context = await deps.storage.tasks.loadValidationContext(null, parentTaskId);
  const validation = validateDomainMutation({ entity: 'task', data: validationInput, context });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const id = generateId();
  const rank = resolveTaskRank(input.rank);
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const task: Task = {
    id,
    ownerScope: input.ownerScope,
    title: input.title,
    description,
    priority,
    rank,
    ...buildHierarchy({
      parentTaskId,
      captureState: input.captureState,
      seriesId,
      occurrenceSeq,
      generatedFromOccurrenceId,
    }),
    ...buildProjectPlacement({ projectId, sectionId }),
    ...buildPlanning({
      availableFrom,
      plannedDate,
      plannedTime,
      durationMin,
      focusDate,
      dayBucket,
    }),
    ...buildDeadline({ deadlineDate, deadlineTime }),
    ...buildCompletion({ status: 'active', completedAt: null, completionKind: null }),
    source: input.source,
    sourceChannel,
    sourceCaptureBatchId,
    sourceIntentId,
    originalProjectNameSnapshot,
    originalSectionNameSnapshot,
    createdAt: deps.now,
    updatedAt: deps.now,
    deletedAt: null,
    revision: 1n,
    clocks: {},
  };

  const changedFields = diffChangedFields(null, task);
  const finalTask: Task = { ...task, clocks: tickClocks(task.clocks, changedFields, hlc) };

  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'task',
    entityId: id,
    patchJson: buildPatchJson(finalTask, changedFields),
    fieldClocksJson: pickClocks(finalTask.clocks, changedFields),
    baseRevision: 0n,
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
