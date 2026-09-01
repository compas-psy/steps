import { Temporal } from '@js-temporal/polyfill';

import type {
  RecurrenceAnchor,
  RecurrenceAnchorType,
  RecurrenceTemplate,
} from '../entities/recurrence-series.js';
import type { RecurrenceRuleTemplate, RecurrenceRuleUnit } from '../temporal/recurrence-anchor.js';
import { makeDurationMinutes, type DurationMinutes } from '../values.js';

/**
 * Мост между структурной `RecurrenceRuleTemplate` (`temporal/recurrence-
 * anchor.ts` — форма `RecurrenceChipValue`, CLAUDE.md, "не выдумывай вторую")
 * и непрозрачными JSON-полями `RecurrenceSeries` (E01, схема заморожена):
 * `templateJson: RecurrenceTemplate` (`Readonly<Record<string, unknown>>`),
 * `rrule: string`, `completionIntervalJson: Record<string, unknown> | null`.
 *
 * **Решение, где живёт "рабочая" копия правила.** `RecurrenceSeries.rrule`
 * типизирован как голая `string` (не JSON-объект) — E01 явно предполагал
 * иконический RRULE-текст (`FREQ=WEEKLY;BYDAY=MO`), которого этот пакет
 * работ не строит (не было заявлено требование парсить/генерировать RRULE-
 * синтаксис, только вычислять следующую дату). Чтобы не изобретать вторую
 * форму правила специально под `rrule`, а заодно не оставлять обязательное
 * непустое поле E01-схемы бессмысленным, `rrule` получает `JSON.stringify`
 * ТОЙ ЖЕ структуры, что лежит в `templateJson` — человекочитаемый,
 * пригодный для будущей sync/отладки текст, но НЕ то, что читают
 * `computeNextScheduledDate`/`computeNextCompletionDate` (командный слой
 * читает исключительно `templateJson`, см. `complete-occurrence.ts`).
 * `completionIntervalJson` (уже `Record<string, unknown>`, не `string`) несёт
 * тот же объект без сериализации — совпадение с `templateJson` неслучайно
 * (это позволяет читать любое из двух полей взаимозаменяемо, если будущий
 * sync-код когда-нибудь захочет), но именно `templateJson` остаётся
 * единственным источником для вычислений этого пакета работ.
 */

const RECURRENCE_RULE_UNITS: readonly RecurrenceRuleUnit[] = ['day', 'week', 'month', 'year'];

function isRecurrenceRuleUnit(value: unknown): value is RecurrenceRuleUnit {
  return typeof value === 'string' && (RECURRENCE_RULE_UNITS as readonly string[]).includes(value);
}

/** `RecurrenceRuleTemplate` → JSON-совместимый `Record` для `templateJson`/
 * `completionIntervalJson`. Только определённые поля попадают в результат —
 * `undefined` не сериализуется явно, чтобы `parseRecurrenceRuleTemplate`
 * видел ровно то же множество ключей, что было на входе (симметричный
 * round-trip, проверено тестом). */
export function toRecurrenceTemplateJson(rule: RecurrenceRuleTemplate): RecurrenceTemplate {
  const record: Record<string, unknown> = { unit: rule.unit, interval: rule.interval };
  if (rule.byWeekday !== undefined) {
    record.byWeekday = rule.byWeekday;
  }
  if (rule.byMonthDay !== undefined) {
    record.byMonthDay = rule.byMonthDay;
  }
  if (rule.byMonth !== undefined) {
    record.byMonth = rule.byMonth;
  }
  return record;
}

/**
 * Обратное преобразование — с runtime-проверкой формы (защитный рубеж, тот
 * же приём, что throw в `commands/assemble.ts`: этот JSON пишет только наш
 * же командный слой, поэтому нарушение формы здесь — признак испорченных
 * данных/бага, не пользовательская ошибка ввода, отсюда `throw`, а не
 * `ValidationResult`).
 */
