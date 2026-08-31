import { Temporal } from '@js-temporal/polyfill';
import {
  generateUuidV7,
  initialRank,
  makePriority,
  type ChecklistItem,
  type Hlc,
  type Label,
  type Project,
  type Reminder,
  type Section,
  type SyncOutboxEntry,
  type Task,
  type TaskCompletion,
  type TaskDeadline,
  type TaskHierarchy,
  type TaskLabel,
  type TaskPlanning,
  type TaskProjectPlacement,
  type Uuid,
} from '@shagi/core';

/**
 * Строители минимально валидных сущностей для общего набора тестов
 * контракта (`./storage-contract.ts`). Не проходят через
 * `validateDomainMutation` — контракт хранилища тестирует само хранилище
 * (пишет/читает/атомарность), а не повторно доменный валидатор (тот уже
 * покрыт тестами `@shagi/core`, дублировать незачем). Значения подобраны
 * так, чтобы УЖЕ проходить валидатор, если бы кто-то его вызвал — это
 * демонстрирует `test/contract/validation-integration.test.ts`.
 */

let counter = 0;

/** Монотонный `Instant`, отдельный от системных часов — детерминированные
 * фикстуры не должны зависеть от момента запуска теста. */
export function nextInstant(): Temporal.Instant {
  counter += 1;
  return Temporal.Instant.fromEpochMilliseconds(1_700_000_000_000 + counter * 1000);
}

export function newId(): Uuid {
  return generateUuidV7();
}

export function makeHlc(physical: Temporal.Instant, deviceId: Uuid | null = null): Hlc {
  return { physical, logical: 0, deviceId };
}

export interface TaskFixtureOverrides {
  readonly id?: Uuid;
  readonly ownerScope?: Uuid;
  readonly title?: string;
  readonly status?: Task['status'];
  readonly projectId?: Uuid | null;
  readonly sectionId?: Uuid | null;
  readonly parentTaskId?: Uuid | null;
  readonly captureState?: Task['captureState'];
  readonly plannedDate?: Temporal.PlainDate | null;
  readonly focusDate?: Temporal.PlainDate | null;
  readonly dayBucket?: Task['dayBucket'];
  readonly deadlineDate?: Temporal.PlainDate | null;
  readonly seriesId?: Uuid | null;
  readonly occurrenceSeq?: bigint | null;
  readonly rank?: Task['rank'];
  readonly deletedAt?: Temporal.Instant | null;
  readonly createdAt?: Temporal.Instant;
}

/** Ветка `TaskHierarchy` по `parentTaskId` — построена явно веткой
 * объединения (не приведением типа `as Task`), чтобы фикстура сама не могла
 * собрать нарушение правил 8–9 (`@shagi/core`), которые тип уже запрещает. */
function buildHierarchy(
  parentTaskId: Uuid | null,
  captureState: Task['captureState'],
  seriesId: Uuid | null = null,
  occurrenceSeq: bigint | null = null,
): TaskHierarchy {
  if (parentTaskId === null) {
    return {
      parentTaskId: null,
      captureState,
      seriesId,
      occurrenceSeq,
      generatedFromOccurrenceId: null,
    };
  }
  return {
    parentTaskId,
    captureState: 'processed',
    seriesId: null,
    occurrenceSeq: null,
    generatedFromOccurrenceId: null,
  };
}

/** Ветка `TaskPlanning` по `plannedDate` — см. комментарий `buildHierarchy`. */
function buildPlanning(
  plannedDate: Temporal.PlainDate | null,
  focusDate: Temporal.PlainDate | null,
  dayBucket: Task['dayBucket'],
): TaskPlanning {
  if (plannedDate === null) {
    return {
      availableFrom: null,
      plannedDate: null,
      plannedTime: null,
      durationMin: null,
      focusDate: null,
      dayBucket: 'default',
    };
  }
  return {
    availableFrom: null,
    plannedDate,
    plannedTime: null,
    durationMin: null,
    focusDate,
    dayBucket,
  };
}

/** Ветка `TaskProjectPlacement` по `projectId` — см. комментарий `buildHierarchy`. */
function buildProjectPlacement(
  projectId: Uuid | null,
  sectionId: Uuid | null,
): TaskProjectPlacement {
  if (projectId === null) {
    return { projectId: null, sectionId: null };
  }
  return { projectId, sectionId };
}

/** Ветка `TaskDeadline` по `deadlineDate` — см. комментарий `buildHierarchy`. */
function buildDeadline(deadlineDate: Temporal.PlainDate | null): TaskDeadline {
  if (deadlineDate === null) {
    return { deadlineDate: null, deadlineTime: null };
  }
  return { deadlineDate, deadlineTime: null };
}

/** Ветка `TaskCompletion` по `status` — см. комментарий `buildHierarchy`. */
function buildCompletion(status: Task['status'], completedAt: Temporal.Instant): TaskCompletion {
  if (status === 'active') {
    return { status: 'active', completedAt: null, completionKind: null };
  }
  return { status: 'completed', completedAt, completionKind: 'done' };
}

