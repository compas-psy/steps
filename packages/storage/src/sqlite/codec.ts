import { Temporal } from '@js-temporal/polyfill';
import { asUuid, type FieldClocks, type Hlc, type Uuid } from '@shagi/core';

import type { SqliteParam } from './driver-port.js';

/**
 * Перевод скалярных значений домена в параметры `SqliteDriverPort` и обратно
 * (задание пакета работ E02.2, п.3). Один модуль на весь адаптер — чтобы
 * правило "как именно хранится `Instant`/`PlainDate`/..." было в одном
 * месте, а не изобреталось заново в каждом мапере таблицы (`./mappers.ts`).
 *
 * `Temporal.Instant` хранится как `INTEGER` (epoch-наносекунды, `bigint`) —
 * не `TEXT`: `sqlite`-родное числовое сравнение `ORDER BY`/`WHERE`
 * автоматически даёт правильный хронологический порядок без зависимости от
 * фиксированной ширины текстового представления, и обратное преобразование
 * (`Temporal.Instant.fromEpochNanoseconds`) точное, без потери точности —
 * в отличие от `epochMilliseconds`.
 *
 * `PlainDate`/`PlainTime` хранятся как `TEXT` в их каноническом ISO-виде
 * (`YYYY-MM-DD`, `HH:MM:SS[.sss]`) — оба формата фиксированной по разрядам
 * структуры (кроме необязательных долей секунды), поэтому лексикографический
 * порядок `TEXT`-столбца SQLite совпадает с хронологическим (индексы
 * `../schema/indexes.ts` рассчитаны именно на это).
 */

export function instantToSql(value: Temporal.Instant): bigint {
  return value.epochNanoseconds;
}

export function sqlToInstant(value: SqliteParam): Temporal.Instant {
  return Temporal.Instant.fromEpochNanoseconds(requireBigint(value, 'instant'));
}

export function nullableInstantToSql(value: Temporal.Instant | null): bigint | null {
  return value === null ? null : instantToSql(value);
}

export function sqlToNullableInstant(value: SqliteParam): Temporal.Instant | null {
  return value === null ? null : sqlToInstant(value);
}

export function planDateToSql(value: Temporal.PlainDate): string {
  return value.toString();
}

export function sqlToPlainDate(value: SqliteParam): Temporal.PlainDate {
  return Temporal.PlainDate.from(requireString(value, 'plain_date'));
}

export function nullablePlainDateToSql(value: Temporal.PlainDate | null): string | null {
  return value === null ? null : planDateToSql(value);
}

export function sqlToNullablePlainDate(value: SqliteParam): Temporal.PlainDate | null {
  return value === null ? null : sqlToPlainDate(value);
}

export function planTimeToSql(value: Temporal.PlainTime): string {
  return value.toString();
}

export function sqlToPlainTime(value: SqliteParam): Temporal.PlainTime {
  return Temporal.PlainTime.from(requireString(value, 'plain_time'));
}

export function nullablePlainTimeToSql(value: Temporal.PlainTime | null): string | null {
  return value === null ? null : planTimeToSql(value);
}

export function sqlToNullablePlainTime(value: SqliteParam): Temporal.PlainTime | null {
  return value === null ? null : sqlToPlainTime(value);
}

export function booleanToSql(value: boolean): bigint {
  return value ? 1n : 0n;
}

export function sqlToBoolean(value: SqliteParam): boolean {
  return requireBigint(value, 'boolean') !== 0n;
}

export function uuidToSql(value: Uuid): string {
  return value;
}

export function sqlToUuid(value: SqliteParam): Uuid {
  return asUuid(requireString(value, 'uuid'));
}

export function nullableUuidToSql(value: Uuid | null): string | null {
  return value;
}

export function sqlToNullableUuid(value: SqliteParam): Uuid | null {
  return value === null ? null : sqlToUuid(value);
}

export function sqlToNumber(value: SqliteParam): number {
  return Number(requireBigint(value, 'integer'));
}

export function sqlToNullableNumber(value: SqliteParam): number | null {
  return value === null ? null : sqlToNumber(value);
}

export function sqlToBigint(value: SqliteParam): bigint {
  return requireBigint(value, 'bigint');
}