export function parseRecurrenceRuleTemplate(json: RecurrenceTemplate): RecurrenceRuleTemplate {
  const unit: unknown = json.unit;
  if (!isRecurrenceRuleUnit(unit)) {
    throw new Error(
      `parseRecurrenceRuleTemplate: некорректный unit — ${JSON.stringify(unit)}, ожидался один из ${RECURRENCE_RULE_UNITS.join('/')}.`,
    );
  }
  const interval: unknown = json.interval;
  if (typeof interval !== 'number' || !Number.isInteger(interval) || interval < 1) {
    throw new Error(
      `parseRecurrenceRuleTemplate: interval обязан быть целым >= 1, получено: ${JSON.stringify(interval)}.`,
    );
  }

  const byWeekday: unknown = json.byWeekday;
  const byMonthDay: unknown = json.byMonthDay;
  const byMonth: unknown = json.byMonth;

  return {
    unit,
    interval,
    ...(Array.isArray(byWeekday) ? { byWeekday: byWeekday as readonly number[] } : {}),
    ...(typeof byMonthDay === 'number' ? { byMonthDay } : {}),
    ...(typeof byMonth === 'number' ? { byMonth } : {}),
  };
}

/** Собирает ветку `RecurrenceAnchor`, согласованную с `anchorType`
 * (`rrule`/`completionIntervalJson` взаимоисключающие по типу сущности,
 * `entities/recurrence-series.ts`) — см. комментарий заголовка файла про то,
 * почему оба поля получают производные ОТ ОДНОГО И ТОГО ЖЕ правила. */
export function buildRecurrenceAnchor(
  anchorType: RecurrenceAnchorType,
  rule: RecurrenceRuleTemplate,
): RecurrenceAnchor {
  const record = toRecurrenceTemplateJson(rule);
  if (anchorType === 'scheduled') {
    return { anchorType: 'scheduled', rrule: JSON.stringify(record), completionIntervalJson: null };
  }
  return { anchorType: 'completion', rrule: null, completionIntervalJson: record };
}

/** Поля `RecurrenceSeries`, участвующие в per-field HLC (тот же generic-
 * приём, что `CHECKLIST_ITEM_MUTABLE_FIELDS`/`LABEL_MUTABLE_FIELDS`,
 * `project-section-clock.ts`). `id`/`anchorType`/`createdAt`/`clocks` вне
 * списка — `anchorType` не меняется ни одной командой этого пакета работ
 * (сменить якорь означало бы удалить и создать серию заново, не патч). */
export const RECURRENCE_SERIES_MUTABLE_FIELDS = [
  'templateJson',
  'templateRevision',
  'rrule',
  'completionIntervalJson',
  'active',
  'nextOccurrenceSeq',
  'stopAfterOccurrenceSeq',
] as const;

/**
 * --- M26 «Recurring detail — current/series scope chooser» ------------------
 * (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`, `01§11.6` "Template edit →
 * Это повторение / Вся серия", `01§11.7` "relative deadline/reminder/
 * available offsets from Parent").
 *
 * До этого пакета работ `generateNextOccurrence` (`complete-occurrence.ts`)
 * вычисляло `plannedTime`/`durationMin`/offset-поля следующего occurrence ИЗ
 * ТЕКУЩЕГО occurrence (`current.plannedTime` и т.д.) — то есть у "шаблона
 * occurrence" не было отдельного хранилища, и любая правка Planning-полей
 * ТЕКУЩЕГО occurrence automatически просачивалась в СЛЕДУЮЩИЙ через
 * `current`. Честно реализовать "Это повторение" (правка не просачивается)
 * отдельно от "Вся серия" (просачивается) с такой архитектурой невозможно —
 * обеим сторонам нужен независимый источник для будущих occurrence,
 * отдельный от того, что видит пользователь сейчас.
 *
 * **Решение.** `RecurrenceOccurrenceTemplate` — второй "слой" того же
 * `RecurrenceSeries.templateJson` (уже непрозрачный `Record<string,
 * unknown>` в схеме E01, ADR не требуется — миграции схемы хранилища нет,
 * оба SQLite- и IndexedDB-адаптера уже сериализуют `templateJson` как
 * есть). `toRecurrenceTemplateJson`/`parseRecurrenceRuleTemplate` читают
 * ТОЛЬКО ключи `unit`/`interval`/`byWeekday`/`byMonthDay`/`byMonth` и
 * игнорируют остальные — значит пять новых ключей этого шаблона можно
 * положить В ТОТ ЖЕ объект простым `{...rruleJson, ...occurrenceJson}` без
 * риска столкновения имён (проверено: пересечения множеств ключей нет) и
 * без единой правки существующего кода, читающего только rrule-часть.
 *
 * `plannedTime`/`durationMin` хранятся буквально (плавающее время суток,
 * `01§11.7`), `deadlineDate`/`availableFrom` — НЕ абсолютной датой (стала бы
 * мгновенно устаревшей), а offset'ом в целых сутках от `plannedDate` —
 * ровно то же представление, что `generateNextOccurrence` и раньше
 * вычисляло на лету через `shiftRelativeDate`, только теперь материализовано
 * один раз в момент записи шаблона (создание серии — `create-recurring-
 * task.ts`, правка со scope="series" — `update-series-template.ts`
 * `updateSeriesOccurrenceTemplateCommand`), а не пересчитывается из текущего
 * occurrence при каждой генерации следующего.
 */

