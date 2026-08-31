import {
  makeDurationMinutes,
  makeOccurrenceSeq,
  makePriority,
  type Attachment,
  type AttachmentState,
  type CaptureState,
  type ChecklistItem,
  type CompletionKind,
  type DayBucket,
  type ImportBatch,
  type Label,
  type Project,
  type ProjectDefaultView,
  type Rank,
  type RecurrenceAnchorType,
  type Reminder,
  type ReminderKind,
  type Section,
  type SourceChannel,
  type SyncConflict,
  type SyncOutboxEntry,
  type Task,
  type TaskCompletion,
  type TaskDeadline,
  type TaskHierarchy,
  type TaskLabel,
  type TaskLink,
  type TaskPlanning,
  type TaskProjectPlacement,
  type TaskSource,
  type TaskStatus,
} from '@shagi/core';

import type { SqliteRow } from './driver-port.js';
import {
  booleanToSql,
  fieldClocksToSql,
  jsonToSql,
  nullableInstantToSql,
  nullablePlainDateToSql,
  nullablePlainTimeToSql,
  nullableUuidToSql,
  sqlToBoolean,
  sqlToFieldClocks,
  sqlToJson,
  sqlToNullableBigint,
  sqlToNullableInstant,
  sqlToNullableNumber,
  sqlToNullablePlainDate,
  sqlToNullablePlainTime,
  sqlToNullableString,
  sqlToNullableUuid,
  sqlToNumber,
  sqlToString,
  sqlToUuid,
  instantToSql,
  uuidToSql,
} from './codec.js';

/**
 * Перевод "SQL-строка (`snake_case`) ↔ доменная сущность (`camelCase`,
 * `@shagi/core`)" (задание пакета работ E02.2, п.3). Один модуль на весь
 * адаптер — по одной паре функций `xToRow`/`rowToX` на таблицу, порядок как
 * в `../schema/tables.ts`.
 *
 * `Task` собран из discriminated unions (`TaskHierarchy`/`TaskProjectPlacement`/
 * `TaskPlanning`/`TaskDeadline`/`TaskCompletion`, `@shagi/core` `entities/task.ts`)
 * — `rowToTask` восстанавливает нужную ветку веткой по `null`-ости ключевого
 * поля (`parentTaskId`/`projectId`/`plannedDate`/`deadlineDate`/`status`), а
 * не приведением типа `as Task`, чтобы строка, нарушающая инвариант типа
 * (например, `parent_task_id` не пуст, а `capture_state` не `'processed'`),
 * не могла тихо проскочить как валидная — вместо этого при чтении такой
 * строки бросается `TypeError` (см. `readTaskHierarchy`).
 */

export function taskToRow(task: Task): SqliteRow {
  return {
    id: uuidToSql(task.id),
    owner_scope: uuidToSql(task.ownerScope),
    title: task.title,
    description: task.description,
    status: task.status,
    capture_state: task.captureState,
    project_id: nullableUuidToSql(task.projectId),
    section_id: nullableUuidToSql(task.sectionId),
    parent_task_id: nullableUuidToSql(task.parentTaskId),
    rank: task.rank,
    priority: BigInt(task.priority),
    focus_date: nullablePlainDateToSql(task.focusDate),
    day_bucket: task.dayBucket,
    available_from: nullablePlainDateToSql(task.availableFrom),
    planned_date: nullablePlainDateToSql(task.plannedDate),
    planned_time: nullablePlainTimeToSql(task.plannedTime),
    duration_min: task.durationMin === null ? null : BigInt(task.durationMin),
    deadline_date: nullablePlainDateToSql(task.deadlineDate),
    deadline_time: nullablePlainTimeToSql(task.deadlineTime),
    series_id: nullableUuidToSql(task.seriesId),
    occurrence_seq: task.occurrenceSeq,
    generated_from_occurrence_id: nullableUuidToSql(task.generatedFromOccurrenceId),
    original_project_name_snapshot: task.originalProjectNameSnapshot,
    original_section_name_snapshot: task.originalSectionNameSnapshot,
    source: task.source,
    source_channel: task.sourceChannel,
    source_capture_batch_id: nullableUuidToSql(task.sourceCaptureBatchId),
    source_intent_id: nullableUuidToSql(task.sourceIntentId),
    created_at: instantToSql(task.createdAt),
    updated_at: instantToSql(task.updatedAt),
    completed_at: nullableInstantToSql(task.completedAt),
    completion_kind: task.completionKind,
    deleted_at: nullableInstantToSql(task.deletedAt),
    revision: task.revision,
    clocks: fieldClocksToSql(task.clocks),
  };
}

