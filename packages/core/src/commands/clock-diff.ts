import type { Task } from '../entities/task.js';
import type { Hlc } from '../hlc.js';
import type { FieldClocks } from '../values.js';

/**
 * Per-field HLC (`00§6`, `02§8` "Скаляр: per-field LWW по HLC") нужен только
 * на полях, которые реально изменились этим вызовом команды — не на всех
 * полях `Task` разом. Решение пакета работ E01.4: вместо того, чтобы каждая
 * команда вручную перечисляла "какие поля я меняю" (легко разойтись с тем,
 * что она реально положила в итоговую сущность — например, `setPlannedDate`
 * из `field-resets.ts` попутно обнуляет `focusDate`, о чём вызывающий код
 * мог не подумать явно), диффинг делается **по факту**: сравнивается
 * предыдущее состояние задачи (или `null` при создании) с итоговым — любое
 * расхождение получает свежий тик HLC. Так побочные эффекты правил сброса
 * автоматически попадают под собственный HLC без отдельной бухгалтерии.
 */
const MUTABLE_TASK_FIELDS = [
  'title',
  'description',
  'priority',
  'rank',
  'projectId',
  'sectionId',
  'parentTaskId',
  'captureState',
  'availableFrom',
  'plannedDate',
  'plannedTime',
  'durationMin',
  'focusDate',
  'dayBucket',
  'deadlineDate',
  'deadlineTime',
  'status',
  'completedAt',
  'completionKind',
  'deletedAt',
] as const;

export type MutableTaskField = (typeof MUTABLE_TASK_FIELDS)[number];

/** Значения полей `Task` — примитивы/`bigint` (сравнение `===`) и
 * `Temporal`-значения, у которых есть собственный `.equals` (`Temporal`
 * не определяет `===` по значению, только по ссылке). `null` — отдельно,
 * иначе `null.equals` упал бы. */
function fieldValuesEqual(a: unknown, b: unknown): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (
    typeof a === 'object' &&
    typeof (a as { equals?: unknown }).equals === 'function' &&
    typeof b === 'object'
  ) {
    return (a as { equals: (other: unknown) => boolean }).equals(b);
  }
  return a === b;
}

/**
 * Список изменившихся полей. `prev === null` — создание: считается, что
 * изменились все поля из `MUTABLE_TASK_FIELDS` (у только что созданной
 * задачи ещё не было предыдущего значения ни у одного поля).
 */
export function diffChangedFields(prev: Task | null, next: Task): readonly MutableTaskField[] {
  if (prev === null) {
    return MUTABLE_TASK_FIELDS;
  }
  return MUTABLE_TASK_FIELDS.filter((field) => !fieldValuesEqual(prev[field], next[field]));
}

/** Проставляет один и тот же тик HLC (одна локальная команда — один
 * логический момент записи, см. комментарий `hlc.ts`: протокол назначения
 * при *записи* — забота этого пакета, merge поверх значения — уже
 * `@shagi/sync`) всем изменившимся полям, оставляя остальные клоки как есть. */
export function tickClocks(
  existing: FieldClocks,
  changedFields: readonly MutableTaskField[],
  hlc: Hlc,
): FieldClocks {
  if (changedFields.length === 0) {
    return existing;
  }
  const next: Record<string, Hlc | undefined> = { ...existing };
  for (const field of changedFields) {
    next[field] = hlc;
  }
  return next;
}

/** Клоки только изменившихся полей — то, что реально уходит в
 * `sync_outbox.field_clocks_json` (не весь `Task.clocks`, только патч). */
export function pickClocks(clocks: FieldClocks, fields: readonly MutableTaskField[]): FieldClocks {
  const picked: Record<string, Hlc> = {};
  for (const field of fields) {
    const value = clocks[field];
    if (value !== undefined) {
      picked[field] = value;
    }
  }
  return picked;
}

/** Значения только изменившихся полей — `sync_outbox.patch_json` (`02§7`).
 * Сериализация в JSON-совместимый формат (Temporal-значения → строки ISO)
 * — забота транспортного слоя (`@shagi/sync`), не этого пакета: тип поля
 * `patchJson` — `Record<string, unknown>`, ему достаточно нести значения
 * как есть. */
export function buildPatchJson(
  task: Task,
  fields: readonly MutableTaskField[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of fields) {
    patch[field] = task[field];
  }
  return patch;
}