/** День-смещение `to - from` в целых сутках (`01§11.7`: "day offsets from
 * Parent"). `Temporal.PlainDate#until` с `largestUnit:'day'` даёт целое
 * число суток без остатка меньших единиц (даты не несут время). Вынесена
 * сюда (была приватной функцией `complete-occurrence.ts`) — M26 понадобилась
 * та же арифметика ещё в двух местах (`create-recurring-task.ts`,
 * `update-recurring-occurrence-planning.ts`), дублировать её там было бы
 * нарушением требования задания «не дублируй код вычисления офсета». */
export function dayOffset(from: Temporal.PlainDate, to: Temporal.PlainDate): number {
  return from.until(to, { largestUnit: 'day' }).days;
}

/**
 * Переносит один относительный dated-field (`01§11.7`: "Series template
 * stores relative deadline/reminder/available offsets, never stale absolute
 * values") с одного `plannedDate` на другой смещением в днях. `null`, если
 * либо базовая дата, либо переносимое значение отсутствуют — в этом случае
 * поле НЕ переносится (не остаётся устаревшим абсолютным значением), тот же
 * принцип, что `01§11.7` явно формулирует для subtasks без Planned Date
 * родителя ("dated child values are current-occurrence-only"). Используется
 * `complete-occurrence.ts` для subtasks/checklist-снимка (та часть M26 не
 * трогает — см. её комментарий), сам ТОП-уровневый occurrence с M26 читает
 * offset из шаблона (`RecurrenceOccurrenceTemplate`), не пересчитывает его
 * этой функцией. */
export function shiftRelativeDate(
  oldBase: Temporal.PlainDate | null,
  oldValue: Temporal.PlainDate | null,
  newBase: Temporal.PlainDate,
): Temporal.PlainDate | null {
  if (oldBase === null || oldValue === null) {
    return null;
  }
  return newBase.add({ days: dayOffset(oldBase, oldValue) });
}

/** Форма "шаблона occurrence" (M26) — что получает КАЖДЫЙ будущий occurrence
 * серии независимо от правок конкретного, уже показанного occurrence.
 * `deadlineOffsetDays`/`availableFromOffsetDays` — `null` означает "у
 * occurrence нет дедлайна/доступности" (не "офсет равен нулю"). */
export interface RecurrenceOccurrenceTemplate {
  readonly plannedTime: Temporal.PlainTime | null;
  readonly durationMin: DurationMinutes | null;
  readonly deadlineOffsetDays: number | null;
  readonly deadlineTime: Temporal.PlainTime | null;
  readonly availableFromOffsetDays: number | null;
}

/** `RecurrenceOccurrenceTemplate` → JSON-совместимый `Record` для слияния в
 * `templateJson`. В отличие от `toRecurrenceTemplateJson` (там поля
 * optional — реально отсутствуют для одних `unit`, есть для других), здесь
 * все пять ключей ВСЕГДА присутствуют (возможно со значением `null`) — форма
 * не меняется от содержимого, поэтому "поле отсутствует" ниже в
 * `parseRecurrenceOccurrenceTemplate` — это признак ЛЕГАСИ-серии, созданной
 * до M26 (или тестовой фикстуры, не прошедшей через эту функцию), не
 * обычный кейс текущей записи. `Temporal.PlainTime` сериализуется через
 * `.toString()` (не `Date`, CLAUDE.md «Время») — ISO-подстрока вида
 * `"09:00:00"`, симметрично читаемая `Temporal.PlainTime.from`. */
export function toRecurrenceOccurrenceTemplateJson(
  tpl: RecurrenceOccurrenceTemplate,
): Record<string, unknown> {
  return {
    plannedTime: tpl.plannedTime === null ? null : tpl.plannedTime.toString(),
    durationMin: tpl.durationMin,
    deadlineOffsetDays: tpl.deadlineOffsetDays,
    deadlineTime: tpl.deadlineTime === null ? null : tpl.deadlineTime.toString(),
    availableFromOffsetDays: tpl.availableFromOffsetDays,
  };
}

