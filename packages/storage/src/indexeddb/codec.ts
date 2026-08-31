import { Temporal } from '@js-temporal/polyfill';
import {
  asUuid,
  makeDurationMinutes,
  makeOccurrenceSeq,
  makePriority,
  type Attachment,
  type ChecklistItem,
  type FieldClocks,
  type Hlc,
  type ImportBatch,
  type Label,
  type Project,
  type Rank,
  type RecurrenceSeries,
  type Reminder,
  type Section,
  type SyncConflict,
  type SyncOutboxEntry,
  type Task,
  type TaskLabel,
  type TaskLink,
} from '@shagi/core';

/**
 * Перевод доменных сущностей (`@shagi/core`) в записи, которые физически
 * попадают в IndexedDB object stores, и обратно (задание пакета работ
 * E02.3, п.2). Одна запись на сущность — не разложение по SQL-строкам, как
 * у `../sqlite/codec.ts` (IndexedDB не реляционная), но с тем же принципом:
 * один модуль на весь адаптер, чтобы правило "как хранится
 * `Instant`/`PlainDate`/`bigint`" не изобреталось заново в каждом
 * репозитории.
 *
 * Имена полей на выходе — `snake_case`, ДОСЛОВНО совпадающие с колонками
 * `../schema/tables.ts` (не `camelCase` доменных типов). Это не стилевой
 * выбор: `keyPath`/`createIndex` в `./schema.ts` берут имена НАПРЯМУЮ из
 * `TableDefinition.primaryKey`/`IndexDefinition.columns` без ручного
 * маппинга — расхождение между "как называется колонка в замороженной
 * схеме" и "как называется поле в физической записи" стало бы невозможно
 * проверить, если бы эти два имени могли отличаться.
 *
 * Почему нужен кодек вообще, а не просто `store.put(task)`: структурный
 * клон (алгоритм, которым IndexedDB физически сохраняет значения) не умеет
 * клонировать `Temporal.Instant`/`PlainDate`/`PlainTime` — это классы
 * `@js-temporal/polyfill`, не входящие в список типов, которые понимает
 * structured clone (в отличие от `Date`, `Map`, `Set`, `bigint` — те
 * клонируются нативно, кодек им не нужен). Попытка `put()` объекта с живым
 * poly­fill-инстансом внутри бросает `DataCloneError` в реальном браузере
 * (и в `fake-indexeddb`, который реализует тот же алгоритм) — это не
 * гипотетический риск, это первое, что упадёт при попытке записи без
 * кодека.
 *
 * `Instant` кодируется как `bigint` (epoch-наносекунды) — так же, как в
 * `../sqlite/codec.ts`, и по той же причине (точность, никакого разбора
 * строки на чтение). Ни один из десяти индексов `../schema/indexes.ts` не
 * использует поле типа `instant` как ключ, поэтому нет ограничения "bigint
 * недопустим как IndexedDB-ключ" — тут это всегда значение поля, не ключ.
 * `PlainDate`/`PlainTime`, наоборот, участвуют в ключах индексов
 * (`planned_date`, `deadline_date`, `focus_date`) — кодируются как
 * канонические ISO-строки (`YYYY-MM-DD`/`HH:MM:SS[.sss]`), лексикографический
 * порядок которых совпадает с хронологическим, поэтому IndexedDB сортирует
 * их правильно без дополнительной логики.
 */

// --- Скалярные кодеки --------------------------------------------------------

export function encodeInstant(value: Temporal.Instant): bigint {
  return value.epochNanoseconds;
}
export function decodeInstant(value: bigint): Temporal.Instant {
  return Temporal.Instant.fromEpochNanoseconds(value);
}
export function encodeNullableInstant(value: Temporal.Instant | null): bigint | null {
  return value === null ? null : encodeInstant(value);
}
export function decodeNullableInstant(value: bigint | null): Temporal.Instant | null {
  return value === null ? null : decodeInstant(value);
}

