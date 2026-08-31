import type { Temporal } from '@js-temporal/polyfill';

import type { Label } from '../entities/label.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import type { LabelValidationContext } from '../validation/label.js';
import type { ValidationResult } from '../validation/types.js';
import type { Uuid } from '../values.js';
import type { NonEmptyArray } from './storage-port.js';

/**
 * Порт хранения командного слоя Label (пакет работ E10, `01§13` "Label
 * lifecycle"). Тот же архитектурный приём, что `reminder-port.ts`/
 * `section-port.ts` (инверсия зависимости, ADR-0003): собственный,
 * независимый, структурно совместимый интерфейс — не расширяет и не
 * переиспользует `CommandStoragePort` (Task/ChecklistItem, `storage-port.ts`),
 * потому что Label — самостоятельная сущность (`labels`, `02§2`), не
 * подчинённая Task так, как ChecklistItem (см. обоснование там: у
 * ChecklistItem нет смысла существовать без родительской Task, у Label он
 * есть — Label существует независимо, связь с Task — отдельная таблица
 * `task_labels`, свой порт `task-label-port.ts`).
 *
 * `CommandLabelReader` — структурный срез `LabelRepository`
 * (`packages/storage/src/ports/label-repository.ts`): `findById` — для
 * `update`/`delete`; `loadValidationContext(excludingId)` — готовый
 * `LabelValidationContext` (правило 24, уникальность) одним вызовом, тот же
 * приём, что `CommandTaskReader.loadValidationContext`.
 */
export interface CommandLabelReader {
  findById(id: Uuid): Promise<Label | null>;
  loadValidationContext(excludingId: Uuid | null): Promise<LabelValidationContext>;
}

export interface CommandLabelEntityWrite {
  readonly entity: 'label';
  readonly value: Label;
}

export interface CommandLabelDomainMutation {
  readonly writes: readonly CommandLabelEntityWrite[];
  readonly outbox: NonEmptyArray<SyncOutboxEntry>;
}

export interface CommandLabelWriteTransaction {
  applyMutation(mutation: CommandLabelDomainMutation): Promise<void>;
}

export interface CommandLabelStoragePort {
  readonly labels: CommandLabelReader;
  runTransaction<T>(run: (tx: CommandLabelWriteTransaction) => Promise<T>): Promise<T>;
}

export interface LabelCommandDeps {
  readonly storage: CommandLabelStoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
  readonly generateId?: () => Uuid;
  readonly generateOpId?: () => Uuid;
}

/** Та же трёхветочная форма, что `SectionCommandResult`/`TaskCommandResult`. */
export type LabelCommandResult =
  | { readonly status: 'ok'; readonly label: Label }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' };

/** Поля Label, участвующие в per-field HLC (`entities/label.ts`) — все
 * изменяемые поля, кроме `id`. `normalizedName` тикается ВМЕСТЕ с
 * `displayName` (пересчитывается из него, не независимое поле пользователя
 * — см. `label-update.ts`). */
export const LABEL_MUTABLE_FIELDS = [
  'displayName',
  'normalizedName',
  'colorToken',
  'rank',
  'deletedAt',
] as const;