function readTaskHierarchy(row: SqliteRow): TaskHierarchy {
  const parentTaskId = sqlToNullableUuid(row.parent_task_id ?? null);
  if (parentTaskId === null) {
    return {
      parentTaskId: null,
      captureState: sqlToString(row.capture_state ?? null) as CaptureState,
      seriesId: sqlToNullableUuid(row.series_id ?? null),
      occurrenceSeq: sqlToNullableBigint(row.occurrence_seq ?? null),
      generatedFromOccurrenceId: sqlToNullableUuid(row.generated_from_occurrence_id ?? null),
    };
  }
  const captureState = sqlToString(row.capture_state ?? null);
  if (captureState !== 'processed') {
    throw new TypeError(
      `rowToTask: дочерняя задача обязана быть 'processed' (правило 9), в строке: ${captureState}`,
    );
  }
  return {
    parentTaskId,
    captureState: 'processed',
    seriesId: null,
    occurrenceSeq: null,
    generatedFromOccurrenceId: null,
  };
}

function readTaskProjectPlacement(row: SqliteRow): TaskProjectPlacement {
  const projectId = sqlToNullableUuid(row.project_id ?? null);
  if (projectId === null) {
    return { projectId: null, sectionId: null };
  }
  return { projectId, sectionId: sqlToNullableUuid(row.section_id ?? null) };
}

function readTaskPlanning(row: SqliteRow): TaskPlanning {
  const plannedDate = sqlToNullablePlainDate(row.planned_date ?? null);
  const availableFrom = sqlToNullablePlainDate(row.available_from ?? null);
  const durationRaw = sqlToNullableNumber(row.duration_min ?? null);
  const durationMin = durationRaw === null ? null : makeDurationMinutes(durationRaw);
  if (plannedDate === null) {
    return {
      availableFrom,
      plannedDate: null,
      plannedTime: null,
      durationMin,
      focusDate: null,
      dayBucket: 'default',
    };
  }
  return {
    availableFrom,
    plannedDate,
    plannedTime: sqlToNullablePlainTime(row.planned_time ?? null),
    durationMin,
    focusDate: sqlToNullablePlainDate(row.focus_date ?? null),
    dayBucket: sqlToString(row.day_bucket ?? null) as DayBucket,
  };
}

function readTaskDeadline(row: SqliteRow): TaskDeadline {
  const deadlineDate = sqlToNullablePlainDate(row.deadline_date ?? null);
  if (deadlineDate === null) {
    return { deadlineDate: null, deadlineTime: null };
  }
  return { deadlineDate, deadlineTime: sqlToNullablePlainTime(row.deadline_time ?? null) };
}

function readTaskCompletion(row: SqliteRow): TaskCompletion {
  const status = sqlToString(row.status ?? null) as TaskStatus;
  if (status === 'active') {
    return { status: 'active', completedAt: null, completionKind: null };
  }
  const completedAt = sqlToNullableInstant(row.completed_at ?? null);
  const completionKind = sqlToNullableString(row.completion_kind ?? null) as CompletionKind | null;
  if (completedAt === null || completionKind === null) {
    throw new TypeError(
      "rowToTask: status='completed' требует непустых completed_at/completion_kind (правила 12–13)",
    );
  }
  return { status: 'completed', completedAt, completionKind };
}

export function rowToTask(row: SqliteRow): Task {
  return {
    id: sqlToUuid(row.id ?? null),
    ownerScope: sqlToUuid(row.owner_scope ?? null),
    title: sqlToString(row.title ?? null),
    description: sqlToString(row.description ?? null),
    priority: makePriority(sqlToNumber(row.priority ?? null)),
    rank: sqlToString(row.rank ?? null) as Rank,
    ...readTaskHierarchy(row),
    ...readTaskProjectPlacement(row),
    ...readTaskPlanning(row),
    ...readTaskDeadline(row),
    ...readTaskCompletion(row),
    source: sqlToString(row.source ?? null) as TaskSource,
    sourceChannel: sqlToNullableString(row.source_channel ?? null) as SourceChannel | null,
    sourceCaptureBatchId: sqlToNullableUuid(row.source_capture_batch_id ?? null),
    sourceIntentId: sqlToNullableUuid(row.source_intent_id ?? null),
    originalProjectNameSnapshot: sqlToNullableString(row.original_project_name_snapshot ?? null),
    originalSectionNameSnapshot: sqlToNullableString(row.original_section_name_snapshot ?? null),
    createdAt: sqlToNullableInstant(row.created_at ?? null) ?? failMissing('created_at'),
    updatedAt: sqlToNullableInstant(row.updated_at ?? null) ?? failMissing('updated_at'),
    deletedAt: sqlToNullableInstant(row.deleted_at ?? null),
    revision: sqlToNullableBigint(row.revision ?? null) ?? failMissing('revision'),
    clocks: sqlToFieldClocks(row.clocks ?? null),
  };
}

