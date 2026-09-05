/**
 * Категория Date (`01§4`): сегодня/завтра/послезавтра, "через N дней/
 * недель", явная календарная дата (день+месяц словом или числом), выходные,
 * следующая неделя. `DATE_PATTERNS` экспортируется отдельно от
 * `matchDateCandidates`, потому что Deadline (`до <дата>`) переиспользует
 * ровно этот же список для anchored-матчинга даты после маркера "до" —
 * дублировать грамматику дат там означало бы неизбежное расхождение.
 *
 * Weekday ("в пятницу") — сознательно отдельный файл/категория
 * (`matchers/weekday.ts`): другая словоформа (винительный падеж дня
 * недели) и другое правило разрешения (ближайший день vs день следующей
 * календарной недели), см. `01§4` "Weekday".
 */

import { Temporal } from '@js-temporal/polyfill';

import type { DateChipValue } from '../../types.js';
import type { PatternDef, MatchOutcome } from '../candidates.js';
import { WORD_BOUNDARY_AFTER, WORD_BOUNDARY_BEFORE } from '../text.js';
import { MONTHS_GENITIVE, monthGenitiveIndex } from '../dictionaries.js';
import { resolveNextWeekMonday, resolveWeekend } from '../temporal-rules.js';

function valid(date: Temporal.PlainDate): MatchOutcome<DateChipValue> {
  return { kind: 'valid', value: { date } };
}

const INVALID_DATE: MatchOutcome<DateChipValue> = { kind: 'invalid', reason: 'invalidDate' };

/** Строит `PlainDate` из компонентов, ловя "30 февраля" (`01§4` шаг 6,
 * temporal-валидация) вместо того, чтобы падать необработанным исключением
 * до пользователя. `overflow: 'reject'` обязателен — `Temporal.PlainDate.from`
 * по умолчанию использует `'constrain'` и молча подожмёт 30 февраля до 28
 * (или 29 в високосный год) вместо того, чтобы бросить `RangeError`; именно
 * такое тихое исправление и запрещает "никогда не угадывать молча". */
function tryBuildDate(year: number, month: number, day: number): Temporal.PlainDate | null {
  try {
    return Temporal.PlainDate.from({ year, month, day }, { overflow: 'reject' });
  } catch {
    return null;
  }
}

const monthsAlternation = MONTHS_GENITIVE.join('|');

export const DATE_PATTERNS: readonly PatternDef<DateChipValue>[] = [
  {
    // Проверяется раньше "завтра" в списке ниже намеренно бессмысленно —
    // порядок в списке не важен: `matchAt` берёт самое длинное совпадение
    // среди всех паттернов на данной позиции, а не первое подошедшее.
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}послезавтра${WORD_BOUNDARY_AFTER}`, 'uy'),
    resolve: (_m, ctx) => valid(ctx.now.date.add({ days: 2 })),
  },
  {
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}завтра${WORD_BOUNDARY_AFTER}`, 'uy'),
    resolve: (_m, ctx) => valid(ctx.now.date.add({ days: 1 })),
  },
  {
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}сегодня${WORD_BOUNDARY_AFTER}`, 'uy'),
    resolve: (_m, ctx) => valid(ctx.now.date),
  },
  {
    // Именительный/винительный ("на выходные") и родительный ("до
    // выходных") — единственные две словоформы, которые реально нужны:
    // "на"/"в" берут винительный (совпадает с именительным у этого слова),
    // "до" — родительный. Полного склонения не требуется, это не день
    // недели с семью вариантами, а один фиксированный токен с двумя
    // формами.
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}выходны(?:е|х)${WORD_BOUNDARY_AFTER}`, 'uy'),
    resolve: (_m, ctx) => valid(resolveWeekend(ctx.now.date)),
  },
  {
    // Именительный («следующая неделя») и предложный («на следующей
    // неделе») — одна и та же мысль. Второй вариант в живой речи встречается
    // чаще («съездить на дачу на следующей неделе»), но грамматика знала
    // только первый, и вся фраза оседала в названии задачи.
    regex: new RegExp(
      `${WORD_BOUNDARY_BEFORE}(?:следующая\\s+неделя|на\\s+следующей\\s+неделе)${WORD_BOUNDARY_AFTER}`,
      'uy',
    ),
    resolve: (_m, ctx) => valid(resolveNextWeekMonday(ctx.now.date)),
  },
  {
    // "через 3 дня/недели" — только дни/недели (`01§4`: месяцы через "через"
    // в грамматике Date не описаны, у Recurrence своя форма "каждые N
    // месяцев").
    regex: new RegExp(
      `${WORD_BOUNDARY_BEFORE}через\\s+(?:(\\d{1,3})\\s+)?(дней|дня|день|недель|недели|неделю)${WORD_BOUNDARY_AFTER}`,
      'uy',
    ),
    resolve: (m, ctx) => {
      // Число необязательно: «через неделю» и «через день» — те же «через 1
      // неделю»/«через 1 день», просто человек так не говорит. Раньше
      // требовалась цифра, и обе фразы целиком оставались в названии.
      const amount = m[1] === undefined ? 1 : Number(m[1]);
      const unitWord = m[2] as string;
      const isWeek = unitWord.startsWith('недел');
      return valid(ctx.now.date.add(isWeek ? { weeks: amount } : { days: amount }));
    },
  },
  {
    // "5 сентября" — без года, текущий год (никакого угадывания
    // "следующий год, если дата уже прошла" — решение зафиксировано в
    // отчёте пакета работ, ТЗ его не описывает).
    regex: new RegExp(
      `${WORD_BOUNDARY_BEFORE}(\\d{1,2})\\s+(${monthsAlternation})${WORD_BOUNDARY_AFTER}`,
      'uy',
    ),
    resolve: (m, ctx) => {
      const day = Number(m[1]);
      const monthIndex = monthGenitiveIndex(m[2] as string);
      const built = tryBuildDate(ctx.now.date.year, monthIndex + 1, day);
      return built === null ? INVALID_DATE : valid(built);
    },
  },
  {
    // "05.09" / "05.09.2026". Без года — текущий год. Требование "не
    // предшествует цифре/точке" отсекает случайное совпадение внутри более
    // длинного числа (например, дробной длительности).
    regex: /(?<![\d.])(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?(?!\d)/uy,
    resolve: (m, ctx) => {
      const day = Number(m[1]);
      const month = Number(m[2]);
      const year = m[3] !== undefined ? Number(m[3]) : ctx.now.date.year;
      const built = tryBuildDate(year, month, day);
      return built === null ? INVALID_DATE : valid(built);
    },
  },
];