export function encodePlainDate(value: Temporal.PlainDate): string {
  return value.toString();
}
export function decodePlainDate(value: string): Temporal.PlainDate {
  return Temporal.PlainDate.from(value);
}
export function encodeNullablePlainDate(value: Temporal.PlainDate | null): string | null {
  return value === null ? null : encodePlainDate(value);
}
export function decodeNullablePlainDate(value: string | null): Temporal.PlainDate | null {
  return value === null ? null : decodePlainDate(value);
}

export function encodePlainTime(value: Temporal.PlainTime): string {
  return value.toString();
}
export function decodePlainTime(value: string): Temporal.PlainTime {
  return Temporal.PlainTime.from(value);
}
export function encodeNullablePlainTime(value: Temporal.PlainTime | null): string | null {
  return value === null ? null : encodePlainTime(value);
}
export function decodeNullablePlainTime(value: string | null): Temporal.PlainTime | null {
  return value === null ? null : decodePlainTime(value);
}

function asRank(value: string): Rank {
  // `Rank` не имеет smart-constructor'а в `@shagi/core` (комментарий
  // `values.ts`: "здесь Rank только маркирует поле как непрозрачную
  // сортируемую строку") — валидировать здесь нечего, только перебрендить.
  return value as Rank;
}

// --- Hlc / FieldClocks --------------------------------------------------------

interface EncodedHlcValue {
  readonly physical: bigint;
  readonly logical: number;
  readonly deviceId: string | null;
}

function encodeHlcValue(hlc: Hlc): EncodedHlcValue {
  return { physical: encodeInstant(hlc.physical), logical: hlc.logical, deviceId: hlc.deviceId };
}
function decodeHlcValue(value: EncodedHlcValue): Hlc {
  return {
    physical: decodeInstant(value.physical),
    logical: value.logical,
    deviceId: value.deviceId === null ? null : asUuid(value.deviceId),
  };
}

/** `clocks`/`field_clocks_json` (тип колонки `json`, `../schema/tables.ts`)
 * — карта "имя поля → Hlc" произвольного размера. В отличие от
 * `../sqlite/codec.ts`, не сериализуется в строку: IndexedDB хранит вложенные
 * простые объекты нативно, лишний `JSON.stringify`/`parse` был бы избыточен. */
export function encodeFieldClocks(clocks: FieldClocks): Record<string, EncodedHlcValue> {
  const encoded: Record<string, EncodedHlcValue> = {};
  for (const [field, hlc] of Object.entries(clocks)) {
    if (hlc === undefined) continue;
    encoded[field] = encodeHlcValue(hlc);
  }
  return encoded;
}
export function decodeFieldClocks(row: Record<string, EncodedHlcValue>): FieldClocks {
  const result: Record<string, Hlc> = {};
  for (const [field, value] of Object.entries(row)) {
    result[field] = decodeHlcValue(value);
  }
  return result;
}

/** Три плоские колонки на одно значение `Hlc` (`hlcColumns` в
 * `../schema/tables.ts` — `task_labels.add_hlc_*`/`remove_hlc_*`,
 * `sync_conflicts.local_clock_*`/`remote_clock_*`). Не то же самое, что
 * `FieldClocks`: здесь ровно ОДНО известное заранее значение, не карта
 * произвольных полей — поэтому колонки фиксированы буквально, а не
 * вложенный объект. */
export interface EncodedHlcColumns {
  readonly physical: bigint;
  readonly logical: number;
  readonly device_id: string | null;
}
export interface EncodedNullableHlcColumns {
  readonly physical: bigint | null;
  readonly logical: number | null;
  readonly device_id: string | null;
}

