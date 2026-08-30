import { Temporal } from '@js-temporal/polyfill';

/**
 * Материализует плавающее локальное время (`PlainDate` + `PlainTime|null`)
 * в конкретной IANA-зоне (`00§5`, `01§19`).
 *
 * Задача хранит время как плавающее — "09:00" без привязки к зоне. Эта
 * функция не пересчитывает и не хранит зону задачи (её и нет в R1, `01§19`
 * "No per-task timezone R1"): зона передаётся снаружи (текущая зона
 * устройства) каждый раз, когда нужен конкретный `Instant` — для
 * планирования уведомления через `NotificationSchedulerPort`
 * (`@shagi/platform`). Именно поэтому "09:00 остаётся 09:00 локального
 * времени" после смены пояса: `PlainDate`/`PlainTime` задачи не меняются
 * никогда, меняется только зона, в которой их материализуют.
 */
export function toZonedDateTime(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime | null,
  timeZone: string,
): Temporal.ZonedDateTime {
  const plainDateTime = date.toPlainDateTime(time ?? Temporal.PlainTime.from('00:00'));
  return plainDateTime.toZonedDateTime(timeZone);
}