/** Top-level, active, processed, без planning/deadline — минимальный
 * валидный по `@shagi/core` `validateTask` каркас. */
export function makeTask(overrides: TaskFixtureOverrides = {}): Task {
  const createdAt = overrides.createdAt ?? nextInstant();
  const status = overrides.status ?? 'active';
  const parentTaskId = overrides.parentTaskId ?? null;

  return {
    id: overrides.id ?? newId(),
    ownerScope: overrides.ownerScope ?? newId(),
    title: overrides.title ?? 'Проверочная задача',
    description: '',
    priority: makePriority(4),
    rank: overrides.rank ?? initialRank(),
    ...buildHierarchy(
      parentTaskId,
      overrides.captureState ?? 'processed',
      overrides.seriesId ?? null,
      overrides.occurrenceSeq ?? null,
    ),
    ...buildProjectPlacement(overrides.projectId ?? null, overrides.sectionId ?? null),
    ...buildPlanning(
      overrides.plannedDate ?? null,
      overrides.focusDate ?? null,
      overrides.dayBucket ?? 'default',
    ),
    ...buildDeadline(overrides.deadlineDate ?? null),
    ...buildCompletion(status, createdAt),
    source: 'user',
    sourceChannel: null,
    sourceCaptureBatchId: null,
    sourceIntentId: null,
    originalProjectNameSnapshot: null,
    originalSectionNameSnapshot: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: overrides.deletedAt ?? null,
    revision: 1n,
    clocks: {},
  };
}

export interface ProjectFixtureOverrides {
  readonly id?: Uuid;
  readonly title?: string;
  readonly archivedAt?: Temporal.Instant | null;
  readonly deletedAt?: Temporal.Instant | null;
  readonly rank?: Project['rank'];
}

export function makeProject(overrides: ProjectFixtureOverrides = {}): Project {
  const createdAt = nextInstant();
  return {
    id: overrides.id ?? newId(),
    title: overrides.title ?? 'Проверочный проект',
    description: '',
    colorToken: 'accent.default',
    icon: null,
    defaultView: 'list',
    favorite: false,
    archivedAt: overrides.archivedAt ?? null,
    rank: overrides.rank ?? initialRank(),
    createdAt,
    updatedAt: createdAt,
    deletedAt: overrides.deletedAt ?? null,
    clocks: {},
  };
}

export function makeSection(
  projectId: Uuid,
  overrides: { id?: Uuid; rank?: Section['rank']; deletedAt?: Temporal.Instant | null } = {},
): Section {
  return {
    id: overrides.id ?? newId(),
    projectId,
    title: 'Проверочная секция',
    rank: overrides.rank ?? initialRank(),
    deletedAt: overrides.deletedAt ?? null,
    clocks: {},
  };
}

export function makeLabel(
  overrides: {
    id?: Uuid;
    displayName?: string;
    normalizedName?: string;
    deletedAt?: Temporal.Instant | null;
  } = {},
): Label {
  const displayName = overrides.displayName ?? 'важное';
  return {
    id: overrides.id ?? newId(),
    normalizedName: overrides.normalizedName ?? displayName.normalize('NFKC').toLowerCase(),
    displayName,
    colorToken: null,
    rank: initialRank(),
    deletedAt: overrides.deletedAt ?? null,
    clocks: {},
  };
}

export function makeTaskLabel(
  taskId: Uuid,
  labelId: Uuid,
  addHlc: Hlc,
  removeHlc: Hlc | null = null,
): TaskLabel {
  return { taskId, labelId, addHlc, removeHlc };
}

export function makeChecklistItem(
  taskId: Uuid,
  overrides: { id?: Uuid; deletedAt?: Temporal.Instant | null } = {},
): ChecklistItem {
  return {
    id: overrides.id ?? newId(),
    taskId,
    text: 'пункт чек-листа',
    done: false,
    rank: initialRank(),
    deletedAt: overrides.deletedAt ?? null,
    clocks: {},
  };
}

export function makeExplicitReminder(taskId: Uuid, overrides: { id?: Uuid } = {}): Reminder {
  return {
    id: overrides.id ?? newId(),
    taskId,
    kind: 'explicit',
    localRuleJson: {},
    enabled: true,
    scheduledFingerprint: 'fingerprint',
  };
}

export function makeOutboxEntry(
  entityType: SyncOutboxEntry['entityType'],
  entityId: Uuid,
  overrides: { deviceId?: Uuid; opId?: Uuid; createdAt?: Temporal.Instant } = {},
): SyncOutboxEntry {
  return {
    opId: overrides.opId ?? newId(),
    deviceId: overrides.deviceId ?? newId(),
    entityType,
    entityId,
    patchJson: {},
    fieldClocksJson: {},
    baseRevision: 0n,
    createdAt: overrides.createdAt ?? nextInstant(),
    retryCount: 0,
  };
}