export function sqlToNullableBigint(value: SqliteParam): bigint | null {
  return value === null ? null : sqlToBigint(value);
}

export function sqlToString(value: SqliteParam): string {
  return requireString(value, 'text');
}

export function sqlToNullableString(value: SqliteParam): string | null {
  return value === null ? null : sqlToString(value);
}

/**
 * `Hlc` внутри JSON-блоба (`clocks`/`field_clocks_json`, `02§6`) — `bigint`
 * не сериализуется `JSON.stringify` напрямую, поэтому `physical` кодируется
 * как строка epoch-наносекунд, а не число (не терять точность за пределами
 * `Number.MAX_SAFE_INTEGER`).
 */
interface EncodedHlc {
  readonly physical: string;
  readonly logical: number;
  readonly deviceId: string | null;
}

function encodeHlc(hlc: Hlc): EncodedHlc {
  return {
    physical: hlc.physical.epochNanoseconds.toString(),
    logical: hlc.logical,
    deviceId: hlc.deviceId,
  };
}

function decodeHlc(raw: EncodedHlc): Hlc {
  return {
    physical: Temporal.Instant.fromEpochNanoseconds(BigInt(raw.physical)),
    logical: raw.logical,
    deviceId: raw.deviceId === null ? null : asUuid(raw.deviceId),
  };
}

export function fieldClocksToSql(clocks: FieldClocks): string {
  const encoded: Record<string, EncodedHlc> = {};
  for (const [field, hlc] of Object.entries(clocks)) {
    if (hlc === undefined) continue;
    encoded[field] = encodeHlc(hlc);
  }
  return JSON.stringify(encoded);
}

export function sqlToFieldClocks(value: SqliteParam): FieldClocks {
  const raw = JSON.parse(requireString(value, 'json')) as Record<string, EncodedHlc>;
  const result: Record<string, Hlc> = {};
  for (const [field, encoded] of Object.entries(raw)) {
    result[field] = decodeHlc(encoded);
  }
  return result;
}

/**
 * JSON "непрозрачных" полей (`patch_json`, `report_json`, `template_json`,
 * `local_rule_json`, ...) — доменные типы объявляют их как `Record<string,
 * unknown>`/`unknown`, и это НЕ гарантирует отсутствие `bigint` внутри:
 * `SyncOutboxEntry.patchJson` для `recurrence_series` кладёт
 * `nextOccurrenceSeq`/`templateRevision` буквально (`@shagi/core`
 * `commands/create-recurring-task.ts`, `complete-occurrence.ts` и другие —
 * оба поля объявлены `bigint`-брендами, `values.ts`). Голый
 * `JSON.stringify` на таком значении бросает `TypeError: Do not know how
 * to serialize a BigInt` — синхронно, внутри уже открытой транзакции,
 * ROLLBACK, и наверх уходит messageless-friendly ошибка (реальный дефект,
 * найденный Android-смоуком: Quick Add с повтором падал на первой же
 * попытке записать outbox серии).
 *
 * Замена `bigint` на его десятичную строку через replacer `JSON.stringify`
 * — не тот же маркер `{i64: "..."}`, что у `native-bridge.ts`/`sqlite.rs`:
 * там маркер обязан пережить обратное декодирование в `bigint` для
 * IPC-параметров конкретных колонок. Здесь — непрозрачный payload будущей
 * синхронизации (волна 2), который сейчас нигде не декодируется обратно в
 * типизированные поля (`sqlToJson` возвращает `Record<string, unknown>`
 * как есть) — терять бы было нечему, а плоская строка проще и не создаёт
 * второй параллельный формат маркировки целых.
 */
export function jsonToSql(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    typeof nested === 'bigint' ? nested.toString() : nested,
  );
}

export function sqlToJson<T>(value: SqliteParam): T {
  return JSON.parse(requireString(value, 'json')) as T;
}

function requireBigint(value: SqliteParam, what: string): bigint {
  if (typeof value !== 'bigint') {
    throw new TypeError(`sqlite codec: ожидался bigint для ${what}, получено: ${String(value)}`);
  }
  return value;
}

function requireString(value: SqliteParam, what: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`sqlite codec: ожидалась строка для ${what}, получено: ${String(value)}`);
  }
  return value;
}
