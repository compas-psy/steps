/**
 * Скалярные value-types общие для всех сущностей домена.
 *
 * Простые ограниченные значения (UUID, Priority, DurationMinutes) сделаны
 * branded-типами со smart-constructor'ами: это тоже "тип", а не валидатор —
 * конструктор либо возвращает корректно построенное значение, либо кидает
 * на границе создания. Кросс-полевые и кросс-сущностные инварианты (раздел 2
 * конспекта, `02§11.1`) сюда не входят — они относятся к общему валидатору,
 * который для этого пакета работ (E01.1) не пишется; они лишь используют
 * эти типы как строительный материал.
 */

import type { Hlc } from './hlc.js';

declare const brand: unique symbol;

/** Номинальная обёртка над примитивом — нулевой ценой различает типы,
 * которые структурно совпадают (например, `string`), но семантически разные. */
export type Branded<T, B extends string> = T & { readonly [brand]: B };

// UUIDv7 (или UUIDv5 для детерминированных recurrence-ID, `02§13`) — формат
// один и тот же (RFC 4122 текстовое представление), версия не проверяется
// здесь: это забота генератора id (следующий пакет работ), не этого типа.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Uuid = Branded<string, 'Uuid'>;

export function isUuid(value: string): value is Uuid {
  return UUID_PATTERN.test(value);
}

export function asUuid(value: string): Uuid {
  if (!isUuid(value)) {
    throw new TypeError(`Ожидался UUID (RFC 4122), получено: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * `owner_scope` (`02§2`) — решение `?1` открытых вопросов: UUIDv7 локального
 * профиля, создаётся при первом запуске и не меняется при входе в аккаунт
 * (к нему лишь привязывается `account_id` — вне схемы `tasks`, живёт в слое
 * аккаунта, который сюда не входит).
 */
export type OwnerScope = Uuid;

/** `priority` (`02§2`): целое 1..4, default 4 — default применяется на
 * уровне команды создания (следующий пакет работ), не здесь. */
export type Priority = Branded<1 | 2 | 3 | 4, 'Priority'>;

export function makePriority(value: number): Priority {
  if (!Number.isInteger(value) || value < 1 || value > 4) {
    throw new RangeError(`priority обязан быть целым числом 1..4, получено: ${value}`);
  }
  return value as Priority;
}

/** `duration_min` (`01§5`, `02§2`): целые минуты 1..1440 (сутки). */
export type DurationMinutes = Branded<number, 'DurationMinutes'>;

export function makeDurationMinutes(value: number): DurationMinutes {
  if (!Number.isInteger(value) || value < 1 || value > 1440) {
    throw new RangeError(`duration_min обязан быть целым числом 1..1440, получено: ${value}`);
  }
  return value as DurationMinutes;
}

/**
 * `rank` (`02§2`, `02§5`) — fractional-строка для ручного порядка.
 * Алгоритм генерации/ренормализации (открытый вопрос `?2`: LexoRank-подобный
 * base62, порог ренормализации 64 символа) — не часть этого пакета работ;
 * здесь `Rank` только маркирует поле как непрозрачную сортируемую строку.
 */
export type Rank = Branded<string, 'Rank'>;

/**
 * `occurrence_seq` (`02§2` recurrence_series) — решение `?3`: старт с `1`,
 * `0` зарезервирован (попал бы в UUIDv5-вывод `02§13`, и "нулевой"
 * occurrence стал бы неотличим от отсутствующего).
 */
export type OccurrenceSeq = Branded<bigint, 'OccurrenceSeq'>;

export function makeOccurrenceSeq(value: bigint): OccurrenceSeq {
  if (value < 1n) {
    throw new RangeError(`occurrence_seq обязан быть >= 1 (решение ?3), получено: ${value}`);
  }
  return value as OccurrenceSeq;
}

/**
 * `clocks` (`02§2`) — per-field Hybrid Logical Clock. Значение и порядок HLC
 * определяет `./hlc.js`; здесь — только форма контейнера "имя поля → HLC",
 * который несёт сущность. Не каждое поле обязано быть отмечено (`Partial`):
 * поле без собственной записи ещё не участвовало в конкурентной правке.
 */
export type FieldClocks = Readonly<Partial<Record<string, Hlc>>>;
