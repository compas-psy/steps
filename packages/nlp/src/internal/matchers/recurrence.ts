/**
 * Категория Recurrence (`01§4`): только распознавание и извлечение
 * параметров правила в чип (`RecurrenceChipValue`) — генерация occurrence-
 * повторов эпик E11, здесь не реализуется (граница пакета работ явно
 * названа в задании).
 *
 * Шесть форм грамматики:
 * - "каждый день" → day/1;
 * - "по будням" → week/1 с byWeekday=[Пн..Пт];
 * - "каждый понедельник"/"каждую пятницу"/... → week/1 с конкретным днём;
 * - "каждое N число" → month/1 с byMonthDay=N;
 * - "раз в неделю" (и, расширяя по той же схеме без риска ложных
 *   срабатываний, "раз в день"/"раз в месяц") → interval=1 без byWeekday;
 * - "каждые N дней/недель/месяцев" → interval=N.
 */

import type { RecurrenceChipValue } from '../../types.js';
import type { PatternDef, MatchOutcome } from '../candidates.js';
import { WORD_BOUNDARY_AFTER, WORD_BOUNDARY_BEFORE } from '../text.js';
import { WEEKDAYS } from '../dictionaries.js';

function valid(value: RecurrenceChipValue): MatchOutcome<RecurrenceChipValue> {
  return { kind: 'valid', value };
}

const WEEKDAYS_MON_FRI: readonly number[] = [1, 2, 3, 4, 5];

const everyDayEntries = WEEKDAYS.map((w): PatternDef<RecurrenceChipValue> => ({
  regex: new RegExp(
    `${WORD_BOUNDARY_BEFORE}${w.everyPrefix}\\s+${w.accusative}${WORD_BOUNDARY_AFTER}`,
    'uy',
  ),
  resolve: () => valid({ unit: 'week', interval: 1, byWeekday: [w.iso] }),
}));

export const RECURRENCE_PATTERNS: readonly PatternDef<RecurrenceChipValue>[] = [
  {
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}каждый\\s+день${WORD_BOUNDARY_AFTER}`, 'uy'),
    resolve: () => valid({ unit: 'day', interval: 1 }),
  },
  {
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}по\\s+будням${WORD_BOUNDARY_AFTER}`, 'uy'),
    resolve: () => valid({ unit: 'week', interval: 1, byWeekday: WEEKDAYS_MON_FRI }),
  },
  ...everyDayEntries,
  {
    regex: new RegExp(
      `${WORD_BOUNDARY_BEFORE}каждое\\s+(\\d{1,2})\\s+число${WORD_BOUNDARY_AFTER}`,
      'uy',
    ),
    resolve: (m) => {
      const day = Number(m[1]);
      if (day < 1 || day > 31) {
        return { kind: 'invalid', reason: 'invalidDate' };
      }
      return valid({ unit: 'month', interval: 1, byMonthDay: day });
    },
  },
  {
    regex: new RegExp(
      `${WORD_BOUNDARY_BEFORE}раз\\s+в\\s+(день|неделю|месяц)${WORD_BOUNDARY_AFTER}`,
      'uy',
    ),
    resolve: (m) => {
      const word = m[1] as string;
      const unit = word === 'день' ? 'day' : word === 'неделю' ? 'week' : 'month';
      return valid({ unit, interval: 1 });
    },
  },
  {
    regex: new RegExp(
      `${WORD_BOUNDARY_BEFORE}каждые\\s+(\\d{1,3})\\s+(дней|дня|недель|недели|месяцев|месяца)${WORD_BOUNDARY_AFTER}`,
      'uy',
    ),
    resolve: (m) => {
      const interval = Number(m[1]);
      const word = m[2] as string;
      const unit = word.startsWith('дн') ? 'day' : word.startsWith('недел') ? 'week' : 'month';
      return valid({ unit, interval });
    },
  },
];
