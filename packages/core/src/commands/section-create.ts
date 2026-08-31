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
 * Вход `createSectionCommand` (`01§12` "Create/rename/reorder supported").
 * `projectId` — обязателен по схеме (`entities/section.ts`: "секция без
 * проекта не существует"); эта команда не проверяет существование
 * Project — вне территории (`ProjectRepository`/`CommandProjectReader` не
 * инжектированы сюда), то же решение, что `createTaskCommand` принимает
 * `projectId` как данность, без FK-проверки на этом уровне.
 */
export interface CreateSectionInput {
  readonly projectId: Uuid;
  readonly title: string;
  readonly rank: NewRank;
}

/**
 * Единая точка входа для создания Section. Прогоняет `title` через
 * `validateSection` (правило 23, `@shagi/core/validation`) **до** записи —
 * при блокирующем нарушении не пишет ничего.
 */
export async function createSectionCommand(
  input: CreateSectionInput,
  deps: SectionCommandDeps,
): Promise<SectionCommandResult> {
  const generateId = deps.generateId ?? generateUuidV7;
  const generateOpId = deps.generateOpId ?? generateUuidV7;

  const validation = validateDomainMutation({ entity: 'section', data: { title: input.title } });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };
  const section: Section = {
    id: generateId(),
    projectId: input.projectId,
    title: input.title,
    rank: resolveRank(input.rank),
    deletedAt: null,
    clocks: {},
  };

  const changedFields = diffChangedFields(null, section, SECTION_MUTABLE_FIELDS);
  const finalSection: Section = {
    ...section,
    clocks: tickClocks(section.clocks, changedFields, hlc),
  };

  // Section не несёт `revision` (`entities/section.ts`) — `baseRevision`
  // всегда `0n`, та же конвенция, что уже применяет `writeReminder` для
  // Reminder (тоже без `revision`), см. `reminder-write.ts`.
  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'section',
    entityId: finalSection.id,
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
