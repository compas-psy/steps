/**
 * Кодек значений бэкапа — как доменная сущность превращается в JSON и
 * обратно БЕЗ ПОТЕРЬ.
 *
 * Проблема, которую он решает: доменные объекты (`@shagi/core`) содержат
 * три типа, которых в JSON нет вовсе — `bigint` (`revision`,
 * `occurrenceSeq`), `Temporal.Instant`/`PlainDate`/`PlainTime`. Обычный
 * `JSON.stringify` на `bigint` бросает исключение, а `Instant` молча
 * превращает в строку, из которой уже не собрать обратно нужный класс.
 *
 * Решение — размеченные объекты (`{"$instant":"..."}`). Почему не «просто
 * строки»: строку невозможно отличить от пользовательского текста. Задача
 * с заголовком `2026-09-02` при обратном чтении превратилась бы в дату, а
 * `123` — в `bigint`. Разметка исключает это структурно: пользовательский
 * текст никогда не является объектом с единственным ключом `$instant`.
 *
 * Кодек ОБЩИЙ, а не по функции на сущность: он обходит значение рекурсивно,
 * поэтому новое поле в любой сущности сериализуется само собой и не может
 * быть забыто. Ровно это и требуется от формата бэкапа, где потеря поля
 * означает потерю данных человека.
 */
import { Temporal } from '@js-temporal/polyfill';

const BIGINT_TAG = '$n';
const INSTANT_TAG = '$instant';
const DATE_TAG = '$date';
const TIME_TAG = '$time';

export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function encodeBackupValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return { [BIGINT_TAG]: value.toString() };
  if (value instanceof Temporal.Instant) return { [INSTANT_TAG]: value.toString() };
  if (value instanceof Temporal.PlainDate) return { [DATE_TAG]: value.toString() };
  if (value instanceof Temporal.PlainTime) return { [TIME_TAG]: value.toString() };
  if (Array.isArray(value)) return value.map((item) => encodeBackupValue(item));
  if (isPlainObject(value)) {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      // `undefined` в JSON не существует; в доменных объектах его быть не
      // должно, но если оно просочилось — теряем ключ молча только здесь,
      // и это единственное честное поведение (ключа со значением
      // «неизвестно» в бэкапе быть не может).
      if (item === undefined) continue;
      result[key] = encodeBackupValue(item);
    }
    return result;
  }
  throw new TypeError(
    `encodeBackupValue: значение типа ${typeof value} не сериализуемо в бэкап — ` +
      'формат обязан быть без потерь, поэтому молча пропустить его нельзя.',
  );
}

export function decodeBackupValue(value: JsonValue): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => decodeBackupValue(item));
  const record = value as Record<string, JsonValue>;
  const keys = Object.keys(record);
  if (keys.length === 1) {
    const [key] = keys as [string];
    const raw = record[key];
    if (typeof raw === 'string') {
      if (key === BIGINT_TAG) return BigInt(raw);
      if (key === INSTANT_TAG) return Temporal.Instant.from(raw);
      if (key === DATE_TAG) return Temporal.PlainDate.from(raw);
      if (key === TIME_TAG) return Temporal.PlainTime.from(raw);
    }
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) result[key] = decodeBackupValue(item);
  return result;
}

/** Одна сущность — одна строка JSON (формат JSONL из `01§27`). */
export function toJsonl(entities: readonly unknown[]): string {
  return entities.map((entity) => JSON.stringify(encodeBackupValue(entity))).join('\n');
}

export function fromJsonl(text: string): readonly unknown[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => decodeBackupValue(JSON.parse(line) as JsonValue));
}
