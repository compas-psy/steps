import { Temporal } from '@js-temporal/polyfill';

import type { CaptureState, CompletionKind, DayBucket, TaskStatus } from '../entities/task.js';
import {
  doesDurationCrossDeadline,
  isAvailableFromConflict,
  isDeadlineBeforeAvailableFrom,
  isPlannedAfterDeadline,
} from '../temporal/predicates.js';
import { makeDurationMinutes, type Uuid } from '../values.js';
import { hasReadableContent, normalizeTitleWhitespace, unicodeLength } from './title.js';
import { buildResult, makeIssue, type ValidationIssue, type ValidationResult } from './types.js';

/**
 * Единый валидатор Task-мутаций — правила 1–21, 25, 26, 32, 33 конспекта
 * (§2, `01§5`, `01§1`, `02§2.1`). Правило 34 (напоминание после дедлайна)
 * живёт отдельно в `reminder.ts` — `reminders` отдельная сущность в схеме
 * (`02§2`), не поле `Task`. Правила 22–24 (Project/Section/Label) —
 * `project.ts`/`section.ts`/`label.ts`. Правила 27–31 — вне этого модуля
 * (`project.ts`, `sync-stubs.ts`).
 *
 * Вход намеренно "плоский", а не типы из `entities/task.ts`
 * (`TaskHierarchy`/`TaskPlanning`/...): те discriminated union уже не дают
 * скомпилировать нарушение части этих же правил (см. комментарии
 * `entities/task.ts`), но именно поэтому им нечем проверить *входящий*
 * sync-патч или ещё не узкий локальный черновик — те приходят как данные,
 * а не как уже проверенное компилятором значение. Валидатор — рубеж именно
 * для такого сырого входа, общий для обоих путей (`02§11.1`).
 */
export interface TaskValidationInput {
  readonly title: string;
  readonly description: string;
  readonly projectId: Uuid | null;
  readonly sectionId: Uuid | null;
  readonly parentTaskId: Uuid | null;
  readonly captureState: CaptureState;
  readonly seriesId: Uuid | null;
  readonly availableFrom: Temporal.PlainDate | null;
  readonly plannedDate: Temporal.PlainDate | null;
  readonly plannedTime: Temporal.PlainTime | null;
  readonly durationMin: number | null;
  readonly focusDate: Temporal.PlainDate | null;
  readonly dayBucket: DayBucket;
  readonly deadlineDate: Temporal.PlainDate | null;
  readonly deadlineTime: Temporal.PlainTime | null;
  readonly status: TaskStatus;
  readonly completedAt: Temporal.Instant | null;
  readonly completionKind: CompletionKind | null;
  readonly priority: number;
}

/** Срез родителя, нужный для правил 6–9, 16 — валидатор не обходит дерево
 * сам (не его забота — хранилище), только принимает уже выбранный снимок. */
export interface TaskParentSnapshot {
  readonly id: Uuid;
  readonly projectId: Uuid | null;
  readonly sectionId: Uuid | null;
  /** Для правила 7 (глубина ≤1 для user-created): родитель обязан сам быть
   * top-level, иначе валидируемая задача стала бы внуком. */
  readonly parentTaskId: Uuid | null;
  /** Текущее число прямых subtasks родителя, **не считая** валидируемую
   * задачу (правило 16). */
  readonly directSubtaskCount: number;
}

export interface TaskValidationContext {
  /** id валидируемой задачи — нужен для самоссылочного цикла (правило 7);
   * `null` для ещё не созданной задачи (самоссылка невозможна структурно). */
  readonly id: Uuid | null;
  /** `null`, если `parentTaskId` не задан. Обязателен, когда задан — вызов
   * без снимка при заданном `parentTaskId` считается ошибкой вызывающего
   * кода (программная, не доменная ошибка), а не молча пропускается. */
  readonly parent: TaskParentSnapshot | null;
  /** Правило 17. */
  readonly checklistItemCount: number;
  /** Правило 18. */
  readonly labelCount: number;
  /** Правило 19. */
  readonly explicitReminderCount: number;
  /** Правило 20. */
  readonly linkCount: number;
  /** Правило 21. */
  readonly attachmentCount: number;
}

