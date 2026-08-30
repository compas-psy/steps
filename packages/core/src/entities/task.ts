import type { Temporal } from '@js-temporal/polyfill';

import type { DurationMinutes, FieldClocks, OwnerScope, Priority, Rank, Uuid } from '../values.js';

/**
 * `tasks` (`02§2`, конспект §1) — центральная сущность домена.
 *
 * Собрана как пересечение узких срезов, часть которых — размеченные
 * объединения (discriminated unions). Так часть блокирующих инвариантов
 * `00§7.1`/конспект §2 становится невозможной уже на уровне типов, а не
 * только проверкой валидатора (который для этого пакета работ не пишется —
 * см. `packages/core/src/entities/README` в комментарии `index.ts`):
 *
 *  - п.1 `planned_time` требует `planned_date`            → {@link TaskPlanning}
 *  - п.2 `deadline_time` требует `deadline_date`           → {@link TaskDeadline}
 *  - п.5 `section_id` требует `project_id`                 → {@link TaskProjectPlacement}
 *  - п.8 recurring обязана быть top-level                  → {@link TaskHierarchy}
 *  - п.9 дочерняя задача обязана быть `processed`           → {@link TaskHierarchy}
 *  - п.10 `focus_date` — null либо требует `planned_date`  → {@link TaskPlanning}
 *         (собственно равенство `focus_date === planned_date` — это уже
 *         сравнение двух независимых значений, типами оно не выражается;
 *         эту половину инварианта проверяет будущий валидатор)
 *  - п.11 `day_bucket=later` требует `planned_date`        → {@link TaskPlanning}
 *  - п.12 `status=completed` согласован с `completed_at`   → {@link TaskCompletion}
 *  - п.13 `completion_kind` согласован со `status`         → {@link TaskCompletion}
 *
 * Инварианты, которые типы принципиально не могут выразить (кросс-строчные:
 * циклы `parent_task_id`, совпадение Project/Section с родителем, лимиты
 * count(*), ownership) остаются за будущим общим валидатором (`00§7.1`,
 * конспект §2, `02§11.1`) — он не входит в этот пакет работ.
 */

export type CaptureState = 'inbox' | 'processed';
export type DayBucket = 'default' | 'later';
export type CompletionKind = 'done' | 'skipped';
export type TaskStatus = 'active' | 'completed';
export type TaskSource = 'user' | 'import' | 'recurrence' | 'vector' | 'future';
/** Решение `?7` открытых вопросов: R3-поля материализуются уже в волне 1. */
export type SourceChannel = 'text' | 'voice' | 'file' | 'image' | 'share';

/**
 * Место в дереве Project/Section/Parent (§2 пп.5, 6).
 *
 * `section_id` без `project_id` не типизируется. Совпадение Project/Section
 * с прямым родителем (п.6) — кросс-строчная проверка, валидатору.
 */
export type TaskProjectPlacement =
  | { readonly projectId: null; readonly sectionId: null }
  | { readonly projectId: Uuid; readonly sectionId: Uuid | null };

/**
 * Иерархия и recurrence-принадлежность (§2 пп.8, 9).
 *
 * Recurring-серия (`seriesId`/`occurrenceSeq`/`generatedFromOccurrenceId`)
 * возможна только у top-level задачи (`parentTaskId=null`) — п.8. Любая
 * дочерняя задача обязана быть `processed` — п.9 (Inbox только top-level,
 * `00§7.1`). Отсутствие циклов и глубина ≤1 для user-created — кросс-строчная
 * проверка, валидатору.
 */
export type TaskHierarchy =
  | {
      readonly parentTaskId: null;
      readonly captureState: CaptureState;
      readonly seriesId: Uuid | null;
      readonly occurrenceSeq: bigint | null;
      readonly generatedFromOccurrenceId: Uuid | null;
    }
  | {
      readonly parentTaskId: Uuid;
      readonly captureState: 'processed';
      readonly seriesId: null;
      readonly occurrenceSeq: null;
      readonly generatedFromOccurrenceId: null;
    };

