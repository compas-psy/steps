import type {
  RecurrenceAnchor,
  RecurrenceAnchorType,
  RecurrenceTemplate,
} from '../entities/recurrence-series.js';
import type { RecurrenceRuleTemplate, RecurrenceRuleUnit } from '../temporal/recurrence-anchor.js';

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
