import type { Temporal } from '@js-temporal/polyfill';

import type { FieldClocks, OccurrenceSeq, Uuid } from '../values.js';

/**
 * `recurrence_series` (`02§2`, конспект §4). Поля объявлены полностью
 * (включая `stopAfterOccurrenceSeq`, `templateRevision`) — движок повторов
 * это эпик E11 и здесь не реализуется; поля объявлены сейчас, потому что
 * добавить их позже означало бы миграцию на боевых базах.
 *
 * `anchorType` типобезопасно определяет, какое из `rrule`/
 * `completionIntervalJson` заполнено (`01§11.3` scheduled vs `01§11.4`
 * completion) — оба поля никогда не бывают одновременно непустыми или
 * одновременно пустыми, это выражено объединением, а не парой optional-полей.
 */
export type RecurrenceAnchorType = 'scheduled' | 'completion';

/** Форма шаблона (относительные offset'ы, `01§11.7`) определяется движком
 * повторов E11 — здесь непрозрачный JSON. */
export type RecurrenceTemplate = Readonly<Record<string, unknown>>;

export type RecurrenceAnchor =
  | {
      readonly anchorType: 'scheduled';
      readonly rrule: string;
      readonly completionIntervalJson: null;
    }
  | {
      readonly anchorType: 'completion';
      readonly rrule: null;
      readonly completionIntervalJson: Readonly<Record<string, unknown>>;
    };

export type RecurrenceSeries = RecurrenceAnchor & {
  readonly id: Uuid;
  readonly templateJson: RecurrenceTemplate;
  readonly active: boolean;
  readonly nextOccurrenceSeq: OccurrenceSeq;
  readonly stopAfterOccurrenceSeq: OccurrenceSeq | null;
  readonly templateRevision: bigint;
  readonly createdAt: Temporal.Instant;
  readonly updatedAt: Temporal.Instant;
  readonly clocks: FieldClocks;
};