export function encodeHlcColumns(hlc: Hlc): EncodedHlcColumns {
  return { physical: encodeInstant(hlc.physical), logical: hlc.logical, device_id: hlc.deviceId };
}
export function decodeHlcColumns(columns: EncodedHlcColumns): Hlc {
  return {
    physical: decodeInstant(columns.physical),
    logical: columns.logical,
    deviceId: columns.device_id === null ? null : asUuid(columns.device_id),
  };
}
export function encodeNullableHlcColumns(hlc: Hlc | null): EncodedNullableHlcColumns {
  if (hlc === null) return { physical: null, logical: null, device_id: null };
  return { physical: encodeInstant(hlc.physical), logical: hlc.logical, device_id: hlc.deviceId };
}
export function decodeNullableHlcColumns(columns: EncodedNullableHlcColumns): Hlc | null {
  if (columns.physical === null) return null;
  return {
    physical: decodeInstant(columns.physical),
    logical: columns.logical as number,
    deviceId: columns.device_id === null ? null : asUuid(columns.device_id),
  };
}

// --- tasks ---------------------------------------------------------------------

export interface StoredTask {
  readonly id: string;
  readonly owner_scope: string;
  readonly title: string;
  readonly description: string;
  readonly status: Task['status'];
  readonly capture_state: Task['captureState'];
  readonly project_id: string | null;
  readonly section_id: string | null;
  readonly parent_task_id: string | null;
  readonly rank: string;
  readonly priority: number;
  readonly focus_date: string | null;
  readonly day_bucket: Task['dayBucket'];
  readonly available_from: string | null;
  readonly planned_date: string | null;
  readonly planned_time: string | null;
  readonly duration_min: number | null;
  readonly deadline_date: string | null;
  readonly deadline_time: string | null;
  readonly series_id: string | null;
  readonly occurrence_seq: bigint | null;
  readonly generated_from_occurrence_id: string | null;
  readonly original_project_name_snapshot: string | null;
  readonly original_section_name_snapshot: string | null;
  readonly source: Task['source'];
  readonly source_channel: Task['sourceChannel'];
  readonly source_capture_batch_id: string | null;
  readonly source_intent_id: string | null;
  readonly created_at: bigint;
  readonly updated_at: bigint;
  readonly completed_at: bigint | null;
  readonly completion_kind: Task['completionKind'];
  readonly deleted_at: bigint | null;
  readonly revision: bigint;
  readonly clocks: Record<string, EncodedHlcValue>;
}

export function encodeTask(task: Task): StoredTask {
  return {
    id: task.id,
    owner_scope: task.ownerScope,
    title: task.title,
    description: task.description,
    status: task.status,
    capture_state: task.captureState,
    project_id: task.projectId,
    section_id: task.sectionId,
    parent_task_id: task.parentTaskId,
    rank: task.rank,
    priority: task.priority,
    focus_date: encodeNullablePlainDate(task.focusDate),
    day_bucket: task.dayBucket,
    available_from: encodeNullablePlainDate(task.availableFrom),
    planned_date: encodeNullablePlainDate(task.plannedDate),
    planned_time: encodeNullablePlainTime(task.plannedTime),
    duration_min: task.durationMin,
    deadline_date: encodeNullablePlainDate(task.deadlineDate),
    deadline_time: encodeNullablePlainTime(task.deadlineTime),
    series_id: task.seriesId,
    occurrence_seq: task.occurrenceSeq,
    generated_from_occurrence_id: task.generatedFromOccurrenceId,
    original_project_name_snapshot: task.originalProjectNameSnapshot,
    original_section_name_snapshot: task.originalSectionNameSnapshot,
    source: task.source,
    source_channel: task.sourceChannel,
    source_capture_batch_id: task.sourceCaptureBatchId,
    source_intent_id: task.sourceIntentId,
    created_at: encodeInstant(task.createdAt),
    updated_at: encodeInstant(task.updatedAt),
    completed_at: encodeNullableInstant(task.completedAt),
    completion_kind: task.completionKind,
    deleted_at: encodeNullableInstant(task.deletedAt),
    revision: task.revision,
    clocks: encodeFieldClocks(task.clocks),
  };
}

