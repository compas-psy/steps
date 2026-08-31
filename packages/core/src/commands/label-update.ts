import type { Label } from '../entities/label.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import { normalizeLabelName } from '../validation/label.js';
import type {
  CommandLabelDomainMutation,
  CommandLabelEntityWrite,
  LabelCommandDeps,
  LabelCommandResult,
} from './label-port.js';
import { LABEL_MUTABLE_FIELDS } from './label-port.js';
import {
  buildPatchJson,
  diffChangedFields,
  pickClocks,
  tickClocks,
} from './project-section-clock.js';
import { resolveRank, type NewRank } from './project-rank.js';
import type { Uuid } from '../values.js';

/** Патч Label — `'field' in patch`, отсутствие ключа значит "не трогать"
 * (та же конвенция, что `UpdateSectionPatch`). `normalizedName` НЕ входит в
 * патч — он не независимое поле пользователя, а всегда пересчитывается из
 * итогового `displayName` (см. `updateLabelCommand`). */
export interface UpdateLabelPatch {
  readonly displayName?: string;
  readonly colorToken?: string | null;
  readonly rank?: NewRank;
}

export interface UpdateLabelInput {
  readonly id: Uuid;
  readonly patch: UpdateLabelPatch;
}

/**
 * При смене `displayName` пересчитывает `normalizedName` и валидирует
 * уникальность через `loadValidationContext(excludingId: id)` (задание
 * пакета работ — параметр порта именно под это, "редактирование метки без
 * изменения имени не конфликтует само с собой").
 */
export async function updateLabelCommand(
  input: UpdateLabelInput,
  deps: LabelCommandDeps,
): Promise<LabelCommandResult> {
  const current = await deps.storage.labels.findById(input.id);
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const displayName = input.patch.displayName ?? current.displayName;

  const context = await deps.storage.labels.loadValidationContext(current.id);
  const validation = validateDomainMutation({ entity: 'label', data: { displayName }, context });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const colorToken =
    'colorToken' in input.patch ? (input.patch.colorToken ?? null) : current.colorToken;
  const rank = input.patch.rank !== undefined ? resolveRank(input.patch.rank) : current.rank;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const nextLabel: Label = {
    ...current,
    displayName,
    normalizedName: normalizeLabelName(displayName),
    colorToken,
    rank,
  };
  const changedFields = diffChangedFields(current, nextLabel, LABEL_MUTABLE_FIELDS);
  const finalLabel: Label = {
    ...nextLabel,
    clocks: tickClocks(current.clocks, changedFields, hlc),
  };

  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'label',
    entityId: current.id,
    patchJson: buildPatchJson(finalLabel, changedFields),
    fieldClocksJson: pickClocks(finalLabel.clocks, changedFields),
    baseRevision: 0n,
    createdAt: deps.now,
    retryCount: 0,
  };

  const write: CommandLabelEntityWrite = { entity: 'label', value: finalLabel };
  const mutation: CommandLabelDomainMutation = { writes: [write], outbox: [outboxEntry] };

  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return { status: 'ok', label: finalLabel };
}