/**
 * Мягкое планирование: Available From / Planned Date+Time / Duration /
 * Focus / day_bucket (конспект §3, `01§5`, `01§6`).
 *
 * Пока `plannedDate` пуст — `plannedTime`, `focusDate` обязаны быть `null`,
 * а `dayBucket` обязан быть `'default'` (пп.1, 10 (частично), 11). Само
 * равенство `focusDate === plannedDate`, когда оба заданы, — забота
 * валидатора (два независимых значения одного типа, не выразить типами).
 * `availableFrom` и `durationMin` независимы от наличия `plannedDate` (§2,
 * явно валидные комбинации №35, №37).
 */
export type TaskPlanning =
  | {
      readonly availableFrom: Temporal.PlainDate | null;
      readonly plannedDate: null;
      readonly plannedTime: null;
      readonly durationMin: DurationMinutes | null;
      readonly focusDate: null;
      readonly dayBucket: 'default';
    }
  | {
      readonly availableFrom: Temporal.PlainDate | null;
      readonly plannedDate: Temporal.PlainDate;
      readonly plannedTime: Temporal.PlainTime | null;
      readonly durationMin: DurationMinutes | null;
      readonly focusDate: Temporal.PlainDate | null;
      readonly dayBucket: DayBucket;
    };

/**
 * Жёсткий срок (§2 п.2). `deadlineTime=null` означает date-only дедлайн —
 * интерпретируется как конец локальных суток при классификации
 * (конспект §3, не блокирующее правило, см. `temporal/deadline.ts`).
 */
export type TaskDeadline =
  | { readonly deadlineDate: null; readonly deadlineTime: null }
  | { readonly deadlineDate: Temporal.PlainDate; readonly deadlineTime: Temporal.PlainTime | null };

/**
 * Завершённость (§2 пп.12, 13). У активной задачи `completionKind` всегда
 * `null`; у завершённой — `'done'` (обычное завершение) или `'skipped'`
 * (пропуск повтора, `01§11.5`).
 */
export type TaskCompletion =
  | { readonly status: 'active'; readonly completedAt: null; readonly completionKind: null }
  | {
      readonly status: 'completed';
      readonly completedAt: Temporal.Instant;
      readonly completionKind: CompletionKind;
    };

/** Происхождение задачи (`01§4`, решение `?7` — R3-поля материализованы уже в R1). */
export interface TaskProvenance {
  readonly source: TaskSource;
  readonly sourceChannel: SourceChannel | null;
  readonly sourceCaptureBatchId: Uuid | null;
  readonly sourceIntentId: Uuid | null;
}

/** Снимок имени проекта/секции для истории после их удаления. */
export interface TaskSnapshot {
  readonly originalProjectNameSnapshot: string | null;
  readonly originalSectionNameSnapshot: string | null;
}

/** Идентичность и контент, не участвующие в temporal-инвариантах. */
export interface TaskCore {
  readonly id: Uuid;
  readonly ownerScope: OwnerScope;
  /** 1..500 Unicode-символов после trim; нормализация CR/LF/TAB — забота
   * будущего валидатора (§2 п.14), здесь — произвольная строка. */
  readonly title: string;
  /** 0..100 000 символов (§2 п.15) — граница длины тоже у валидатора. */
  readonly description: string;
  readonly priority: Priority;
  readonly rank: Rank;
}

/** Системные метки: аудит, tombstone, sync-ревизия (`02§1`, `02§6`). */
export interface TaskAudit {
  readonly createdAt: Temporal.Instant;
  readonly updatedAt: Temporal.Instant;
  /** Tombstone — не user-visible статус (`02§1`). */
  readonly deletedAt: Temporal.Instant | null;
  readonly revision: bigint;
  readonly clocks: FieldClocks;
}

export type Task = TaskCore &
  TaskHierarchy &
  TaskProjectPlacement &
  TaskPlanning &
  TaskDeadline &
  TaskCompletion &
  TaskProvenance &
  TaskSnapshot &
  TaskAudit;