/**
 * Обратное преобразование восстанавливает поля через объектный литерал по
 * ветке `TaskHierarchy`/`TaskProjectPlacement`/`TaskPlanning`/`TaskDeadline`/
 * `TaskCompletion` (`@shagi/core`, `entities/task.ts`) — не приведением
 * типа `as Task`: если бы хранилище когда-нибудь сохранило несогласованную
 * комбинацию полей (например `parentTaskId` заполнен, а `captureState`
 * почему-то не `'processed'`), `as Task` молча пропустил бы это, а сборка
 * литералом ветками union — нет (тот же приём, что `../contract/fixtures.ts`
 * `buildHierarchy`/`buildPlanning`/...).
 */
export function decodeTask(row: StoredTask): Task {
  const base = {
    id: asUuid(row.id),
    ownerScope: asUuid(row.owner_scope),
    title: row.title,
    description: row.description,
    priority: makePriority(row.priority),
    rank: asRank(row.rank),
    source: row.source,
    sourceChannel: row.source_channel,
    sourceCaptureBatchId:
      row.source_capture_batch_id === null ? null : asUuid(row.source_capture_batch_id),
    sourceIntentId: row.source_intent_id === null ? null : asUuid(row.source_intent_id),
    originalProjectNameSnapshot: row.original_project_name_snapshot,
    originalSectionNameSnapshot: row.original_section_name_snapshot,
    createdAt: decodeInstant(row.created_at),
    updatedAt: decodeInstant(row.updated_at),
    deletedAt: decodeNullableInstant(row.deleted_at),
    revision: row.revision,
    clocks: decodeFieldClocks(row.clocks),
  };

  const hierarchy =
    row.parent_task_id === null
      ? {
          parentTaskId: null,
          captureState: row.capture_state,
          seriesId: row.series_id === null ? null : asUuid(row.series_id),
          occurrenceSeq: row.occurrence_seq === null ? null : makeOccurrenceSeq(row.occurrence_seq),
          generatedFromOccurrenceId:
            row.generated_from_occurrence_id === null
              ? null
              : asUuid(row.generated_from_occurrence_id),
        }
      : {
          parentTaskId: asUuid(row.parent_task_id),
          captureState: 'processed' as const,
          seriesId: null,
          occurrenceSeq: null,
          generatedFromOccurrenceId: null,
        };

  const placement =
    row.project_id === null
      ? { projectId: null, sectionId: null }
      : {
          projectId: asUuid(row.project_id),
          sectionId: row.section_id === null ? null : asUuid(row.section_id),
        };

  const planning =
    row.planned_date === null
      ? {
          availableFrom: decodeNullablePlainDate(row.available_from),
          plannedDate: null,
          plannedTime: null,
          durationMin: null,
          focusDate: null,
          dayBucket: 'default' as const,
        }
      : {
          availableFrom: decodeNullablePlainDate(row.available_from),
          plannedDate: decodePlainDate(row.planned_date),
          plannedTime: decodeNullablePlainTime(row.planned_time),
          durationMin: row.duration_min === null ? null : makeDurationMinutes(row.duration_min),
          focusDate: decodeNullablePlainDate(row.focus_date),
          dayBucket: row.day_bucket,
        };

  const deadline =
    row.deadline_date === null
      ? { deadlineDate: null, deadlineTime: null }
      : {
          deadlineDate: decodePlainDate(row.deadline_date),
          deadlineTime: decodeNullablePlainTime(row.deadline_time),
        };

  const completion =
    row.status === 'active'
      ? { status: 'active' as const, completedAt: null, completionKind: null }
      : {
          status: 'completed' as const,
          completedAt: decodeInstant(row.completed_at as bigint),
          completionKind: row.completion_kind as NonNullable<Task['completionKind']>,
        };

  return { ...base, ...hierarchy, ...placement, ...planning, ...deadline, ...completion };
}

// --- projects --------------------------------------------------------------------

export interface StoredProject {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly color_token: string;
  readonly icon: string | null;
  readonly default_view: Project['defaultView'];
  readonly favorite: boolean;
  readonly archived_at: bigint | null;
  readonly rank: string;
  readonly created_at: bigint;
  readonly updated_at: bigint;
  readonly deleted_at: bigint | null;
  readonly clocks: Record<string, EncodedHlcValue>;
}