function parsePlainTimeField(value: unknown, fieldName: string): Temporal.PlainTime | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(
      `parseRecurrenceOccurrenceTemplate: ${fieldName} обязан быть строкой Temporal.PlainTime ` +
        `или null, получено: ${JSON.stringify(value)}.`,
    );
  }
  return Temporal.PlainTime.from(value);
}

function parseOffsetDaysField(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(
      `parseRecurrenceOccurrenceTemplate: ${fieldName} обязан быть целым числом или null, ` +
        `получено: ${JSON.stringify(value)}.`,
    );
  }
  return value;
}

function parseDurationField(value: unknown): DurationMinutes | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number') {
    throw new Error(
      `parseRecurrenceOccurrenceTemplate: durationMin обязан быть числом или null, получено: ` +
        `${JSON.stringify(value)}.`,
    );
  }
  return makeDurationMinutes(value);
}

/**
 * Обратное преобразование, тот же защитный приём "throw, не ValidationResult"
 * (см. комментарий `parseRecurrenceRuleTemplate`) — этот JSON тоже пишет
 * только наш командный слой. Отсутствующий ключ (легаси-серия до M26, см.
 * `toRecurrenceOccurrenceTemplateJson`) читается как `null`, не как ошибка —
 * `generateNextOccurrence` для такой серии получит occurrence без времени
 * суток/длительности/дедлайна/доступности, что безопасно (просто "не
 * заданы"), а не падение при завершении легаси-задачи.
 */
export function parseRecurrenceOccurrenceTemplate(
  json: RecurrenceTemplate,
): RecurrenceOccurrenceTemplate {
  const deadlineOffsetDays = parseOffsetDaysField(json.deadlineOffsetDays, 'deadlineOffsetDays');
  return {
    plannedTime: parsePlainTimeField(json.plannedTime, 'plannedTime'),
    durationMin: parseDurationField(json.durationMin),
    deadlineOffsetDays,
    // Дедлайн-время бессмысленно без дедлайн-даты (то же правило 1/2, что
    // домен применяет к Task целиком) — если офсета нет, время игнорируется
    // даже если по какой-то причине записано (не должно случаться при
    // записи через `deriveRecurrenceOccurrenceTemplate`, но чтение —
    // защитный рубеж, не доверяет форме входа сильнее необходимого).
    deadlineTime:
      deadlineOffsetDays === null ? null : parsePlainTimeField(json.deadlineTime, 'deadlineTime'),
    availableFromOffsetDays: parseOffsetDaysField(
      json.availableFromOffsetDays,
      'availableFromOffsetDays',
    ),
  };
}

/** Плоский снимок Planning-полей occurrence (Task или `CreateRecurringTaskInput`
 * — обе формы дают эти шесть значений), из которого вычисляется
 * `RecurrenceOccurrenceTemplate` (offset'ы вместо абсолютных дат, `01§11.7`).
 * Общая точка для `create-recurring-task.ts` (создание серии) и
 * `update-recurring-occurrence-planning.ts` (scope="series") — задание прямо
 * требует не дублировать эту арифметику. */
export interface OccurrencePlanningSnapshot {
  readonly plannedDate: Temporal.PlainDate | null;
  readonly plannedTime: Temporal.PlainTime | null;
  readonly durationMin: DurationMinutes | null;
  readonly deadlineDate: Temporal.PlainDate | null;
  readonly deadlineTime: Temporal.PlainTime | null;
  readonly availableFrom: Temporal.PlainDate | null;
}

/** `OccurrencePlanningSnapshot` → `RecurrenceOccurrenceTemplate`. Без
 * `plannedDate` офсеты не от чего считать — оба обнуляются (тот же принцип,
 * что `shiftRelativeDate`: "не остаётся устаревшим абсолютным значением"). */
export function deriveRecurrenceOccurrenceTemplate(
  snapshot: OccurrencePlanningSnapshot,
): RecurrenceOccurrenceTemplate {
  const deadlineOffsetDays =
    snapshot.plannedDate === null || snapshot.deadlineDate === null
      ? null
      : dayOffset(snapshot.plannedDate, snapshot.deadlineDate);
  const availableFromOffsetDays =
    snapshot.plannedDate === null || snapshot.availableFrom === null
      ? null
      : dayOffset(snapshot.plannedDate, snapshot.availableFrom);

  return {
    plannedTime: snapshot.plannedTime,
    durationMin: snapshot.durationMin,
    deadlineOffsetDays,
    deadlineTime: deadlineOffsetDays === null ? null : snapshot.deadlineTime,
    availableFromOffsetDays,
  };
}