const TITLE_MAX_LENGTH = 500;
const DESCRIPTION_MAX_LENGTH = 100_000;
const MAX_SUBTASKS = 100;
const MAX_CHECKLIST_ITEMS = 200;
const MAX_LABELS = 50;
const MAX_EXPLICIT_REMINDERS = 1;
const MAX_LINKS = 20;
const MAX_ATTACHMENTS = 10;
const DURATION_MIN_MINUTES = 1;
const DURATION_MAX_MINUTES = 1440;
const PRIORITY_MIN = 1;
const PRIORITY_MAX = 4;

export function validateTask(
  input: TaskValidationInput,
  context: TaskValidationContext,
): ValidationResult {
  if (input.parentTaskId !== null && context.parent === null) {
    throw new TypeError(
      'validateTask: parentTaskId задан, но TaskValidationContext.parent не передан — ' +
        'вызывающий код обязан загрузить снимок родителя перед валидацией (правила 6–9, 16).',
    );
  }

  const issues: ValidationIssue[] = [
    ...checkPlannedTimeRequiresDate(input),
    ...checkDeadlineTimeRequiresDate(input),
    ...checkAvailableFromConflict(input),
    ...checkDeadlineBeforeAvailableFrom(input),
    ...checkSectionRequiresProject(input),
    ...checkHierarchyProjectMatch(input, context),
    ...checkHierarchyDepthAndCycle(input, context),
    ...checkRecurringMustBeTopLevel(input),
    ...checkChildMustBeProcessed(input),
    ...checkFocusDate(input),
    ...checkDayBucketLater(input),
    ...checkCompletionConsistency(input),
    ...checkCompletionKindConsistency(input),
    ...checkTitle(input),
    ...checkDescription(input),
    ...checkSubtaskLimit(context),
    ...checkChecklistLimit(context),
    ...checkLabelLimit(context),
    ...checkReminderLimit(context),
    ...checkLinkLimit(context),
    ...checkAttachmentLimit(context),
    ...checkDurationRange(input),
    ...checkPriorityRange(input),
    ...checkPlannedAfterDeadline(input),
    ...checkDurationCrossesDeadline(input),
  ];

  return buildResult(issues);
}

// --- Блокирующие: temporal (§2 пп.1–4) --------------------------------------

/** Правило 1. */
function checkPlannedTimeRequiresDate(input: TaskValidationInput): ValidationIssue[] {
  if (input.plannedTime !== null && input.plannedDate === null) {
    return [makeIssue(1, 'TEMPORAL_CONFLICT', 'blocking', 'plannedTime')];
  }
  return [];
}

/** Правило 2. */
function checkDeadlineTimeRequiresDate(input: TaskValidationInput): ValidationIssue[] {
  if (input.deadlineTime !== null && input.deadlineDate === null) {
    return [makeIssue(2, 'TEMPORAL_CONFLICT', 'blocking', 'deadlineTime')];
  }
  return [];
}

/** Правило 3. */
function checkAvailableFromConflict(input: TaskValidationInput): ValidationIssue[] {
  if (isAvailableFromConflict(input.plannedDate, input.availableFrom)) {
    return [makeIssue(3, 'TEMPORAL_CONFLICT', 'blocking', 'plannedDate')];
  }
  return [];
}

/** Правило 4. */
function checkDeadlineBeforeAvailableFrom(input: TaskValidationInput): ValidationIssue[] {
  if (isDeadlineBeforeAvailableFrom(input.deadlineDate, input.deadlineTime, input.availableFrom)) {
    return [makeIssue(4, 'TEMPORAL_CONFLICT', 'blocking', 'deadlineDate')];
  }
  return [];
}