export function encodeProject(project: Project): StoredProject {
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    color_token: project.colorToken,
    icon: project.icon,
    default_view: project.defaultView,
    favorite: project.favorite,
    archived_at: encodeNullableInstant(project.archivedAt),
    rank: project.rank,
    created_at: encodeInstant(project.createdAt),
    updated_at: encodeInstant(project.updatedAt),
    deleted_at: encodeNullableInstant(project.deletedAt),
    clocks: encodeFieldClocks(project.clocks),
  };
}

export function decodeProject(row: StoredProject): Project {
  return {
    id: asUuid(row.id),
    title: row.title,
    description: row.description,
    colorToken: row.color_token,
    icon: row.icon,
    defaultView: row.default_view,
    favorite: row.favorite,
    archivedAt: decodeNullableInstant(row.archived_at),
    rank: asRank(row.rank),
    createdAt: decodeInstant(row.created_at),
    updatedAt: decodeInstant(row.updated_at),
    deletedAt: decodeNullableInstant(row.deleted_at),
    clocks: decodeFieldClocks(row.clocks),
  };
}

// --- sections ------------------------------------------------------------------

export interface StoredSection {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly rank: string;
  readonly deleted_at: bigint | null;
  readonly clocks: Record<string, EncodedHlcValue>;
}

export function encodeSection(section: Section): StoredSection {
  return {
    id: section.id,
    project_id: section.projectId,
    title: section.title,
    rank: section.rank,
    deleted_at: encodeNullableInstant(section.deletedAt),
    clocks: encodeFieldClocks(section.clocks),
  };
}

export function decodeSection(row: StoredSection): Section {
  return {
    id: asUuid(row.id),
    projectId: asUuid(row.project_id),
    title: row.title,
    rank: asRank(row.rank),
    deletedAt: decodeNullableInstant(row.deleted_at),
    clocks: decodeFieldClocks(row.clocks),
  };
}

// --- labels --------------------------------------------------------------------

export interface StoredLabel {
  readonly id: string;
  readonly normalized_name: string;
  readonly display_name: string;
  readonly color_token: string | null;
  readonly rank: string;
  readonly deleted_at: bigint | null;
  readonly clocks: Record<string, EncodedHlcValue>;
}

export function encodeLabel(label: Label): StoredLabel {
  return {
    id: label.id,
    normalized_name: label.normalizedName,
    display_name: label.displayName,
    color_token: label.colorToken,
    rank: label.rank,
    deleted_at: encodeNullableInstant(label.deletedAt),
    clocks: encodeFieldClocks(label.clocks),
  };
}

export function decodeLabel(row: StoredLabel): Label {
  return {
    id: asUuid(row.id),
    normalizedName: row.normalized_name,
    displayName: row.display_name,
    colorToken: row.color_token,
    rank: asRank(row.rank),
    deletedAt: decodeNullableInstant(row.deleted_at),
    clocks: decodeFieldClocks(row.clocks),
  };
}

// --- task_labels -----------------------------------------------------------------

export interface StoredTaskLabel {
  readonly task_id: string;
  readonly label_id: string;
  readonly add_hlc_physical: bigint;
  readonly add_hlc_logical: number;
  readonly add_hlc_device_id: string | null;
  readonly remove_hlc_physical: bigint | null;
  readonly remove_hlc_logical: number | null;
  readonly remove_hlc_device_id: string | null;
}

export function encodeTaskLabel(link: TaskLabel): StoredTaskLabel {
  const add = encodeHlcColumns(link.addHlc);
  const remove = encodeNullableHlcColumns(link.removeHlc);
  return {
    task_id: link.taskId,
    label_id: link.labelId,
    add_hlc_physical: add.physical,
    add_hlc_logical: add.logical,
    add_hlc_device_id: add.device_id,
    remove_hlc_physical: remove.physical,
    remove_hlc_logical: remove.logical,
    remove_hlc_device_id: remove.device_id,
  };
}