function failMissing(column: string): never {
  throw new TypeError(`rowToTask: обязательный столбец ${column} пуст`);
}

export function projectToRow(project: Project): SqliteRow {
  return {
    id: uuidToSql(project.id),
    title: project.title,
    description: project.description,
    color_token: project.colorToken,
    icon: project.icon,
    default_view: project.defaultView,
    favorite: booleanToSql(project.favorite),
    archived_at: nullableInstantToSql(project.archivedAt),
    rank: project.rank,
    created_at: instantToSql(project.createdAt),
    updated_at: instantToSql(project.updatedAt),
    deleted_at: nullableInstantToSql(project.deletedAt),
    clocks: fieldClocksToSql(project.clocks),
  };
}

export function rowToProject(row: SqliteRow): Project {
  return {
    id: sqlToUuid(row.id ?? null),
    title: sqlToString(row.title ?? null),
    description: sqlToString(row.description ?? null),
    colorToken: sqlToString(row.color_token ?? null),
    icon: sqlToNullableString(row.icon ?? null),
    defaultView: sqlToString(row.default_view ?? null) as ProjectDefaultView,
    favorite: sqlToBoolean(row.favorite ?? null),
    archivedAt: sqlToNullableInstant(row.archived_at ?? null),
    rank: sqlToString(row.rank ?? null) as Rank,
    createdAt: sqlToNullableInstant(row.created_at ?? null) ?? failMissing('created_at'),
    updatedAt: sqlToNullableInstant(row.updated_at ?? null) ?? failMissing('updated_at'),
    deletedAt: sqlToNullableInstant(row.deleted_at ?? null),
    clocks: sqlToFieldClocks(row.clocks ?? null),
  };
}

export function sectionToRow(section: Section): SqliteRow {
  return {
    id: uuidToSql(section.id),
    project_id: uuidToSql(section.projectId),
    title: section.title,
    rank: section.rank,
    deleted_at: nullableInstantToSql(section.deletedAt),
    clocks: fieldClocksToSql(section.clocks),
  };
}

export function rowToSection(row: SqliteRow): Section {
  return {
    id: sqlToUuid(row.id ?? null),
    projectId: sqlToUuid(row.project_id ?? null),
    title: sqlToString(row.title ?? null),
    rank: sqlToString(row.rank ?? null) as Rank,
    deletedAt: sqlToNullableInstant(row.deleted_at ?? null),
    clocks: sqlToFieldClocks(row.clocks ?? null),
  };
}

export function labelToRow(label: Label): SqliteRow {
  return {
    id: uuidToSql(label.id),
    normalized_name: label.normalizedName,
    display_name: label.displayName,
    color_token: label.colorToken,
    rank: label.rank,
    deleted_at: nullableInstantToSql(label.deletedAt),
    clocks: fieldClocksToSql(label.clocks),
  };
}

export function rowToLabel(row: SqliteRow): Label {
  return {
    id: sqlToUuid(row.id ?? null),
    normalizedName: sqlToString(row.normalized_name ?? null),
    displayName: sqlToString(row.display_name ?? null),
    colorToken: sqlToNullableString(row.color_token ?? null),
    rank: sqlToString(row.rank ?? null) as Rank,
    deletedAt: sqlToNullableInstant(row.deleted_at ?? null),
    clocks: sqlToFieldClocks(row.clocks ?? null),
  };
}

export function taskLabelToRow(link: TaskLabel): SqliteRow {
  return {
    task_id: uuidToSql(link.taskId),
    label_id: uuidToSql(link.labelId),
    add_hlc_physical: instantToSql(link.addHlc.physical),
    add_hlc_logical: BigInt(link.addHlc.logical),
    add_hlc_device_id: nullableUuidToSql(link.addHlc.deviceId),
    remove_hlc_physical: nullableInstantToSql(link.removeHlc?.physical ?? null),
    remove_hlc_logical: link.removeHlc === null ? null : BigInt(link.removeHlc.logical),
    remove_hlc_device_id: nullableUuidToSql(link.removeHlc?.deviceId ?? null),
  };
}

