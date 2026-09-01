import type { RecurrenceSeries, RecurrenceTemplate } from '../entities/recurrence-series.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import type { RecurrenceRuleTemplate } from '../temporal/recurrence-anchor.js';
import type { Uuid } from '../values.js';
import { diffChangedFields, tickClocks } from './project-section-clock.js';
import {
  buildRecurrenceAnchor,
  RECURRENCE_SERIES_MUTABLE_FIELDS,
  toRecurrenceOccurrenceTemplateJson,
  toRecurrenceTemplateJson,
  type RecurrenceOccurrenceTemplate,
} from './recurrence-template.js';
import type { CommandDomainMutation, CommandEntityWrite } from './storage-port.js';
import type { TaskCommandDeps } from './types.js';

/** Вход "Вся серия" (`01§11.6`). `rule` — новое правило повтора, та же форма
 * `RecurrenceRuleTemplate`, что и при создании серии. `anchorType` НЕ входит
 * в патч — сменить якорь (scheduled↔completion) означало бы другую форму
 * `rrule`/`completionIntervalJson`, это переучреждение серии, не правка
 * существующей (реши создать новую через `createRecurringTaskCommand`, если
 * когда-нибудь понадобится — вне охвата этого пакета работ, не запрошено). */
export interface UpdateSeriesTemplateInput {
  readonly seriesId: Uuid;
  readonly rule: RecurrenceRuleTemplate;
}

export type UpdateSeriesTemplateResult =
  { readonly status: 'ok'; readonly series: RecurrenceSeries } | { readonly status: 'not_found' };

/**
 * "Вся серия" (`01§11.6`: "changes current + future template"). **Решение
 * этого пакета работ** (задокументировано подробнее в отчёте): под формой
 * `templateJson`, принятой здесь (см. `temporal/recurrence-anchor.ts` —
 * ТОЛЬКО параметры правила повтора: unit/interval/byWeekday/byMonthDay/
 * byMonth, ничего из содержимого Task), "текущий" материализованный
 * occurrence физически не хранит НИЧЕГО производного от `templateJson` —
 * его `plannedDate` уже конкретная дата, вычисленная и записанная в момент
 * ЕГО генерации, а не читаемая из шаблона на лету. Поэтому "changes current"
 * здесь не требует отдельного патча Task: patch правила влияет только на
 * то, что вычислит СЛЕДУЮЩИЙ вызов `computeNextScheduledDate`/
 * `computeNextCompletionDate` (`complete-occurrence.ts`) — то есть на
 * "future" в буквальном смысле. Если продукту в будущем понадобится, чтобы
 * "Вся серия" ЕЩЁ И меняла поля уже показанного пользователю occurrence
 * (например, время дня) — это отдельная команда, патчащая Task через уже
 * готовый `updateTaskCommand`, не работа этой функции.
 */
export async function updateSeriesTemplateCommand(
  input: UpdateSeriesTemplateInput,
  deps: TaskCommandDeps,
): Promise<UpdateSeriesTemplateResult> {
  const series = await deps.storage.recurrenceSeries.findById(input.seriesId);
  if (series === null) {
    return { status: 'not_found' };
  }

  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };
  const anchor = buildRecurrenceAnchor(series.anchorType, input.rule);

  const updated: RecurrenceSeries = {
    ...series,
    ...anchor,
    templateJson: toRecurrenceTemplateJson(input.rule),
    templateRevision: series.templateRevision + 1n,
    updatedAt: deps.now,
  } as RecurrenceSeries;

  const changedFields = diffChangedFields(series, updated, RECURRENCE_SERIES_MUTABLE_FIELDS);
  const finalSeries: RecurrenceSeries = {
    ...updated,
    clocks: tickClocks(series.clocks, changedFields, hlc),
  };

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'recurrence_series',
    entityId: finalSeries.id,
    patchJson: {
      templateJson: finalSeries.templateJson,
      templateRevision: finalSeries.templateRevision,
      rrule: finalSeries.rrule,
      completionIntervalJson: finalSeries.completionIntervalJson,
    },
    fieldClocksJson: finalSeries.clocks,
    baseRevision: 0n,
    createdAt: deps.now,
    retryCount: 0,
  };
  const write: CommandEntityWrite = { entity: 'recurrence_series', value: finalSeries };
  const mutation: CommandDomainMutation = { writes: [write], outbox: [outboxEntry] };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return { status: 'ok', series: finalSeries };
}