export function decodeTaskLabel(row: StoredTaskLabel): TaskLabel {
  return {
    taskId: asUuid(row.task_id),
    labelId: asUuid(row.label_id),
    addHlc: decodeHlcColumns({
      physical: row.add_hlc_physical,
      logical: row.add_hlc_logical,
      device_id: row.add_hlc_device_id,
    }),
    removeHlc: decodeNullableHlcColumns({
      physical: row.remove_hlc_physical,
      logical: row.remove_hlc_logical,
      device_id: row.remove_hlc_device_id,
    }),
  };
}

// --- checklist_items ---------------------------------------------------------------

export interface StoredChecklistItem {
  readonly id: string;
  readonly task_id: string;
  readonly text: string;
  readonly done: boolean;
  readonly rank: string;
  readonly deleted_at: bigint | null;
  readonly clocks: Record<string, EncodedHlcValue>;
}

export function encodeChecklistItem(item: ChecklistItem): StoredChecklistItem {
  return {
    id: item.id,
    task_id: item.taskId,
    text: item.text,
    done: item.done,
    rank: item.rank,
    deleted_at: encodeNullableInstant(item.deletedAt),
    clocks: encodeFieldClocks(item.clocks),
  };
}

export function decodeChecklistItem(row: StoredChecklistItem): ChecklistItem {
  return {
    id: asUuid(row.id),
    taskId: asUuid(row.task_id),
    text: row.text,
    done: row.done,
    rank: asRank(row.rank),
    deletedAt: decodeNullableInstant(row.deleted_at),
    clocks: decodeFieldClocks(row.clocks),
  };
}

// --- reminders -----------------------------------------------------------------------

export interface StoredReminder {
  readonly id: string;
  readonly task_id: string;
  readonly kind: Reminder['kind'];
  readonly local_rule_json: Readonly<Record<string, unknown>>;
  readonly enabled: boolean;
  readonly scheduled_fingerprint: string;
}

export function encodeReminder(reminder: Reminder): StoredReminder {
  return {
    id: reminder.id,
    task_id: reminder.taskId,
    kind: reminder.kind,
    local_rule_json: reminder.localRuleJson,
    enabled: reminder.enabled,
    scheduled_fingerprint: reminder.scheduledFingerprint,
  };
}

export function decodeReminder(row: StoredReminder): Reminder {
  return {
    id: asUuid(row.id),
    taskId: asUuid(row.task_id),
    kind: row.kind,
    localRuleJson: row.local_rule_json,
    enabled: row.enabled,
    scheduledFingerprint: row.scheduled_fingerprint,
  };
}

// --- recurrence_series -----------------------------------------------------------------

export interface StoredRecurrenceSeries {
  readonly id: string;
  readonly anchor_type: RecurrenceSeries['anchorType'];
  readonly rrule: string | null;
  readonly completion_interval_json: Readonly<Record<string, unknown>> | null;
  readonly template_json: Readonly<Record<string, unknown>>;
  readonly active: boolean;
  readonly next_occurrence_seq: bigint;
  readonly stop_after_occurrence_seq: bigint | null;
  readonly template_revision: bigint;
  readonly created_at: bigint;
  readonly updated_at: bigint;
  readonly clocks: Record<string, EncodedHlcValue>;
}

export function encodeRecurrenceSeries(series: RecurrenceSeries): StoredRecurrenceSeries {
  return {
    id: series.id,
    anchor_type: series.anchorType,
    rrule: series.rrule,
    completion_interval_json: series.completionIntervalJson,
    template_json: series.templateJson,
    active: series.active,
    next_occurrence_seq: series.nextOccurrenceSeq,
    stop_after_occurrence_seq: series.stopAfterOccurrenceSeq,
    template_revision: series.templateRevision,
    created_at: encodeInstant(series.createdAt),
    updated_at: encodeInstant(series.updatedAt),
    clocks: encodeFieldClocks(series.clocks),
  };
}

