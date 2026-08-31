import type { Project, ProjectDefaultView } from '../entities/project.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import type { ProjectValidationInput } from '../validation/project.js';
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
import { PROJECT_MUTABLE_FIELDS } from './project-port.js';
import type { ProjectCommandResult } from './project-port.js';

/**
 * Вход `createProjectCommand` — единая точка входа для создания Project
 * (`01§12` "Create/edit"). `title` обязателен, `colorToken` —
 * контролируемая палитра (непрозрачный ключ на уровне типа `Project`,
 * каталог значений — собственность `@shagi/ui`, эта команда не решает,
 * какие значения валидны — `validateProject`/`entities/project.ts` тоже не
 * проверяют содержимое строки, только длину title/description; белый
 * список цветов не territory этой команды, задание прямо запрещает его
 * изобретать здесь).
 *
 * `hasProEntitlement` — billing-флаг, вычисленный вызывающим слоем (`03§11`,
 * тот же контракт, что `ProjectValidationContext.hasProEntitlement`),
 * приходит сюда уже готовым — эта команда не решает биллинг.
 */
export interface CreateProjectInput {
  readonly title: string;
  readonly description?: string;
  readonly colorToken: string;
  readonly icon?: string | null;
  readonly defaultView: ProjectDefaultView;
  readonly favorite?: boolean;
  readonly hasProEntitlement: boolean;
  readonly rank: NewRank;
}

/**
 * Правило 27 (Free-лимит 10 активных) / 28 (потолок 500): команда обязана
 * посчитать `activeProjectCountExcludingThis` **перед** вызовом валидатора
 * и передать готовое число — `validateProject` не считает сама (задание,
 * раздел Project: "команда обязана посчитать... ПЕРЕД вызовом валидатора").
 * `excludingId=null`, потому что создаётся новый проект — считает все
 * существующие активные (`ProjectRepository.countActiveExcluding`
 * контракт, `project-repository.ts`).
 */
export async function createProjectCommand(
  input: CreateProjectInput,
  deps: ProjectCommandDeps,
): Promise<ProjectCommandResult> {
  const generateId = deps.generateId ?? generateUuidV7;
  const generateOpId = deps.generateOpId ?? generateUuidV7;

  const description = input.description ?? '';
  const icon = input.icon ?? null;
  const favorite = input.favorite ?? false;

  const activeProjectCountExcludingThis = await deps.storage.projects.countActiveExcluding(null);

  const validationInput: ProjectValidationInput = { title: input.title, description };
  const validation = validateDomainMutation({
    entity: 'project',
    data: validationInput,
    context: {
      origin: 'create',
      activeProjectCountExcludingThis,
      hasProEntitlement: input.hasProEntitlement,
    },
  });
  if (!validation.valid) {
    return { status: 'rejected', validation };
  }

  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };
  const project: Project = {
    id: generateId(),
    title: input.title,
    description,
    colorToken: input.colorToken,
    icon,
    defaultView: input.defaultView,
    favorite,
    archivedAt: null,
    rank: resolveRank(input.rank),
    createdAt: deps.now,
    updatedAt: deps.now,
    deletedAt: null,
    clocks: {},
  };

  const changedFields = diffChangedFields(null, project, PROJECT_MUTABLE_FIELDS);
  const finalProject: Project = {
    ...project,
    clocks: tickClocks(project.clocks, changedFields, hlc),
  };

  // Project не несёт `revision` (`entities/project.ts`, в отличие от Task)
  // — `baseRevision` всегда `0n`, та же конвенция, что `writeReminder`
  // (`reminder-write.ts`) и `createSectionCommand` (`section-create.ts`).
  const outboxEntry: SyncOutboxEntry = {
    opId: generateOpId(),
    deviceId: deps.deviceId,
    entityType: 'project',
    entityId: finalProject.id,
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