/** Вход "Вся серия" для Planning-полей occurrence (M26, `01§11.6`/`01§11.7`)
 * — независимый от `UpdateSeriesTemplateInput` выше: тот патчит правило
 * повтора (unit/interval/...), этот — время суток/длительность/офсеты
 * дедлайна и доступности следующих occurrence. Обе команды пишут в один и
 * тот же `RecurrenceSeries.templateJson` (см. «M26» в
 * `recurrence-template.ts`), но независимо друг от друга. */
export interface UpdateSeriesOccurrenceTemplateInput {
  readonly seriesId: Uuid;
  readonly occurrenceTemplate: RecurrenceOccurrenceTemplate;
}

/**
 * "Вся серия" для Planning-полей (M26) — вызывается ТОЛЬКО
 * `updateRecurringOccurrencePlanningCommand` (`update-recurring-occurrence-
 * planning.ts`), не напрямую из UI (тот же приём инкапсуляции, что уже
 * применяет `advanceSeries` в `complete-occurrence.ts`).
 *
 * **Слияние, не замена.** В отличие от `updateSeriesTemplateCommand` выше
 * (который перезаписывает `templateJson` ЦЕЛИКОМ — там патчится ЕДИНСТВЕННАЯ
 * форма, rrule), здесь `templateJson` мержится через spread:
 * `{...series.templateJson, ...toRecurrenceOccurrenceTemplateJson(...)}`.
 * Это осознанно — `templateJson` теперь несёт ДВЕ независимые части (rrule-
 * ключи + occurrence-ключи, «M26» в `recurrence-template.ts`), и эта функция
 * трогает только свою половину, не имея права стереть чужую. Если бы здесь
 * тоже была прямая перезапись (как в `updateSeriesTemplateCommand`), "Вся
 * серия" для Planning стирала бы уже сохранённое правило повтора — заметный
 * баг, отловленный при проектировании этого пакета работ, не найденный
 * тестом задним числом.
 */
export async function updateSeriesOccurrenceTemplateCommand(
  input: UpdateSeriesOccurrenceTemplateInput,
  deps: TaskCommandDeps,
): Promise<UpdateSeriesTemplateResult> {
  const series = await deps.storage.recurrenceSeries.findById(input.seriesId);
  if (series === null) {
    return { status: 'not_found' };
  }

  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };
  const mergedTemplateJson: RecurrenceTemplate = {
    ...series.templateJson,
    ...toRecurrenceOccurrenceTemplateJson(input.occurrenceTemplate),
  };

  const updated: RecurrenceSeries = {
    ...series,
    templateJson: mergedTemplateJson,
    templateRevision: series.templateRevision + 1n,
    updatedAt: deps.now,
  };

  const changedFields = diffChangedFields(series, updated, RECURRENCE_SERIES_MUTABLE_FIELDS);
  const finalSeries: RecurrenceSeries = {
    ...updated,
    clocks: tickClocks(series.clocks, changedFields, hlc),
  };

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'recurrence_series',
    entityId: finalSeries.id,
    patchJson: {
      templateJson: finalSeries.templateJson,
      templateRevision: finalSeries.templateRevision,
    },
    fieldClocksJson: finalSeries.clocks,
    baseRevision: 0n,
    createdAt: deps.now,
    retryCount: 0,
  };
  const write: CommandEntityWrite = { entity: 'recurrence_series', value: finalSeries };
  const mutation: CommandDomainMutation = { writes: [write], outbox: [outboxEntry] };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return { status: 'ok', series: finalSeries };
}