export function decodeRecurrenceSeries(row: StoredRecurrenceSeries): RecurrenceSeries {
  const anchor =
    row.anchor_type === 'scheduled'
      ? {
          anchorType: 'scheduled' as const,
          rrule: row.rrule as string,
          completionIntervalJson: null,
        }
      : {
          anchorType: 'completion' as const,
          rrule: null,
          completionIntervalJson: row.completion_interval_json as Readonly<Record<string, unknown>>,
        };

  return {
    ...anchor,
    id: asUuid(row.id),
    templateJson: row.template_json,
    active: row.active,
    nextOccurrenceSeq: makeOccurrenceSeq(row.next_occurrence_seq),
    stopAfterOccurrenceSeq:
      row.stop_after_occurrence_seq === null
        ? null
        : makeOccurrenceSeq(row.stop_after_occurrence_seq),
    templateRevision: row.template_revision,
    createdAt: decodeInstant(row.created_at),
    updatedAt: decodeInstant(row.updated_at),
    clocks: decodeFieldClocks(row.clocks),
  };
}

// --- attachments ---------------------------------------------------------------------

export interface StoredAttachment {
  readonly id: string;
  readonly task_id: string;
  readonly display_name: string;
  readonly mime: string;
  readonly size: number;
  readonly sha256: string;
  readonly local_uri: string | null;
  readonly object_key: string | null;
  readonly state: Attachment['state'];
  readonly created_at: bigint;
  readonly updated_at: bigint;
}

export function encodeAttachment(attachment: Attachment): StoredAttachment {
  return {
    id: attachment.id,
    task_id: attachment.taskId,
    display_name: attachment.displayName,
    mime: attachment.mime,
    size: attachment.size,
    sha256: attachment.sha256,
    local_uri: attachment.localUri,
    object_key: attachment.objectKey,
    state: attachment.state,
    created_at: encodeInstant(attachment.createdAt),
    updated_at: encodeInstant(attachment.updatedAt),
  };
}

export function decodeAttachment(row: StoredAttachment): Attachment {
  return {
    id: asUuid(row.id),
    taskId: asUuid(row.task_id),
    displayName: row.display_name,
    mime: row.mime,
    size: row.size,
    sha256: row.sha256,
    localUri: row.local_uri,
    objectKey: row.object_key,
    state: row.state,
    createdAt: decodeInstant(row.created_at),
    updatedAt: decodeInstant(row.updated_at),
  };
}

// --- task_links ----------------------------------------------------------------------

export interface StoredTaskLink {
  readonly id: string;
  readonly task_id: string;
  readonly url: string;
  readonly display_label: string | null;
  readonly created_at: bigint;
  readonly updated_at: bigint;
}

export function encodeTaskLink(link: TaskLink): StoredTaskLink {
  return {
    id: link.id,
    task_id: link.taskId,
    url: link.url,
    display_label: link.displayLabel,
    created_at: encodeInstant(link.createdAt),
    updated_at: encodeInstant(link.updatedAt),
  };
}

export function decodeTaskLink(row: StoredTaskLink): TaskLink {
  return {
    id: asUuid(row.id),
    taskId: asUuid(row.task_id),
    url: row.url,
    displayLabel: row.display_label,
    createdAt: decodeInstant(row.created_at),
    updatedAt: decodeInstant(row.updated_at),
  };
}

// --- import_batches ------------------------------------------------------------------

export interface StoredImportBatch {
  readonly id: string;
  readonly source: string;
  readonly started_at: bigint;
  readonly finished_at: bigint | null;
  readonly rollback_deadline: bigint;
  readonly status: string;
  readonly report_json: Readonly<Record<string, unknown>>;
}

export function encodeImportBatch(batch: ImportBatch): StoredImportBatch {
  return {
    id: batch.id,
    source: batch.source,
    started_at: encodeInstant(batch.startedAt),
    finished_at: encodeNullableInstant(batch.finishedAt),
    rollback_deadline: encodeInstant(batch.rollbackDeadline),
    status: batch.status,
    report_json: batch.reportJson,
  };
}

