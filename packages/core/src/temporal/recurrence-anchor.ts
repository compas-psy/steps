import { Temporal } from '@js-temporal/polyfill';

/**
 * Якорная арифметика повторов (`01§11.3` scheduled, `01§11.4` completion) —
 * эпик E11. Только чистые `Temporal.PlainDate` вычисления, никакого `Date`
 * (CLAUDE.md, «Время»): вызывающий код (командный слой,
 * `commands/complete-occurrence.ts`) обязан сам передать уже материализованную
 * локальную дату завершения/пропуска — этот модуль не читает системные часы
 * и не знает про часовой пояс устройства.
 *
 * **Форма `RecurrenceRuleTemplate`** — CLAUDE.md прямо требует переиспользовать
 * форму `RecurrenceChipValue` (`@shagi/nlp`, `{unit:'day'|'week'|'month',
 * interval, byWeekday?, byMonthDay?}`) как форму `RecurrenceSeries.templateJson`,
 * "не выдумывай вторую". Здесь она расширена ОДНИМ дополнительным вариантом
 * `unit:'year'` (плюс `byMonth` — без него нельзя описать "29 февраля",
 * `byMonthDay` одного числа недостаточно, год кроме дня нуждается в месяце) —
 * это не вторая форма, а тот же object shape с одним дополнительным полем:
 * `01§4` («Deterministic NLP R1») грамматика не производит `unit:'year'`
 * (шесть форм грамматики — день/неделя/месяц), но `01§11.3` прямо требует
 * годовой якорь ("yearly Feb 29 only in leap years") как часть охвата ЭТОГО
 * пакета работ. Устройство сегодня недостижимо через Quick Add — это
 * форвард-совместимое расширение той же формы для будущего UI-редактора
 * повтора (не через NLP), не конкурирующая схема; `RecurrenceChipValue`
 * (`unit:'day'|'week'|'month'`) остаётся структурно присваиваемым в этот тип
 * без каста — уже пройденный подтип.
 */
export type RecurrenceRuleUnit = 'day' | 'week' | 'month' | 'year';

export interface RecurrenceRuleTemplate {
  readonly unit: RecurrenceRuleUnit;
  readonly interval: number;
  /** ISO-номера дня недели (1=понедельник..7=воскресенье) — `unit:'week'`. */
  readonly byWeekday?: readonly number[];
  /** День месяца 1..31 — `unit:'month'|'year'`. */
  readonly byMonthDay?: number;
  /** Месяц 1..12 — только `unit:'year'` (без него "29 февраля" не описать). */
  readonly byMonth?: number;
}

function daysInMonth(year: number, month: number): number {
  return Temporal.PlainDate.from({ year, month, day: 1 }).daysInMonth;
}

/** Первый день строго после `after`, чей ISO `dayOfWeek` входит в `byWeekday`
 * (`01§11.3` "weekly Monday completed Wednesday → next Monday"; "three weeks
 * late → first future scheduled slot, not a backlog" — поиск всегда идёт
 * ВПЕРЁД от `after`, независимо от того, сколько слотов пропущено, поэтому
 * просрочка сама по себе не порождает пачку прошлых копий). Ищет строго в
 * пределах одной недели (7 дней) — `byWeekday` всегда непуст, гарантируется
 * вызывающим кодом (движок повторов не создаёт серию с пустым списком дней). */
function nextWeekdayStrictlyAfter(
  after: Temporal.PlainDate,
  byWeekday: readonly number[],
): Temporal.PlainDate {
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = after.add({ days: offset });
    if (byWeekday.includes(candidate.dayOfWeek)) {
      return candidate;
    }
  }
  throw new Error(
    'nextWeekdayStrictlyAfter: byWeekday пуст — недостижимо, движок повторов не создаёт ' +
      'week-серию без хотя бы одного дня.',
  );
}

/** Первый `byMonthDay`-слот строго после `after`, шагая по `interval` месяцев
 * за раз и буквально ПРОПУСКАЯ (не "constrain") месяцы короче `byMonthDay`
 * (`01§11.3` "monthly day 31 skips months without day 31"). Текущий месяц
 * `after` проверяется первым — слот этого же месяца ещё мог не наступить. */
