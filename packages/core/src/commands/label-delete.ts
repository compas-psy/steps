import type { Temporal } from '@js-temporal/polyfill';

import type { Label } from '../entities/label.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { isTaskLabelActive, type TaskLabel } from '../entities/task-label.js';
import type {
  CommandLabelDomainMutation,
  CommandLabelEntityWrite,
  CommandLabelStoragePort,
} from './label-port.js';
import { LABEL_MUTABLE_FIELDS } from './label-port.js';
import {
  buildPatchJson,
  diffChangedFields,
  pickClocks,
  tickClocks,
} from './project-section-clock.js';
import type {
  CommandTaskLabelDomainMutation,
  CommandTaskLabelEntityWrite,
  CommandTaskLabelStoragePort,
} from './task-label-port.js';
import type { NonEmptyArray } from './storage-port.js';
import type { Uuid } from '../values.js';

export interface DeleteLabelInput {
  readonly id: Uuid;
}

/** Сужает динамически построенный (через `.map`) массив outbox-записей до
 * `NonEmptyArray` — вызывается только там, где длина уже проверена
 * `if (affectedTaskLabels.length > 0)` выше по коду, `throw` здесь не
 * пользовательская ошибка, а тот же защитный приём "недостижимо", что уже
 * применяет `assemble.ts` (валидатор/вызывающая проверка уже гарантировала
 * условие раньше). */
function toNonEmptyOutbox(entries: readonly SyncOutboxEntry[]): NonEmptyArray<SyncOutboxEntry> {
  const [first, ...rest] = entries;
  if (first === undefined) {
    throw new Error(
      'toNonEmptyOutbox: вызвано с пустым массивом — вызывающий код обязан был проверить длину.',
    );
  }
  return [first, ...rest];
}

/** Оба хранилища нужны — Label (tombstone самой метки) и TaskLabel (снять
 * все её активные связи) — тот же приём "несколько storage-полей на одну
 * команду", что `DeleteSectionDeps`/`DeleteProjectDeps` (`storage` +
 * `taskCommandStorage`/`tasks`). */
export interface DeleteLabelDeps {
  readonly storage: CommandLabelStoragePort;
  readonly taskLabels: CommandTaskLabelStoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
  readonly generateOpId?: () => Uuid;
}

/**
 * `affectedTaskLabels` — снимок связей ДО снятия (pre-image: `addHlc`
 * исходный, `removeHlc` каким он был непосредственно перед этим вызовом,
 * почти всегда `null` — связь была активна). Материал для будущего
 * 6-секундного Undo (`01§13` "shows 6-second Undo that restores Label +
 * relations") — восстановление означает буквально записать поверх эти же
 * объекты (плюс снять `deletedAt` у Label), не требует отдельной логики
 * "восстановить прежнее состояние", раз оно уже здесь целиком.
 */
export type DeleteLabelResult =
  | {
      readonly status: 'ok';
      readonly label: Label;
      readonly affectedTaskLabels: readonly TaskLabel[];
    }
  | { readonly status: 'not_found' };

/**
 * `01§13` "Label lifecycle": "Deleting a Label removes only label
 * relations; Tasks are never deleted". Порядок: сперва снять связи, потом
 * tombstone саму метку (тот же порядок, что `deleteSectionCommand`
 * применяет к "перенести задачи, потом tombstone секцию").
 *
 * Без вызова валидатора на неизменных данных — в отличие от
 * `deleteTaskCommand` (объясняет свою причину явно в собственном
 * комментарии), но ТАК ЖЕ, как `deleteSectionCommand`/`tombstoneProject`
 * (`section-delete.ts`/`project-delete.ts`): Label структурно ближе к
 * Section (title+rank+deletedAt+clocks, без временных/иерархических
 * инвариантов), и `validateLabel` на неизменном `displayName` с
 * `excludingId: id` тривиально всегда проходит (метка не может
 * конфликтовать сама с собой) — вызов был бы чистой формальностью без
 * защитной ценности, тот же вывод, что уже сделан для Section.
 */
export async function deleteLabelCommand(
  input: DeleteLabelInput,
  deps: DeleteLabelDeps,
): Promise<DeleteLabelResult> {
  const current = await deps.storage.labels.findById(input.id);
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const links = await deps.taskLabels.taskLabels.listByLabel(current.id);
  const affectedTaskLabels = links.filter(isTaskLabelActive);

  if (affectedTaskLabels.length > 0) {
    const writes: CommandTaskLabelEntityWrite[] = affectedTaskLabels.map((link) => ({
      entity: 'task_label',
      value: { ...link, removeHlc: hlc },
    }));
    const outbox = affectedTaskLabels.map((link): SyncOutboxEntry => ({
      opId: generateOpId(),
      deviceId: deps.deviceId,
      entityType: 'task_label',
      // `task_labels` не несёт `id` — установленная конвенция хранилища
      // (`packages/storage/src/contract/storage-contract.ts`,
      // `fts5-sync.test.ts`): `entityId` outbox-записи task_label — id
      // задачи-владельца связи, полный составной ключ едет в `patchJson`.
      entityId: link.taskId,
      patchJson: {
        taskId: link.taskId,
        labelId: link.labelId,
        addHlc: link.addHlc,
        removeHlc: hlc,
      },
      // TaskLabel не несёт `clocks: FieldClocks` (OR-set через
      // add_hlc/remove_hlc напрямую, не per-field LWW, `entities/task-label.ts`)
      // — `fieldClocksJson` этому типу мутации не соответствует ничему,
      // остаётся пустым.
      fieldClocksJson: {},
      baseRevision: 0n,
      createdAt: deps.now,
      retryCount: 0,
    }));
    const mutation: CommandTaskLabelDomainMutation = {
      writes,
      outbox: toNonEmptyOutbox(outbox),
    };
    await deps.taskLabels.runTransaction(async (tx) => {
      await tx.applyMutation(mutation);
    });
  }

  const nextLabel: Label = { ...current, deletedAt: deps.now };
  const changedFields = diffChangedFields(current, nextLabel, LABEL_MUTABLE_FIELDS);
  const finalLabel: Label = {
    ...nextLabel,
    clocks: tickClocks(current.clocks, changedFields, hlc),
  };

  const labelOutboxEntry: SyncOutboxEntry = {
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
  const labelWrite: CommandLabelEntityWrite = { entity: 'label', value: finalLabel };
  const labelMutation: CommandLabelDomainMutation = {
    writes: [labelWrite],
    outbox: [labelOutboxEntry],
  };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(labelMutation);
  });

  return { status: 'ok', label: finalLabel, affectedTaskLabels };
}