export function rowToTaskLabel(row: SqliteRow): TaskLabel {
  const removePhysical = sqlToNullableInstant(row.remove_hlc_physical ?? null);
  return {
    taskId: sqlToUuid(row.task_id ?? null),
    labelId: sqlToUuid(row.label_id ?? null),
    addHlc: {
      physical:
        sqlToNullableInstant(row.add_hlc_physical ?? null) ?? failMissing('add_hlc_physical'),
      logical: sqlToNumber(row.add_hlc_logical ?? null),
      deviceId: sqlToNullableUuid(row.add_hlc_device_id ?? null),
    },
    removeHlc:
      removePhysical === null
        ? null
        : {
            physical: removePhysical,
            logical: sqlToNumber(row.remove_hlc_logical ?? null),
            deviceId: sqlToNullableUuid(row.remove_hlc_device_id ?? null),
          },
  };
}

export function checklistItemToRow(item: ChecklistItem): SqliteRow {
  return {
    id: uuidToSql(item.id),
    task_id: uuidToSql(item.taskId),
    text: item.text,
    done: booleanToSql(item.done),
    rank: item.rank,
    deleted_at: nullableInstantToSql(item.deletedAt),
    clocks: fieldClocksToSql(item.clocks),
  };
}

export function rowToChecklistItem(row: SqliteRow): ChecklistItem {
  return {
    id: sqlToUuid(row.id ?? null),
    taskId: sqlToUuid(row.task_id ?? null),
    text: sqlToString(row.text ?? null),
    done: sqlToBoolean(row.done ?? null),
    rank: sqlToString(row.rank ?? null) as Rank,
    deletedAt: sqlToNullableInstant(row.deleted_at ?? null),
    clocks: sqlToFieldClocks(row.clocks ?? null),
  };
}

export function reminderToRow(reminder: Reminder): SqliteRow {
  return {
    id: uuidToSql(reminder.id),
    task_id: uuidToSql(reminder.taskId),
    kind: reminder.kind,
    local_rule_json: jsonToSql(reminder.localRuleJson),
    enabled: booleanToSql(reminder.enabled),
    scheduled_fingerprint: reminder.scheduledFingerprint,
  };
}

export function rowToReminder(row: SqliteRow): Reminder {
  return {
    id: sqlToUuid(row.id ?? null),
    taskId: sqlToUuid(row.task_id ?? null),
    kind: sqlToString(row.kind ?? null) as ReminderKind,
    localRuleJson: sqlToJson(row.local_rule_json ?? null),
    enabled: sqlToBoolean(row.enabled ?? null),
    scheduledFingerprint: sqlToString(row.scheduled_fingerprint ?? null),
  };
}

// RecurrenceSeries — движок повторов вне этого пакета работ (эпик E11), но
// хранение/чтение обязано быть согласовано с discriminated union
// `RecurrenceAnchor` (`@shagi/core`).
type RecurrenceSeriesLike = import('@shagi/core').RecurrenceSeries;

export function recurrenceSeriesToRow(series: RecurrenceSeriesLike): SqliteRow {
  return {
    id: uuidToSql(series.id),
    anchor_type: series.anchorType,
    rrule: series.rrule,
    completion_interval_json:
      series.completionIntervalJson === null ? null : jsonToSql(series.completionIntervalJson),
    template_json: jsonToSql(series.templateJson),
    active: booleanToSql(series.active),
    next_occurrence_seq: BigInt(series.nextOccurrenceSeq),
    stop_after_occurrence_seq:
      series.stopAfterOccurrenceSeq === null ? null : BigInt(series.stopAfterOccurrenceSeq),
    template_revision: series.templateRevision,
    created_at: instantToSql(series.createdAt),
    updated_at: instantToSql(series.updatedAt),
    clocks: fieldClocksToSql(series.clocks),
  };
}