// --- Блокирующие: иерархия/размещение (§2 пп.5–9) ---------------------------

/** Правило 5. */
function checkSectionRequiresProject(input: TaskValidationInput): ValidationIssue[] {
  if (input.sectionId !== null && input.projectId === null) {
    return [makeIssue(5, 'TASK_SECTION_REQUIRES_PROJECT', 'blocking', 'sectionId')];
  }
  return [];
}

/** Правило 6: прямой child обязан иметь тот же Project/Section, что и Parent. */
function checkHierarchyProjectMatch(
  input: TaskValidationInput,
  context: TaskValidationContext,
): ValidationIssue[] {
  if (input.parentTaskId === null || context.parent === null) {
    return [];
  }
  const issues: ValidationIssue[] = [];
  if (input.projectId !== context.parent.projectId) {
    issues.push(
      makeIssue(6, 'TASK_HIERARCHY_PROJECT_MISMATCH', 'blocking', 'projectId', {
        parentProjectId: context.parent.projectId,
      }),
    );
  }
  if (input.sectionId !== context.parent.sectionId) {
    issues.push(
      makeIssue(6, 'TASK_HIERARCHY_PROJECT_MISMATCH', 'blocking', 'sectionId', {
        parentSectionId: context.parent.sectionId,
      }),
    );
  }
  return issues;
}

/** Правило 7: нет цикла в `parent_task_id`; user-created глубина ≤1. */
function checkHierarchyDepthAndCycle(
  input: TaskValidationInput,
  context: TaskValidationContext,
): ValidationIssue[] {
  if (input.parentTaskId === null) {
    return [];
  }
  const issues: ValidationIssue[] = [];
  if (context.id !== null && input.parentTaskId === context.id) {
    issues.push(makeIssue(7, 'TASK_HIERARCHY_CYCLE', 'blocking', 'parentTaskId'));
  }
  if (context.parent !== null && context.parent.parentTaskId !== null) {
    issues.push(makeIssue(7, 'TASK_HIERARCHY_DEPTH_EXCEEDED', 'blocking', 'parentTaskId'));
  }
  return issues;
}

/** Правило 8: recurring обязана быть top-level; попытка переместить
 * повторяющуюся задачу под другую блокируется тем же условием — родитель и
 * серия исключают друг друга независимо от того, "новая" это задача или
 * перенос существующей повторяющейся. */
function checkRecurringMustBeTopLevel(input: TaskValidationInput): ValidationIssue[] {
  if (input.parentTaskId !== null && input.seriesId !== null) {
    return [
      makeIssue(8, 'TASK_RECURRING_MUST_BE_TOP_LEVEL', 'blocking', 'parentTaskId', {
        seriesId: input.seriesId,
      }),
    ];
  }
  return [];
}

/** Правило 9. */
function checkChildMustBeProcessed(input: TaskValidationInput): ValidationIssue[] {
  if (input.parentTaskId !== null && input.captureState !== 'processed') {
    return [makeIssue(9, 'TASK_CHILD_MUST_BE_PROCESSED', 'blocking', 'captureState')];
  }
  return [];
}

// --- Блокирующие: планирование/завершение (§2 пп.10–13) ---------------------

/** Правило 10: `focus_date` — null либо строго равен `planned_date`. */
function checkFocusDate(input: TaskValidationInput): ValidationIssue[] {
  if (input.focusDate === null) {
    return [];
  }
  if (input.plannedDate === null || !input.focusDate.equals(input.plannedDate)) {
    return [makeIssue(10, 'TASK_FOCUS_DATE_MISMATCH', 'blocking', 'focusDate')];
  }
  return [];
}

/** Правило 11. */
function checkDayBucketLater(input: TaskValidationInput): ValidationIssue[] {
  if (input.dayBucket === 'later' && input.plannedDate === null) {
    return [makeIssue(11, 'TASK_DAY_BUCKET_REQUIRES_PLANNED_DATE', 'blocking', 'dayBucket')];
  }
  return [];
}

