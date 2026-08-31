import type { Hlc } from '../hlc.js';
import type { FieldClocks } from '../values.js';

/**
 * Per-field HLC diff/tick — тот же приём, что `clock-diff.ts` (вне
 * территории, замкнут на `Task`), но параметризован по списку полей вместо
 * фиксированного списка `MUTABLE_TASK_FIELDS`: у Project и Section разные
 * наборы изменяемых полей (ни то, ни другое не Task), а сама логика диффа
 * "по факту, не по декларации намерения" одинакова для всех трёх сущностей
 * — дублировать её текстом под разными именами полей было бы ровно тем
 * дублированием, которого CLAUDE.md просит избегать без причины. Общий
 * файл лежит под именем `project-*.ts` (единственный префикс, доступный
 * файлам этого пакета работ), Section-команды импортируют его напрямую.
 */
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
 * Список изменившихся полей среди `fields`. `prev === null` — создание:
 * считается, что изменились все перечисленные поля.
 *
 * Два независимых generic-параметра (`T` — сущность, `F` — буквальный
 * union полей), не один `Extract<keyof T, string>`, — намеренно:
 * `PROJECT_MUTABLE_FIELDS`/`SECTION_MUTABLE_FIELDS` (`project-port.ts`/
 * `section-port.ts`) — собственные узкие `as const`-литералы (подмножество
 * ключей, без `id`/`createdAt`/`clocks`), а `next: T` в сигнатуре ниже
 * заставил бы TypeScript вывести `T` как *весь* `Project`/`Section` и
 * потребовать `fields: (keyof Project)[]` целиком, если бы тип `fields`
 * был жёстко привязан к `keyof T` — несовместимо с уже узким типом
 * константы. Раздельные параметры снимают эту links. Обращение к полю
 * внутри — через явное приведение к `Record<string, unknown>`: `Project`/
 * `Section` (`entities/*.ts`) не несут индексной сигнатуры (а трогать эти
 * файлы эта команда не может — вне территории), приведение безопасно,
 * потому что `field` всегда один из буквальных ключей `T`.
 */
export function diffChangedFields<T extends object, F extends Extract<keyof T, string>>(
  prev: T | null,
  next: T,
  fields: readonly F[],
): readonly F[] {
  if (prev === null) {
    return fields;
  }
  const prevRecord = prev as unknown as Record<string, unknown>;
  const nextRecord = next as unknown as Record<string, unknown>;
  return fields.filter((field) => !fieldValuesEqual(prevRecord[field], nextRecord[field]));
}

export function tickClocks(
  existing: FieldClocks,
  changedFields: readonly string[],
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

export function pickClocks(clocks: FieldClocks, fields: readonly string[]): FieldClocks {
  const picked: Record<string, Hlc> = {};
  for (const field of fields) {
    const value = clocks[field];
    if (value !== undefined) {
      picked[field] = value;
    }
  }
  return picked;
}

export function buildPatchJson<T extends object, F extends Extract<keyof T, string>>(
  entity: T,
  fields: readonly F[],
): Record<string, unknown> {
  const record = entity as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const field of fields) {
    patch[field] = record[field];
  }
  return patch;
}
