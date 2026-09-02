/**
 * Значения плана импорта Todoist — то, что показывает Import Preview (M47)
 * и применяет Import Result (M48).
 *
 * План намеренно СЕРИАЛИЗУЕМЫЙ: даты в нём — строки `YYYY-MM-DD`/`HH:MM`, а
 * не `Temporal`. Причина не в лени, а в назначении: план переживает показ
 * пользователю и подтверждение, его удобно сравнить в тесте построчно и
 * приложить к отчёту об импорте. Превращение в доменные значения — работа
 * шага применения, у которого есть `@shagi/core` и часы.
 */
import type { RecurrenceRuleTemplate } from '@shagi/core';

/**
 * Коды предупреждений. Именно коды, а не текст: `@shagi/importer` — не
 * UI-слой, продуктовые строки живут в `@shagi/i18n` (CLAUDE.md).
 */
export type ImportWarningCode =
  /** `INDENT>=3` сплющен до прямой подзадачи ближайшего верхнего предка. */
  | 'deep_indent_flattened'
  /** Повторяющаяся подзадача Todoist повышена до верхнего уровня. */
  | 'recurring_subtask_promoted'
  /** Значение колонки DATE не разобрано — задача импортируется без даты. */
  | 'date_not_recognized'
  /** Правило повтора не представимо в R1 — задача импортируется без повтора. */
  | 'recurrence_not_representable'
  /** Комментарии не поместились в описание и вынесены во вложение. */
  | 'comments_overflow_attachment'
  /** `IS_COLLAPSED` — косметика без эквивалента в R1. */
  | 'collapsed_ignored'
  /** TIMEZONE записан в отчёт, значения дат сохранены как есть. */
  | 'timezone_recorded'
  /** AUTHOR/RESPONSIBLE сохранены в описании. */
  | 'people_preserved'
  /** Встречены неизвестные колонки — разбор продолжен. */
  | 'unknown_columns';

export interface ImportWarning {
  readonly code: ImportWarningCode;
  /** Ссылка на задачу плана (`PlannedTask.ref`), если предупреждение о ней. */
  readonly taskRef: number | null;
  /** Подробности для подстановки в текст: исходное значение, путь и т.п. */
  readonly detail: Readonly<Record<string, string | number>>;
}

/** Вложение, рождённое импортом (сегодня — только «Комментарии Todoist.txt»). */
export interface PlannedAttachment {
  readonly taskRef: number;
  readonly fileName: string;
  readonly text: string;
}

export interface PlannedTask {
  /** Порядковый номер в плане; на него ссылаются `parentRef` и предупреждения. */
  readonly ref: number;
  readonly parentRef: number | null;
  readonly title: string;
  readonly description: string;
  /** Приоритет ШАГОВ (1 — критично, 4 — низкая), уже перевёрнутый из Todoist. */
  readonly priority: 1 | 2 | 3 | 4;
  readonly sectionName: string | null;
  readonly plannedDate: string | null;
  readonly plannedTime: string | null;
  readonly deadlineDate: string | null;
  readonly durationMin: number | null;
  readonly labels: readonly string[];
  readonly recurrence: RecurrenceRuleTemplate | null;
}

export interface TodoistProjectPlan {
  readonly projectTitle: string;
  readonly defaultView: 'list' | 'board';
  readonly sectionNames: readonly string[];
  readonly tasks: readonly PlannedTask[];
  readonly attachments: readonly PlannedAttachment[];
  readonly warnings: readonly ImportWarning[];
}

/** План целиком: один CSV — один проект, backup ZIP — несколько. */
export interface TodoistImportPlan {
  readonly projects: readonly TodoistProjectPlan[];
  readonly warnings: readonly ImportWarning[];
  readonly totals: {
    readonly projects: number;
    readonly sections: number;
    readonly tasks: number;
    readonly labels: number;
    readonly attachments: number;
  };
}

/** Почему файл вообще не годится к импорту. Отдельно от предупреждений:
 * предупреждение — «импортировали, но с оговоркой», отказ — «импортировать
 * нечего». */
export type ImportRejectionCode =
  /** Ни одной строки — пустой файл. */
  | 'empty_file'
  /** Нет обязательных колонок Todoist — это не тот файл. */
  | 'not_todoist_csv'
  /** Ни одной задачи после разбора. */
  | 'no_tasks';

export interface ImportRejection {
  readonly code: ImportRejectionCode;
  readonly detail: Readonly<Record<string, string | number>>;
}

export type TodoistParseResult =
  | { readonly status: 'ok'; readonly plan: TodoistImportPlan }
  | { readonly status: 'rejected'; readonly rejection: ImportRejection };
