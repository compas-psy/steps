import type { Temporal } from '@js-temporal/polyfill';

import type {
  CaptureState,
  CompletionKind,
  DayBucket,
  Task,
  TaskCompletion,
  TaskDeadline,
  TaskHierarchy,
  TaskPlanning,
  TaskProjectPlacement,
  TaskStatus,
} from '../entities/task.js';
import type { TaskValidationInput } from '../validation/task.js';
import type { DurationMinutes, Uuid } from '../values.js';

/**
 * Сборка проверенных валидатором плоских данных в узкие срезы `Task`
 * (`TaskHierarchy`/`TaskProjectPlacement`/`TaskPlanning`/`TaskDeadline`/
 * `TaskCompletion` — размеченные объединения из `entities/task.ts`) —
 * общий код `create`/`update`/`complete`. Ветвление здесь дословно то же
 * самое, что уже проверил `validateTask` (правила 1, 2, 5, 9–13) — эти
 * функции не проверяют инварианты заново, а лишь **констатируют**, какая
 * ветвь union'а верна, опираясь на то, что вызывающая команда уже вызвала
 * `validateDomainMutation` и получила `valid: true` до сборки. `throw`
 * внутри — не пользовательская ошибка, а защитный инвариант ("это не должно
 * быть достижимо, раз валидатор пропустил"), не часть контракта команд.
 */

export interface FlatHierarchy {
  readonly parentTaskId: Uuid | null;
  readonly captureState: CaptureState;
  readonly seriesId: Uuid | null;
  /** `bigint`, не branded `OccurrenceSeq` — `TaskHierarchy` (`entities/task.ts`)
   * хранит его как обычный `bigint`, брендирование — только у смарт-
   * конструктора `makeOccurrenceSeq` в `values.ts`, применимо на границе,
   * где occurrence реально порождается (эпик E11, вне этого пакета работ). */
  readonly occurrenceSeq: bigint | null;
  readonly generatedFromOccurrenceId: Uuid | null;
}

export function buildHierarchy(flat: FlatHierarchy): TaskHierarchy {
  if (flat.parentTaskId === null) {
    return {
      parentTaskId: null,
      captureState: flat.captureState,
      seriesId: flat.seriesId,
      occurrenceSeq: flat.occurrenceSeq,
      generatedFromOccurrenceId: flat.generatedFromOccurrenceId,
    };
  }
  if (flat.captureState !== 'processed') {
    throw new Error(
      'buildHierarchy: parentTaskId задан, а captureState не "processed" — ' +
        'validateTask (правило 9) обязан был отклонить это раньше сборки сущности.',
    );
  }
  return {
    parentTaskId: flat.parentTaskId,
    captureState: flat.captureState,
    seriesId: null,
    occurrenceSeq: null,
    generatedFromOccurrenceId: null,
  };
}

export interface FlatProjectPlacement {
  readonly projectId: Uuid | null;
  readonly sectionId: Uuid | null;
}

export function buildProjectPlacement(flat: FlatProjectPlacement): TaskProjectPlacement {
  if (flat.projectId === null) {
    if (flat.sectionId !== null) {
      throw new Error(
        'buildProjectPlacement: sectionId без projectId — validateTask (правило 5) ' +
          'обязан был отклонить это раньше сборки сущности.',
      );
    }
    return { projectId: null, sectionId: null };
  }
  return { projectId: flat.projectId, sectionId: flat.sectionId };
}

export interface FlatPlanning {
  readonly availableFrom: Temporal.PlainDate | null;
  readonly plannedDate: Temporal.PlainDate | null;
  readonly plannedTime: Temporal.PlainTime | null;
  readonly durationMin: DurationMinutes | null;
  readonly focusDate: Temporal.PlainDate | null;
  readonly dayBucket: DayBucket;
}

export function buildPlanning(flat: FlatPlanning): TaskPlanning {
  if (flat.plannedDate === null) {
    if (flat.plannedTime !== null || flat.focusDate !== null || flat.dayBucket !== 'default') {
      throw new Error(
        'buildPlanning: plannedDate пуст, но plannedTime/focusDate/dayBucket заданы — ' +
          'validateTask (правила 1, 10, 11) обязан был отклонить это раньше сборки сущности.',
      );
    }
    return {
      availableFrom: flat.availableFrom,
      plannedDate: null,
      plannedTime: null,
      durationMin: flat.durationMin,
      focusDate: null,
      dayBucket: 'default',
    };
  }
  return {
    availableFrom: flat.availableFrom,
    plannedDate: flat.plannedDate,
    plannedTime: flat.plannedTime,
    durationMin: flat.durationMin,
    focusDate: flat.focusDate,
    dayBucket: flat.dayBucket,
  };
}