function nextMonthDaySlot(
  after: Temporal.PlainDate,
  byMonthDay: number,
  interval: number,
): Temporal.PlainDate {
  let year = after.year;
  let month = after.month;
  // 4800 = 400 лет * 12 месяцев — с большим запасом покрывает любой разумный
  // interval и любую комбинацию, включая пограничные вековые невисокосные
  // годы; защита от бесконечного цикла на случай испорченного шаблона.
  for (let guard = 0; guard < 4800; guard++) {
    if (byMonthDay <= daysInMonth(year, month)) {
      const candidate = Temporal.PlainDate.from({ year, month, day: byMonthDay });
      if (Temporal.PlainDate.compare(candidate, after) > 0) {
        return candidate;
      }
    }
    const advanced = Temporal.PlainDate.from({ year, month, day: 1 }).add({ months: interval });
    year = advanced.year;
    month = advanced.month;
  }
  throw new Error('nextMonthDaySlot: слот не найден за 4800 итераций — испорченный шаблон.');
}

/** Тот же приём, что `nextMonthDaySlot`, но по годам — `unit:'year'`
 * (`01§11.3` "yearly Feb 29 only in leap years": невисокосные годы просто
 * пропускаются, `daysInMonth(year, 2) < 29`). */
function nextYearlySlot(
  after: Temporal.PlainDate,
  byMonth: number,
  byMonthDay: number,
  interval: number,
): Temporal.PlainDate {
  let year = after.year;
  for (let guard = 0; guard < 400; guard++) {
    if (byMonthDay <= daysInMonth(year, byMonth)) {
      const candidate = Temporal.PlainDate.from({ year, month: byMonth, day: byMonthDay });
      if (Temporal.PlainDate.compare(candidate, after) > 0) {
        return candidate;
      }
    }
    year += interval;
  }
  throw new Error('nextYearlySlot: слот не найден за 400 итераций — испорченный шаблон.');
}

/**
 * Scheduled-якорь (`01§11.3`): "first schedule slot strictly after
 * completion/skip local time". `after` — уже локальная дата события
 * (завершения/пропуска), не `Date`/`Instant`.
 */
export function computeNextScheduledDate(
  rule: RecurrenceRuleTemplate,
  after: Temporal.PlainDate,
): Temporal.PlainDate {
  switch (rule.unit) {
    case 'day':
      return after.add({ days: rule.interval });
    case 'week':
      if (rule.byWeekday !== undefined && rule.byWeekday.length > 0) {
        return nextWeekdayStrictlyAfter(after, rule.byWeekday);
      }
      // "раз в неделю"/"каждые N недель" без конкретного дня (`01§4`) — нет
      // якорной даты, определяющей фазу цикла, поэтому цикл считается от
      // самого `after` (см. заголовочный комментарий файла).
      return after.add({ weeks: rule.interval });
    case 'month':
      if (rule.byMonthDay !== undefined) {
        return nextMonthDaySlot(after, rule.byMonthDay, rule.interval);
      }
      // "каждые N месяцев" без явного числа (`01§4`) — та же фаза-от-`after`
      // логика, что у недели без дня; `Temporal.PlainDate#add` уже
      // constrain по умолчанию (31 января + 1 месяц → 28/29 февраля).
      return after.add({ months: rule.interval });
    case 'year': {
      if (rule.byMonth === undefined || rule.byMonthDay === undefined) {
        throw new Error(
          'computeNextScheduledDate: unit="year" требует byMonth и byMonthDay — ' +
            'без месяца день года не определён.',
        );
      }
      return nextYearlySlot(after, rule.byMonth, rule.byMonthDay, rule.interval);
    }
  }
}

/**
 * Completion-якорь (`01§11.4`): "Next planned date = completion local date +
 * interval using Temporal overflow:'constrain'". В отличие от scheduled-
 * якоря, здесь нет понятия "слота" — `byWeekday`/`byMonthDay` игнорируются
 * намеренно (completion-anchor — свободный интервал "через N дней/недель/
 * месяцев после завершения", не привязка к календарным слотам).
 */
export function computeNextCompletionDate(
  rule: RecurrenceRuleTemplate,
  completedOn: Temporal.PlainDate,
): Temporal.PlainDate {
  switch (rule.unit) {
    case 'day':
      return completedOn.add({ days: rule.interval });
    case 'week':
      return completedOn.add({ weeks: rule.interval });
    case 'month':
      return completedOn.add({ months: rule.interval }, { overflow: 'constrain' });
    case 'year':
      return completedOn.add({ years: rule.interval }, { overflow: 'constrain' });
  }
}