export function decodeImportBatch(row: StoredImportBatch): ImportBatch {
  return {
    id: asUuid(row.id),
    source: row.source,
    startedAt: decodeInstant(row.started_at),
    finishedAt: decodeNullableInstant(row.finished_at),
    rollbackDeadline: decodeInstant(row.rollback_deadline),
    status: row.status,
    reportJson: row.report_json,
  };
}

// --- sync_outbox ---------------------------------------------------------------------

export interface StoredSyncOutboxEntry {
  readonly op_id: string;
  readonly device_id: string;
  readonly entity_type: SyncOutboxEntry['entityType'];
  readonly entity_id: string;
  readonly patch_json: Readonly<Record<string, unknown>>;
  readonly field_clocks_json: Record<string, EncodedHlcValue>;
  readonly base_revision: bigint;
  readonly created_at: bigint;
  readonly retry_count: number;
}

export function encodeSyncOutboxEntry(entry: SyncOutboxEntry): StoredSyncOutboxEntry {
  return {
    op_id: entry.opId,
    device_id: entry.deviceId,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    patch_json: entry.patchJson,
    field_clocks_json: encodeFieldClocks(entry.fieldClocksJson),
    base_revision: entry.baseRevision,
    created_at: encodeInstant(entry.createdAt),
    retry_count: entry.retryCount,
  };
}

export function decodeSyncOutboxEntry(row: StoredSyncOutboxEntry): SyncOutboxEntry {
  return {
    opId: asUuid(row.op_id),
    deviceId: asUuid(row.device_id),
    entityType: row.entity_type,
    entityId: asUuid(row.entity_id),
    patchJson: row.patch_json,
    fieldClocksJson: decodeFieldClocks(row.field_clocks_json),
    baseRevision: row.base_revision,
    createdAt: decodeInstant(row.created_at),
    retryCount: row.retry_count,
  };
}

// --- sync_conflicts ------------------------------------------------------------------

export interface StoredSyncConflict {
  readonly id: string;
  readonly entity_type: SyncConflict['entityType'];
  readonly entity_id: string;
  readonly field: string;
  readonly local_value: unknown;
  readonly remote_value: unknown;
  readonly winner_value: unknown;
  readonly local_clock_physical: bigint;
  readonly local_clock_logical: number;
  readonly local_clock_device_id: string | null;
  readonly remote_clock_physical: bigint;
  readonly remote_clock_logical: number;
  readonly remote_clock_device_id: string | null;
  readonly resolved_at: bigint | null;
}

export function encodeSyncConflict(conflict: SyncConflict): StoredSyncConflict {
  const local = encodeHlcColumns(conflict.localClock);
  const remote = encodeHlcColumns(conflict.remoteClock);
  return {
    id: conflict.id,
    entity_type: conflict.entityType,
    entity_id: conflict.entityId,
    field: conflict.field,
    local_value: conflict.localValue,
    remote_value: conflict.remoteValue,
    winner_value: conflict.winnerValue,
    local_clock_physical: local.physical,
    local_clock_logical: local.logical,
    local_clock_device_id: local.device_id,
    remote_clock_physical: remote.physical,
    remote_clock_logical: remote.logical,
    remote_clock_device_id: remote.device_id,
    resolved_at: encodeNullableInstant(conflict.resolvedAt),
  };
}

export function decodeSyncConflict(row: StoredSyncConflict): SyncConflict {
  return {
    id: asUuid(row.id),
    entityType: row.entity_type,
    entityId: asUuid(row.entity_id),
    field: row.field,
    localValue: row.local_value,
    remoteValue: row.remote_value,
    winnerValue: row.winner_value,
    localClock: decodeHlcColumns({
      physical: row.local_clock_physical,
      logical: row.local_clock_logical,
      device_id: row.local_clock_device_id,
    }),
    remoteClock: decodeHlcColumns({
      physical: row.remote_clock_physical,
      logical: row.remote_clock_logical,
      device_id: row.remote_clock_device_id,
    }),
    resolvedAt: decodeNullableInstant(row.resolved_at),
  };
}
