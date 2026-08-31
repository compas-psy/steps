import type { Temporal } from '@js-temporal/polyfill';

import { generateUuidV7 } from '../identity/index.js';
import type { Section } from '../entities/section.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import type { Uuid } from '../values.js';
import { updateTaskCommand } from './update-task.js';
import type { CommandStoragePort } from './storage-port.js';
import type { TaskCommandDeps } from './types.js';
import type { CommandProjectTaskReader } from './project-port.js';
import {
  buildPatchJson,
  diffChangedFields,
  pickClocks,
  tickClocks,
} from './project-section-clock.js';
import type {
  CommandSectionDomainMutation,
  CommandSectionEntityWrite,
  CommandSectionStoragePort,
} from './section-port.js';
import { SECTION_MUTABLE_FIELDS } from './section-port.js';

/**
 * `deleteSectionCommand` (`01§12` "Delete section": "Tasks move to `Без
 * раздела`; Undo restores section/ranks").
 *
 * Решение владельца по находке пакета работ E09.1 (см. историю этого
 * файла): «Без раздела» — Вариант 1, не отдельная запись в базе, а то же
 * самое `sectionId: null`, которым Task уже везде в дереве обозначает
 * "нет секции" (`TaskProjectPlacement`, `entities/task.ts`). Значит "tasks
 * move to `Без раздела`" буквально значит: у всех задач секции —
 * `sectionId: null`, через уже готовый `updateTaskCommand` (не
 * переизобретает запись Task заново, тот же приём, что уже применяет
 * `project-delete.ts` для пути «Переместить задачи во Входящие»).
 *
 * Оба статуса задачи (`active`+`completed`) — секция может исчезнуть у
 * пользователя, который уже завершил часть задач внутри неё; спека не
 * оговаривает "только активные" для Section, в отличие от отмены
 * напоминаний при архивации Project, где оговорка явная ("active tasks in
 * that Project").
 *
 * `rank` задачи НЕ пересчитывается при переносе — то же решение, что уже
 * принято в `project-delete.ts` для пути «Переместить задачи во Входящие»
 * (не изобретать здесь другое правило ради одной секции): задача просто
 * попадает в общий список "без секции" с тем рангом, который уже был.
 * Если в "Без раздела" уже есть задачи, ранги могут совпасть/перемешаться
 * по порядку — тот же задокументированный компромисс, тот же корень
 * причины (нет general-purpose "перевставить с новым рангом при слиянии
 * списков" примитива нигде в дереве пакетов).
 *
 * «Undo restores section/ranks» — эта команда сама Undo не строит (UI-
 * забота, тот же жанр, что уже 6-секундный Undo для Label, `01§13`, чужая
 * функциональность): `affectedTaskIds` в результате — материал, которого
 * будущему UI-пакету работ достаточно, чтобы восстановить секцию (снять
 * `deletedAt` через `updateSectionCommand`-подобный путь — сам rank/title
 * секции не менялся этой командой, восстанавливать нечего кроме
 * видимости) и вернуть `sectionId` каждой из этих задач обратно (ранги
 * задач тоже не менялись — восстанавливать нечего и там).
 */
export interface DeleteSectionInput {
  readonly id: Uuid;
}

export interface DeleteSectionDeps {
  readonly storage: CommandSectionStoragePort;
  readonly tasks: CommandProjectTaskReader;
  readonly taskCommandStorage: CommandStoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
  readonly generateOpId?: () => Uuid;
}

export type DeleteSectionResult =
  | {
      readonly status: 'ok';
      readonly section: Section;
      readonly affectedTaskIds: readonly Uuid[];
      readonly taskFailures: readonly Uuid[];
    }
  | { readonly status: 'not_found' };

function buildTaskCommandDeps(deps: DeleteSectionDeps): TaskCommandDeps {
  return {
    storage: deps.taskCommandStorage,
    now: deps.now,
    deviceId: deps.deviceId,
    ...(deps.generateOpId !== undefined ? { generateOpId: deps.generateOpId } : {}),
  };
}

async function tombstoneSection(
  current: Section,
  deps: Pick<DeleteSectionDeps, 'storage' | 'now' | 'deviceId' | 'generateOpId'>,
): Promise<Section> {
  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const nextSection: Section = { ...current, deletedAt: deps.now };
  const changedFields = diffChangedFields(current, nextSection, SECTION_MUTABLE_FIELDS);
  const finalSection: Section = {
    ...nextSection,
    clocks: tickClocks(current.clocks, changedFields, hlc),
  };

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

  return finalSection;
}

export async function deleteSectionCommand(
  input: DeleteSectionInput,
  deps: DeleteSectionDeps,
): Promise<DeleteSectionResult> {
  const current = await deps.storage.sections.findById(input.id);
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const [activeTasks, completedTasks] = await Promise.all([
    deps.tasks.listByProjectSection(current.projectId, current.id, 'active'),
    deps.tasks.listByProjectSection(current.projectId, current.id, 'completed'),
  ]);
  const sectionTasks = [...activeTasks, ...completedTasks];

  const taskDeps = buildTaskCommandDeps(deps);
  const affectedTaskIds: Uuid[] = [];
  const taskFailures: Uuid[] = [];
  for (const task of sectionTasks) {
    const result = await updateTaskCommand({ id: task.id, patch: { sectionId: null } }, taskDeps);
    if (result.status === 'ok') {
      affectedTaskIds.push(task.id);
    } else {
      taskFailures.push(task.id);
    }
  }

  const finalSection = await tombstoneSection(current, deps);

  return { status: 'ok', section: finalSection, affectedTaskIds, taskFailures };
}