export interface FlatDeadline {
  readonly deadlineDate: Temporal.PlainDate | null;
  readonly deadlineTime: Temporal.PlainTime | null;
}

export function buildDeadline(flat: FlatDeadline): TaskDeadline {
  if (flat.deadlineDate === null) {
    if (flat.deadlineTime !== null) {
      throw new Error(
        'buildDeadline: deadlineDate пуст, а deadlineTime задан — validateTask (правило 2) ' +
          'обязан был отклонить это раньше сборки сущности.',
      );
    }
    return { deadlineDate: null, deadlineTime: null };
  }
  return { deadlineDate: flat.deadlineDate, deadlineTime: flat.deadlineTime };
}

export interface FlatCompletion {
  readonly status: TaskStatus;
  readonly completedAt: Temporal.Instant | null;
  readonly completionKind: CompletionKind | null;
}

export function buildCompletion(flat: FlatCompletion): TaskCompletion {
  if (flat.status === 'active') {
    if (flat.completedAt !== null || flat.completionKind !== null) {
      throw new Error(
        'buildCompletion: status="active", но completedAt/completionKind заданы — ' +
          'validateTask (правила 12, 13) обязан был отклонить это раньше сборки сущности.',
      );
    }
    return { status: 'active', completedAt: null, completionKind: null };
  }
  if (flat.completedAt === null || flat.completionKind === null) {
    throw new Error(
      'buildCompletion: status="completed" без completedAt/completionKind — ' +
        'validateTask (правила 12, 13) обязан был отклонить это раньше сборки сущности.',
    );
  }
  return {
    status: 'completed',
    completedAt: flat.completedAt,
    completionKind: flat.completionKind,
  };
}

/** Срез `TaskPlanning` уже существующей задачи — вход для функций сброса
 * `rules/field-resets.ts` (`setPlannedDate`/`clearPlannedDate`/...), которым
 * нужен именно узкий тип, не плоский. Читается из `Task`, для которой
 * инвариант уже гарантирован конструкцией (задача была создана/обновлена
 * этим же командным слоем), поэтому здесь не throw-проверка, а обычное
 * ветвление по дискриминанту. */
export function extractPlanning(task: Task): TaskPlanning {
  if (task.plannedDate === null) {
    return {
      availableFrom: task.availableFrom,
      plannedDate: null,
      plannedTime: null,
      durationMin: task.durationMin,
      focusDate: null,
      dayBucket: 'default',
    };
  }
  return {
    availableFrom: task.availableFrom,
    plannedDate: task.plannedDate,
    plannedTime: task.plannedTime,
    durationMin: task.durationMin,
    focusDate: task.focusDate,
    dayBucket: task.dayBucket,
  };
}

/** Срез `TaskDeadline` уже существующей задачи — вход для `clearDeadline`. */
export function extractDeadline(task: Task): TaskDeadline {
  if (task.deadlineDate === null) {
    return { deadlineDate: null, deadlineTime: null };
  }
  return { deadlineDate: task.deadlineDate, deadlineTime: task.deadlineTime };
}

/** Плоское представление задачи для `validateTask` (`TaskValidationInput`) —
 * общий код для `complete`/`delete`, которым нужно провалидировать текущее
 * состояние задачи без изменения temporal-полей. */
export function flattenTask(task: Task): TaskValidationInput {
  return {
    title: task.title,
    description: task.description,
    projectId: task.projectId,
    sectionId: task.sectionId,
    parentTaskId: task.parentTaskId,
    captureState: task.captureState,
    seriesId: task.seriesId,
    availableFrom: task.availableFrom,
    plannedDate: task.plannedDate,
    plannedTime: task.plannedTime,
    durationMin: task.durationMin,
    focusDate: task.focusDate,
    dayBucket: task.dayBucket,
    deadlineDate: task.deadlineDate,
    deadlineTime: task.deadlineTime,
    status: task.status,
    completedAt: task.completedAt,
    completionKind: task.completionKind,
    priority: task.priority,
  };
}
