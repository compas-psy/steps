import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { doesDurationCrossDeadline } from '../../src/temporal/predicates.js';
import { toZonedDateTime } from '../../src/temporal/timezone.js';
import { makeDurationMinutes } from '../../src/values.js';

/**
 * Явная сверка с чек-листом `06_TESTING_ACCEPTANCE.md §2` — десять
 * обязательных temporal-тестов. Каждый пункт списка — отдельный `it` здесь
 * или в соседнем temporal-файле (указано в комментарии), под тем же именем,
 * что в спеке, для трассируемости на приёмке:
 *
 *  1. leap year                         → этот файл
 *  2. Dec/Jan                           → этот файл
 *  3. timezone change/DST               → этот файл
 *  4. available_from conflicts          → `predicates.test.ts`
 *  5. planned > deadline warning        → `predicates.test.ts`
 *  6. duration crossing deadline        → `predicates.test.ts`
 *  7. date-only deadline end-of-day     → `deadline.test.ts`
 *  8. midnight Today rollover           → `rules/today-classification.test.ts`
 *  9. focus_date not carrying forward   → `rules/today-classification.test.ts`
 * 10. reminder reschedule after timezone → этот файл
 */

const d = (iso: string) => Temporal.PlainDate.from(iso);
const t = (iso: string) => Temporal.PlainTime.from(iso);

describe('1. leap year', () => {
  it('длительность, пересекающая 29 февраля високосного года, заканчивается после дедлайна', () => {
    // 2028 — високосный: 29 февраля существует.
    const warns = doesDurationCrossDeadline(
      d('2028-02-28'),
      t('23:30'),
      makeDurationMinutes(90),
      d('2028-02-29'),
      t('00:30'),
    );
    expect(warns).toBe(true);
  });

  it('тот же перенос через 28→29 не предупреждает, если укладывается в дедлайн', () => {
    const warns = doesDurationCrossDeadline(
      d('2028-02-28'),
      t('23:30'),
      makeDurationMinutes(30),
      d('2028-02-29'),
      t('00:30'),
    );
    expect(warns).toBe(false);
  });
});

describe('2. Dec/Jan', () => {
  it('длительность, пересекающая границу года (31 декабря → 1 января), заканчивается после дедлайна', () => {
    const warns = doesDurationCrossDeadline(
      d('2026-12-31'),
      t('23:00'),
      makeDurationMinutes(90),
      d('2026-12-31'),
      t('23:30'),
    );
    expect(warns).toBe(true);
  });
});

describe('3. timezone change/DST', () => {
  it('плавающее локальное 09:00 материализуется в 09:00 по обе стороны перехода на летнее время (Europe/Berlin, весенний перевод 2027)', () => {
    const date = d('2027-03-01');
    const time = t('09:00');

    const beforeDst = toZonedDateTime(date, time, 'Europe/Berlin'); // зимнее время, UTC+1
    const afterDst = toZonedDateTime(d('2027-04-01'), time, 'Europe/Berlin'); // летнее время, UTC+2

    expect(beforeDst.toPlainTime().toString()).toBe('09:00:00');
    expect(afterDst.toPlainTime().toString()).toBe('09:00:00');
    expect(beforeDst.offset).toBe('+01:00');
    expect(afterDst.offset).toBe('+02:00');
  });
});

describe('10. reminder reschedule after timezone', () => {
  it('после смены таймзоны устройства напоминание на "09:00" остаётся 09:00 по новому местному времени, но получает новый Instant (`01§19`, конспект §3)', () => {
    const date = d('2026-09-01');
    const time = t('09:00');

    const beforeMove = toZonedDateTime(date, time, 'Europe/Moscow');
    const afterMove = toZonedDateTime(date, time, 'Asia/Yekaterinburg');

    // Семантика "09:00 = локальные 09:00" сохранена в обеих зонах.
    expect(beforeMove.toPlainTime().toString()).toBe('09:00:00');
    expect(afterMove.toPlainTime().toString()).toBe('09:00:00');

    // Расписание уведомления пересчитывается: другой Instant для той же
    // задачи после смены пояса устройства.
    expect(beforeMove.toInstant().equals(afterMove.toInstant())).toBe(false);
  });
});
