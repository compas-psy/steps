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

/** Вход `createLabelCommand` (`01§13`). `colorToken` — `string | null`, та
 * же семантика "не задан" == `null`, что уже применяет `entities/label.ts`. */
export interface CreateLabelInput {
  readonly displayName: string;
  readonly colorToken: string | null;
  readonly rank: NewRank;
}

/**
 * Единая точка входа для создания Label. Прогоняет `displayName` через
 * `validateLabel` (правила 23, 24) **до** записи — при блокирующем
 * нарушении не пишет ничего. `normalizedName` вычисляется здесь
 * (`normalizeLabelName`), не принимается на входе — правило 24 говорит про
 * НОРМАЛИЗОВАННОЕ имя, вычислять его дважды в разных местах (вызывающий код
 * + команда) было бы источником расхождения.
 */
export async function createLabelCommand(
  input: CreateLabelInput,
  deps: LabelCommandDeps,
): Promise<LabelCommandResult> {
  const generateId = deps.generateId ?? generateUuidV7;
  const generateOpId = deps.generateOpId ?? generateUuidV7;

  const context = await deps.storage.labels.loadValidationContext(null);
  const validation = validateDomainMutation({
    entity: 'label',
    data: { displayName: input.displayName },
    context,
  });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };
  const label: Label = {
    id: generateId(),
    normalizedName: normalizeLabelName(input.displayName),
    displayName: input.displayName,
    colorToken: input.colorToken,
    rank: resolveRank(input.rank),
    deletedAt: null,
    clocks: {},
  };

  const changedFields = diffChangedFields(null, label, LABEL_MUTABLE_FIELDS);
  const finalLabel: Label = { ...label, clocks: tickClocks(label.clocks, changedFields, hlc) };

  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'label',
    entityId: finalLabel.id,
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
