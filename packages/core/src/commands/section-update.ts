import { generateUuidV7 } from '../identity/index.js';
import type { Section } from '../entities/section.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import type { Uuid } from '../values.js';
import type { NewRank } from './project-rank.js';
import { resolveRank } from './project-rank.js';
import {
  buildPatchJson,
  diffChangedFields,
  pickClocks,
  tickClocks,
} from './project-section-clock.js';
import type {
  CommandSectionDomainMutation,
  CommandSectionEntityWrite,
  SectionCommandDeps,
} from './section-port.js';
import { SECTION_MUTABLE_FIELDS } from './section-port.js';
import type { SectionCommandResult } from './section-port.js';

/**
 * Патч Section — **одна** команда на переименование и reorder, не две
 * (`renameSectionCommand` + `reorderSectionCommand`). Обоснование (задание,
 * раздел Section: "реши по аналогии... на твоё усмотрение"): у Section
 * ровно два изменяемых поля вообще — `title` и `rank` (`entities/section.ts`,
 * `SECTION_MUTABLE_FIELDS` не считая `deletedAt`, которым владеет отдельная
 * команда удаления). "Переименование" и "reorder" семантически — это два
 * независимых поля одного и того же частичного патча, а не два разных
 * жизненных цикла, как у Task (`update` vs `complete` — разные инварианты,
 * поэтому разнесены). Дублировать почти идентичные create/read/validate/
 * write обвязки в двух файлах ради двух полей значило бы разойтись с
 * Task-конвенцией (`UpdateTaskPatch` тоже несёт и обычные поля, и `rank` в
 * одном патче, `update-task.ts`) без причины — CLAUDE.md прямо просит не
 * расходиться без причины со стилем соседних команд.
 *
 * Оба поля — `?`, отсутствие ключа означает "не трогать" (та же конвенция,
 * что `UpdateTaskPatch`).
 */
export interface UpdateSectionPatch {
  readonly title?: string;
  readonly rank?: NewRank;
}

export interface UpdateSectionInput {
  readonly id: Uuid;
  readonly patch: UpdateSectionPatch;
}

export async function updateSectionCommand(
  input: UpdateSectionInput,
  deps: SectionCommandDeps,
): Promise<SectionCommandResult> {
  const current = await deps.storage.sections.findById(input.id);
  // Tombstone — не пользовательская цель новой мутации (то же соглашение,
  // что у `updateTaskCommand`/`updateProjectCommand`).
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const title = input.patch.title ?? current.title;

  const validation = validateDomainMutation({ entity: 'section', data: { title } });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const rank = input.patch.rank !== undefined ? resolveRank(input.patch.rank) : current.rank;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const nextSection: Section = { ...current, title, rank };
  const changedFields = diffChangedFields(current, nextSection, SECTION_MUTABLE_FIELDS);
  const finalSection: Section = {
    ...nextSection,
    clocks: tickClocks(current.clocks, changedFields, hlc),
  };

  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'section',
    entityId: current.id,
    patchJson: buildPatchJson(finalSection, changedFields),
    fieldClocksJson: pickClocks(finalSection.clocks, changedFields),
    baseRevision: 0n,
    createdAt: deps.now,
    retryCount: 0,
  };

  const write: CommandSectionEntityWrite = { entity: 'section', value: finalSection };
  const mutation: CommandSectionDomainMutation = { writes: [write], outbox: [outboxEntry] };

  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return { status: 'ok', section: finalSection };
}
