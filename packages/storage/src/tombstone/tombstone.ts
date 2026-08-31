import { Temporal } from '@js-temporal/polyfill';

/**
 * Tombstone-политика (задание пакета работ E02.1, п.5; `02§9`).
 *
 * Срок — 90 дней **прошедшего времени**, не 90 календарных дней в каком-то
 * часовом поясе: `deletedAt`/`now` — `Temporal.Instant` (системные метки,
 * `00§5`), поэтому граница считается как `deletedAt + 90×24 часа`, а не
 * через `PlainDate`-арифметику, которая потребовала бы часового пояса,
 * которого у tombstone нет и не должно быть (запись может быть создана на
 * одном устройстве, прочитана на другом, в другом поясе).
 */
export const TOMBSTONE_RETENTION_DAYS = 90;

const TOMBSTONE_RETENTION_HOURS = TOMBSTONE_RETENTION_DAYS * 24;

/** Просрочен ли tombstone к моменту `now` — истинно на границе ровно 90
 * дней и позже (`>=`), не строго позже: удаление в момент истечения не
 * обязано ждать следующего тика. */
export function isTombstoneExpired(deletedAt: Temporal.Instant, now: Temporal.Instant): boolean {
  const cutoff = deletedAt.add({ hours: TOMBSTONE_RETENTION_HOURS });
  return Temporal.Instant.compare(now, cutoff) >= 0;
}

/** Момент, начиная с которого запись, удалённая в `deletedAt`, может быть
 * физически стёрта чистильщиком — вспомогательное для диагностики/UI
 * (например, "восстановление доступно ещё N дней"). */
export function tombstoneExpiresAt(deletedAt: Temporal.Instant): Temporal.Instant {
  return deletedAt.add({ hours: TOMBSTONE_RETENTION_HOURS });
}

/**
 * Одна сущность из семейства, у которого в `@shagi/core` реально есть
 * `deletedAt` (`Task`, `Project`, `Section`, `Label`, `ChecklistItem`) — см.
 * `ports/storage-port.ts` `TombstonePurgeSummary` о том, почему `Reminder`/
 * `Attachment`/`TaskLink`/`RecurrenceSeries` сюда не входят.
 */
export interface Tombstoned {
  readonly deletedAt: Temporal.Instant | null;
}

/** Отбирает из списка те записи, чей tombstone уже просрочен к `now` —
 * чистая функция; физическое удаление и то, откуда берётся список записей,
 * — забота конкретной реализации `StoragePort.purgeExpiredTombstones`
 * (`../ports/storage-port.ts`), не этого модуля. */
export function selectExpiredTombstones<T extends Tombstoned>(
  records: readonly T[],
  now: Temporal.Instant,
): readonly T[] {
  return records.filter(
    (record) => record.deletedAt !== null && isTombstoneExpired(record.deletedAt, now),
  );
}