export function rowToRecurrenceSeries(row: SqliteRow): RecurrenceSeriesLike {
  const anchorType = sqlToString(row.anchor_type ?? null) as RecurrenceAnchorType;
  const id = sqlToUuid(row.id ?? null);
  const templateJson = sqlToJson<Readonly<Record<string, unknown>>>(row.template_json ?? null);
  const active = sqlToBoolean(row.active ?? null);
  const nextOccurrenceSeq = makeOccurrenceSeq(
    sqlToNullableBigint(row.next_occurrence_seq ?? null) ?? failMissing('next_occurrence_seq'),
  );
  const stopRaw = sqlToNullableBigint(row.stop_after_occurrence_seq ?? null);
  const stopAfterOccurrenceSeq = stopRaw === null ? null : makeOccurrenceSeq(stopRaw);
  const templateRevision =
    sqlToNullableBigint(row.template_revision ?? null) ?? failMissing('template_revision');
  const createdAt = sqlToNullableInstant(row.created_at ?? null) ?? failMissing('created_at');
  const updatedAt = sqlToNullableInstant(row.updated_at ?? null) ?? failMissing('updated_at');
  const clocks = sqlToFieldClocks(row.clocks ?? null);

  const anchor =
    anchorType === 'scheduled'
      ? {
          anchorType: 'scheduled' as const,
          rrule: sqlToString(row.rrule ?? null),
          completionIntervalJson: null,
        }
      : {
          anchorType: 'completion' as const,
          rrule: null,
          completionIntervalJson: sqlToJson<Readonly<Record<string, unknown>>>(
            row.completion_interval_json ?? null,
          ),
        };

  return {
    ...anchor,
    id,
    templateJson,
    active,
    nextOccurrenceSeq,
    stopAfterOccurrenceSeq,
    templateRevision,
    createdAt,
    updatedAt,
    clocks,
  };
}

export function attachmentToRow(attachment: Attachment): SqliteRow {
  return {
    id: uuidToSql(attachment.id),
    task_id: uuidToSql(attachment.taskId),
    display_name: attachment.displayName,
    mime: attachment.mime,
    size: BigInt(attachment.size),
    sha256: attachment.sha256,
    local_uri: attachment.localUri,
    object_key: attachment.objectKey,
    state: attachment.state,
    created_at: instantToSql(attachment.createdAt),
    updated_at: instantToSql(attachment.updatedAt),
  };
}

export function rowToAttachment(row: SqliteRow): Attachment {
  return {
    id: sqlToUuid(row.id ?? null),
    taskId: sqlToUuid(row.task_id ?? null),
    displayName: sqlToString(row.display_name ?? null),
    mime: sqlToString(row.mime ?? null),
    size: sqlToNumber(row.size ?? null),
    sha256: sqlToString(row.sha256 ?? null),
    localUri: sqlToNullableString(row.local_uri ?? null),
    objectKey: sqlToNullableString(row.object_key ?? null),
    state: sqlToString(row.state ?? null) as AttachmentState,
    createdAt: sqlToNullableInstant(row.created_at ?? null) ?? failMissing('created_at'),
    updatedAt: sqlToNullableInstant(row.updated_at ?? null) ?? failMissing('updated_at'),
  };
}

export function taskLinkToRow(link: TaskLink): SqliteRow {
  return {
    id: uuidToSql(link.id),
    task_id: uuidToSql(link.taskId),
    url: link.url,
    display_label: link.displayLabel,
    created_at: instantToSql(link.createdAt),
    updated_at: instantToSql(link.updatedAt),
  };
}

export function rowToTaskLink(row: SqliteRow): TaskLink {
  return {
    id: sqlToUuid(row.id ?? null),
    taskId: sqlToUuid(row.task_id ?? null),
    url: sqlToString(row.url ?? null),
    displayLabel: sqlToNullableString(row.display_label ?? null),
    createdAt: sqlToNullableInstant(row.created_at ?? null) ?? failMissing('created_at'),
    updatedAt: sqlToNullableInstant(row.updated_at ?? null) ?? failMissing('updated_at'),
  };
}

/** `import_batches`/`sync_conflicts` не входят в `EntityType`
 * (`ports/import-batch-repository.ts`, `ports/sync-conflict-repository.ts`
 * объясняют почему) — `xToRow` здесь существуют не для `applyMutation`, а
 * для тестов специфики SQLite этого пакета (`test/sqlite/`), которым нужно
 * подготовить строки этих двух таблиц напрямую через `NodeSqliteDriver`. */
export function importBatchToRow(batch: ImportBatch): SqliteRow {
  return {
    id: uuidToSql(batch.id),
    source: batch.source,
    started_at: instantToSql(batch.startedAt),
    finished_at: nullableInstantToSql(batch.finishedAt),
    rollback_deadline: instantToSql(batch.rollbackDeadline),
    status: batch.status,
    report_json: jsonToSql(batch.reportJson),
  };
}

