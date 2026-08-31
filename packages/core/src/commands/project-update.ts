import type { Project, ProjectDefaultView } from '../entities/project.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import type { ProjectValidationInput } from '../validation/project.js';
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
  CommandProjectDomainMutation,
  CommandProjectEntityWrite,
  ProjectCommandDeps,
} from './project-port.js';
import { PROJECT_MUTABLE_FIELDS, UNGATED_PROJECT_ORIGIN } from './project-port.js';
import type { ProjectCommandResult } from './project-port.js';

/**
 * Частичный патч Project (`01§12` "Create/edit" — редактирование).
 * `favorite` — тоже здесь, не отдельная команда: "Favorite project appears
 * in favorites area; entity is not duplicated" (`01§12`) буквально значит,
 * что избранное — обычное булево поле на Project, редактируемое тем же
 * путём, что и остальные (задание, раздел Project: "редактирование через
 * тот же updateProjectCommand, не отдельная команда").
 *
 * `archivedAt` **не входит** в этот патч — жизненный цикл архивации целиком
 * принадлежит `archiveProjectCommand`/`unarchiveProjectCommand`
 * (`project-archive.ts`): смешивать сюда означало бы дублировать проверку
 * лимита 27/28 (гейтится только при unarchive) в двух местах, тот же
 * принцип, что уже развёл `UpdateTaskPatch` и `completeTaskCommand`.
 *
 * Каждое поле — `?`, отсутствие ключа означает "не трогать" (та же
 * конвенция, что `UpdateTaskPatch`, `update-task.ts`); `icon` явно nullable
 * — `patch.icon === null` значит "убрать иконку", отличимо от "не тронут"
 * через `'icon' in patch`.
 */
export interface UpdateProjectPatch {
  readonly title?: string;
  readonly description?: string;
  readonly colorToken?: string;
  readonly icon?: string | null;
  readonly defaultView?: ProjectDefaultView;
  readonly favorite?: boolean;
  readonly rank?: NewRank;
}

export interface UpdateProjectInput {
  readonly id: Uuid;
  readonly patch: UpdateProjectPatch;
}

export async function updateProjectCommand(
  input: UpdateProjectInput,
  deps: ProjectCommandDeps,
): Promise<ProjectCommandResult> {
  const current = await deps.storage.projects.findById(input.id);
  // Tombstone — не пользовательская цель новой мутации (то же соглашение,
  // что у `updateTaskCommand`).
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }

  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const patch = input.patch;

  const title = patch.title ?? current.title;
  const description = patch.description ?? current.description;
  const colorToken = patch.colorToken ?? current.colorToken;
  const icon = 'icon' in patch ? (patch.icon ?? null) : current.icon;
  const defaultView = patch.defaultView ?? current.defaultView;
  const favorite = patch.favorite ?? current.favorite;

  const validationInput: ProjectValidationInput = { title, description };
  // Обычная правка полей не меняет число активных проектов — правило 27/28
  // не может здесь сработать по построению (см. `UNGATED_PROJECT_ORIGIN`,
  // `project-port.ts`), поэтому `activeProjectCountExcludingThis` не
  // требует отдельного storage-вызова: любое значение даёт тот же
  // `ValidationResult` при негейтящемся `origin`, `0` — самое дешёвое.
  const validation = validateDomainMutation({
    entity: 'project',
    data: validationInput,
    context: {
      origin: UNGATED_PROJECT_ORIGIN,
      activeProjectCountExcludingThis: 0,
      hasProEntitlement: false,
    },
  });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const rank = patch.rank !== undefined ? resolveRank(patch.rank) : current.rank;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const nextProject: Project = {
    ...current,
    title,
    description,
    colorToken,
    icon,
    defaultView,
    favorite,
    rank,
    updatedAt: deps.now,
  };

  const changedFields = diffChangedFields(current, nextProject, PROJECT_MUTABLE_FIELDS);
  const finalProject: Project = {
    ...nextProject,
    clocks: tickClocks(current.clocks, changedFields, hlc),
  };

  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'project',
    entityId: current.id,
    patchJson: buildPatchJson(finalProject, changedFields),
    fieldClocksJson: pickClocks(finalProject.clocks, changedFields),
    baseRevision: 0n,
    createdAt: deps.now,
    retryCount: 0,
  };

  const write: CommandProjectEntityWrite = { entity: 'project', value: finalProject };
  const mutation: CommandProjectDomainMutation = { writes: [write], outbox: [outboxEntry] };

  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return { status: 'ok', project: finalProject };
}