/** Правило 12: `status=completed` согласован с `completed_at` (оба заданы
 * либо оба не заданы). */
function checkCompletionConsistency(input: TaskValidationInput): ValidationIssue[] {
  const completedAtSet = input.completedAt !== null;
  const isCompleted = input.status === 'completed';
  if (isCompleted !== completedAtSet) {
    return [makeIssue(12, 'TASK_COMPLETION_INCONSISTENT', 'blocking', 'completedAt')];
  }
  return [];
}

/** Правило 13: у active `completion_kind=null`; у completed — `done`
 * (обычное завершение) либо `skipped` (пропуск повтора). Какая из двух —
 * решается значением самого поля (единственный сигнал, доступный флоской
 * задаче), не выводится валидатором заново. */
function checkCompletionKindConsistency(input: TaskValidationInput): ValidationIssue[] {
  if (input.status === 'active' && input.completionKind !== null) {
    return [makeIssue(13, 'TASK_COMPLETION_KIND_INCONSISTENT', 'blocking', 'completionKind')];
  }
  if (input.status === 'completed' && input.completionKind === null) {
    return [makeIssue(13, 'TASK_COMPLETION_KIND_INCONSISTENT', 'blocking', 'completionKind')];
  }
  return [];
}

// --- Блокирующие: содержимое и лимиты (§2 пп.14–21, 25, 26) -----------------

/** Правило 14: длина 1..500 после нормализации + читаемость (решение `?10`). */
function checkTitle(input: TaskValidationInput): ValidationIssue[] {
  const normalized = normalizeTitleWhitespace(input.title);
  const length = unicodeLength(normalized);
  if (length < 1 || length > TITLE_MAX_LENGTH) {
    return [makeIssue(14, 'TASK_TITLE_LENGTH_INVALID', 'blocking', 'title', { length })];
  }
  if (!hasReadableContent(normalized)) {
    return [makeIssue(14, 'TASK_TITLE_NOT_READABLE', 'blocking', 'title')];
  }
  return [];
}

/** Правило 15. */
function checkDescription(input: TaskValidationInput): ValidationIssue[] {
  const length = unicodeLength(input.description);
  if (length > DESCRIPTION_MAX_LENGTH) {
    return [makeIssue(15, 'TASK_DESCRIPTION_TOO_LONG', 'blocking', 'description', { length })];
  }
  return [];
}

/** Правило 16: лимит считается на родителе — задача без родителя не может
 * его нарушить. */
function checkSubtaskLimit(context: TaskValidationContext): ValidationIssue[] {
  if (context.parent === null) {
    return [];
  }
  if (context.parent.directSubtaskCount >= MAX_SUBTASKS) {
    return [
      makeIssue(16, 'TASK_SUBTASK_LIMIT_EXCEEDED', 'blocking', 'parentTaskId', {
        limit: MAX_SUBTASKS,
        current: context.parent.directSubtaskCount,
      }),
    ];
  }
  return [];
}

/** Правило 17. */
function checkChecklistLimit(context: TaskValidationContext): ValidationIssue[] {
  if (context.checklistItemCount > MAX_CHECKLIST_ITEMS) {
    return [
      makeIssue(17, 'TASK_CHECKLIST_LIMIT_EXCEEDED', 'blocking', 'checklistItems', {
        limit: MAX_CHECKLIST_ITEMS,
        current: context.checklistItemCount,
      }),
    ];
  }
  return [];
}

/** Правило 18. */
function checkLabelLimit(context: TaskValidationContext): ValidationIssue[] {
  if (context.labelCount > MAX_LABELS) {
    return [
      makeIssue(18, 'TASK_LABEL_LIMIT_EXCEEDED', 'blocking', 'labels', {
        limit: MAX_LABELS,
        current: context.labelCount,
      }),
    ];
  }
  return [];
}