export function rowToImportBatch(row: SqliteRow): ImportBatch {
  return {
    id: sqlToUuid(row.id ?? null),
    source: sqlToString(row.source ?? null),
    startedAt: sqlToNullableInstant(row.started_at ?? null) ?? failMissing('started_at'),
    finishedAt: sqlToNullableInstant(row.finished_at ?? null),
    rollbackDeadline:
      sqlToNullableInstant(row.rollback_deadline ?? null) ?? failMissing('rollback_deadline'),
    status: sqlToString(row.status ?? null),
    reportJson: sqlToJson(row.report_json ?? null),
  };
}

export function syncOutboxEntryToRow(entry: SyncOutboxEntry): SqliteRow {
  return {
    op_id: uuidToSql(entry.opId),
    device_id: uuidToSql(entry.deviceId),
    entity_type: entry.entityType,
    entity_id: uuidToSql(entry.entityId),
    patch_json: jsonToSql(entry.patchJson),
    field_clocks_json: fieldClocksToSql(entry.fieldClocksJson),
    base_revision: entry.baseRevision,
    created_at: instantToSql(entry.createdAt),
    retry_count: BigInt(entry.retryCount),
  };
}

export function rowToSyncOutboxEntry(row: SqliteRow): SyncOutboxEntry {
  return {
    opId: sqlToUuid(row.op_id ?? null),
    deviceId: sqlToUuid(row.device_id ?? null),
    entityType: sqlToString(row.entity_type ?? null) as SyncOutboxEntry['entityType'],
    entityId: sqlToUuid(row.entity_id ?? null),
    patchJson: sqlToJson(row.patch_json ?? null),
    fieldClocksJson: sqlToFieldClocks(row.field_clocks_json ?? null),
    baseRevision: sqlToNullableBigint(row.base_revision ?? null) ?? failMissing('base_revision'),
    createdAt: sqlToNullableInstant(row.created_at ?? null) ?? failMissing('created_at'),
    retryCount: sqlToNumber(row.retry_count ?? null),
  };
}

export function syncConflictToRow(conflict: SyncConflict): SqliteRow {
  return {
    id: uuidToSql(conflict.id),
    entity_type: conflict.entityType,
    entity_id: uuidToSql(conflict.entityId),
    field: conflict.field,
    local_value: jsonToSql(conflict.localValue),
    remote_value: jsonToSql(conflict.remoteValue),
    winner_value: jsonToSql(conflict.winnerValue),
    local_clock_physical: instantToSql(conflict.localClock.physical),
    local_clock_logical: BigInt(conflict.localClock.logical),
    local_clock_device_id: nullableUuidToSql(conflict.localClock.deviceId),
    remote_clock_physical: instantToSql(conflict.remoteClock.physical),
    remote_clock_logical: BigInt(conflict.remoteClock.logical),
    remote_clock_device_id: nullableUuidToSql(conflict.remoteClock.deviceId),
    resolved_at: nullableInstantToSql(conflict.resolvedAt),
  };
}

export function rowToSyncConflict(row: SqliteRow): SyncConflict {
  return {
    id: sqlToUuid(row.id ?? null),
    entityType: sqlToString(row.entity_type ?? null) as SyncConflict['entityType'],
    entityId: sqlToUuid(row.entity_id ?? null),
    field: sqlToString(row.field ?? null),
    localValue: sqlToJson(row.local_value ?? null),
    remoteValue: sqlToJson(row.remote_value ?? null),
    winnerValue: sqlToJson(row.winner_value ?? null),
    localClock: {
      physical:
        sqlToNullableInstant(row.local_clock_physical ?? null) ??
        failMissing('local_clock_physical'),
      logical: sqlToNumber(row.local_clock_logical ?? null),
      deviceId: sqlToNullableUuid(row.local_clock_device_id ?? null),
    },
    remoteClock: {
      physical:
        sqlToNullableInstant(row.remote_clock_physical ?? null) ??
        failMissing('remote_clock_physical'),
      logical: sqlToNumber(row.remote_clock_logical ?? null),
      deviceId: sqlToNullableUuid(row.remote_clock_device_id ?? null),
    },
    resolvedAt: sqlToNullableInstant(row.resolved_at ?? null),
  };
}
