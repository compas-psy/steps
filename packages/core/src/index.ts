/**
 * `@shagi/core` — домен ШАГОВ: сущности, инварианты (SPEC/00 §7.1),
 * доменное время на `Temporal` (§5), Today-классификация и правила сброса
 * полей (конспект §3, §5).
 *
 * Границы пакета работ E01.1: только типы и чистые функции. Единственная
 * точка входа для *мутаций* — `CreateTaskCommand` и соседние команды
 * (следующий пакет работ); прямая запись в хранилище в обход команд
 * запрещена. Общий валидатор инвариантов §7.1, который обслуживает и
 * локальные команды, и входящие sync-патчи, — тоже следующий пакет работ;
 * там, где инвариант выражен типом ниже (discriminated union), валидатору
 * нечего проверять — он невозможен уже на уровне компиляции.
 *
 * Пакет не знает про UI, SQLite/IndexedDB или сеть — только домен.
 */
export const PACKAGE_NAME = '@shagi/core' as const;

// --- Скалярные value-types -------------------------------------------------
export {
  asUuid,
  isUuid,
  makeDurationMinutes,
  makeOccurrenceSeq,
  makePriority,
  type Branded,
  type DurationMinutes,
  type FieldClocks,
  type OccurrenceSeq,
  type OwnerScope,
  type Priority,
  type Rank,
  type Uuid,
} from './values.js';

// --- Hybrid Logical Clock ---------------------------------------------------
export { compareHlc, isHlcAfter, type Hlc } from './hlc.js';

// --- Сущности ----------------------------------------------------------------
export {
  type CaptureState,
  type CompletionKind,
  type DayBucket,
  type SourceChannel,
  type Task,
  type TaskCompletion,
  type TaskCore,
  type TaskDeadline,
  type TaskHierarchy,
  type TaskPlanning,
  type TaskProjectPlacement,
  type TaskProvenance,
  type TaskSnapshot,
  type TaskSource,
  type TaskStatus,
} from './entities/task.js';
export { type Project, type ProjectDefaultView } from './entities/project.js';
export { type Section } from './entities/section.js';
export { type Label } from './entities/label.js';
export { isTaskLabelActive, type TaskLabel } from './entities/task-label.js';
export { type ChecklistItem } from './entities/checklist-item.js';
export { type Reminder, type ReminderKind } from './entities/reminder.js';
export {
  type RecurrenceAnchor,
  type RecurrenceAnchorType,
  type RecurrenceSeries,
  type RecurrenceTemplate,
} from './entities/recurrence-series.js';
export { type Attachment, type AttachmentState } from './entities/attachment.js';
export { type TaskLink } from './entities/task-link.js';
export { type ImportBatch } from './entities/import-batch.js';
export { type EntityType } from './entities/entity-type.js';
export { type SyncOutboxEntry } from './entities/sync-outbox.js';
export { type SyncConflict } from './entities/sync-conflict.js';

// --- Temporal-модель (§5, конспект §3) --------------------------------------
export { effectiveDeadlineDateTime, isDeadlinePassed } from './temporal/deadline.js';
export { resolveNextWeekMonday, resolveWeekend } from './temporal/date-shortcuts.js';
export {
  doesDurationCrossDeadline,
  isAvailableFromConflict,
  isDeadlineBeforeAvailableFrom,
  isPlannedAfterDeadline,
  isReminderAfterDeadline,
} from './temporal/predicates.js';
export { toZonedDateTime } from './temporal/timezone.js';

// --- Правила (конспект §3, §5) -----------------------------------------------
export {
  clearDeadline,
  clearPlannedDate,
  setDayBucketLater,
  setPlannedDate,
  setPlannedTime,
} from './rules/field-resets.js';
export {
  classifyTaskForToday,
  type TaskForTodayClassification,
  type TodayGroup,
} from './rules/today-classification.js';
export {
  selectTodayTasks,
  type TodayGroups,
  type TodayStorageQueryPort,
  type TodayTaskReader,
} from './rules/select-today-tasks.js';

// --- Идентификаторы (§6, конспект §4) ----------------------------------------
// Сведено вручную при приёмке: пакеты работ E01.2 и E01.3 шли параллельно и
// оба писали бы в этот файл, поэтому им было запрещено его трогать.
export * from './identity/index.js';

// --- Командный слой (§7, `00§7`, ADR-0003) ------------------------------------
// `commands/index.ts` (пакет работ E01.4) написан полностью, но заголовок
// того файла сам откладывает сведение сюда до появления первого реального
// потребителя ("сведение в общий packages/core/src/index.ts выполняется
// отдельно при приёмке") — раньше него `createTaskCommand` и соседей никто
// не вызывал. Первый реальный вызывающий код — `@shagi/app` M04 First Task
// (`01_PRODUCT_BEHAVIOR_R1.md`: "onboarding First Task → processed +
// today"): пакет `@shagi/core` экспортирует только через `./src/index.ts`
// (CLAUDE.md, «Границы пакетов») — без этой строки `@shagi/app` не мог бы
// импортировать команды вообще, только обходным глубоким импортом, который
// запрещён той же границей.
export * from './commands/index.js';

// --- Дробные ранги (§6, `02§5`) ----------------------------------------------
export * from './order/index.js';

// --- Валидатор инвариантов (`02§2.1`, `02§11.1`) -----------------------------
export * from './validation/index.js';