/** Правило 19. */
function checkReminderLimit(context: TaskValidationContext): ValidationIssue[] {
  if (context.explicitReminderCount > MAX_EXPLICIT_REMINDERS) {
    return [
      makeIssue(19, 'TASK_REMINDER_LIMIT_EXCEEDED', 'blocking', 'reminders', {
        limit: MAX_EXPLICIT_REMINDERS,
        current: context.explicitReminderCount,
      }),
    ];
  }
  return [];
}

/** Правило 20. */
function checkLinkLimit(context: TaskValidationContext): ValidationIssue[] {
  if (context.linkCount > MAX_LINKS) {
    return [
      makeIssue(20, 'TASK_LINK_LIMIT_EXCEEDED', 'blocking', 'links', {
        limit: MAX_LINKS,
        current: context.linkCount,
      }),
    ];
  }
  return [];
}

/** Правило 21 — единственный лимит из этого блока с готовым кодом в `03§19`. */
function checkAttachmentLimit(context: TaskValidationContext): ValidationIssue[] {
  if (context.attachmentCount > MAX_ATTACHMENTS) {
    return [
      makeIssue(21, 'ATTACHMENT_QUOTA_EXCEEDED', 'blocking', 'attachments', {
        limit: MAX_ATTACHMENTS,
        current: context.attachmentCount,
      }),
    ];
  }
  return [];
}

/** Правило 25. */
function checkDurationRange(input: TaskValidationInput): ValidationIssue[] {
  if (input.durationMin === null) {
    return [];
  }
  if (
    !Number.isInteger(input.durationMin) ||
    input.durationMin < DURATION_MIN_MINUTES ||
    input.durationMin > DURATION_MAX_MINUTES
  ) {
    return [
      makeIssue(25, 'TASK_DURATION_OUT_OF_RANGE', 'blocking', 'durationMin', {
        value: input.durationMin,
      }),
    ];
  }
  return [];
}

/** Правило 26. */
function checkPriorityRange(input: TaskValidationInput): ValidationIssue[] {
  if (
    !Number.isInteger(input.priority) ||
    input.priority < PRIORITY_MIN ||
    input.priority > PRIORITY_MAX
  ) {
    return [
      makeIssue(26, 'TASK_PRIORITY_OUT_OF_RANGE', 'blocking', 'priority', {
        value: input.priority,
      }),
    ];
  }
  return [];
}

// --- Предупреждающие (§2 пп.32, 33) -----------------------------------------

/** Правило 32. */
function checkPlannedAfterDeadline(input: TaskValidationInput): ValidationIssue[] {
  if (
    isPlannedAfterDeadline(
      input.plannedDate,
      input.plannedTime,
      input.deadlineDate,
      input.deadlineTime,
    )
  ) {
    return [makeIssue(32, 'TEMPORAL_CONFLICT', 'warning', 'plannedDate')];
  }
  return [];
}

/** Правило 33 — валидный `durationMin` собирается в branded-тип только для
 * вызова предиката; вне диапазона число уже отдельно поймано правилом 25 и
 * здесь не участвует в temporal-сравнении (нечего скрещивать с дедлайном). */
function checkDurationCrossesDeadline(input: TaskValidationInput): ValidationIssue[] {
  if (
    input.durationMin === null ||
    !Number.isInteger(input.durationMin) ||
    input.durationMin < DURATION_MIN_MINUTES ||
    input.durationMin > DURATION_MAX_MINUTES
  ) {
    return [];
  }
  const duration = makeDurationMinutes(input.durationMin);
  if (
    doesDurationCrossDeadline(
      input.plannedDate,
      input.plannedTime,
      duration,
      input.deadlineDate,
      input.deadlineTime,
    )
  ) {
    return [makeIssue(33, 'TEMPORAL_CONFLICT', 'warning', 'durationMin')];
  }
  return [];
}
