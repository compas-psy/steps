import type { Temporal } from '@js-temporal/polyfill';

import type { Project } from '../entities/project.js';
import type { Task } from '../entities/task.js';
import { generateUuidV7 } from '../identity/index.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import { validateDomainMutation } from '../validation/index.js';
import type { TaskValidationInput } from '../validation/task.js';
import type { ValidationResult } from '../validation/types.js';
import type { Uuid } from '../values.js';
import { buildCompletion, buildHierarchy, buildProjectPlacement, flattenTask } from './assemble.js';
import { buildPatchJson, diffChangedFields, pickClocks, tickClocks } from './clock-diff.js';
import { createTaskCommand } from './create-task.js';
import { unarchiveProjectCommand } from './project-archive.js';
import type { CommandProjectStoragePort } from './project-port.js';
import type {
  CommandDomainMutation,
  CommandEntityWrite,
  CommandStoragePort,
  NonEmptyArray,
} from './storage-port.js';
import type { TaskCommandDeps } from './types.js';

/**
 * Восстановление ЛЮБОЙ произвольной завершённой задачи из экрана
 * «Завершённые» (M36, `01§11.10` "Restore old recurrence", `01§11.11`
 * "Restore completed hierarchy") — не 6-секундный `undoCompleteOccurrenceCommand`
 * (эпик E11.1, `undo-complete-occurrence.ts`): та команда откатывает только
 * СВЕЖЕЕ завершение в окне 6 секунд и проверяет "next occurrence нетронут по
 * `revision===1n`"; эта работает в любой момент позже, произвольной давности,
 * и адресует куда более широкий набор ветвлений (состояние проекта — активный/
 * архивный/удалённый; иерархия parent/subtask; для recurring — есть ли уже
 * следующий occurrence). Ядро этого пакета работ (E12.4).
 *
 * --- Форма командного слоя (задание требует обосновать выбор) ---------------
 *
 * ОДНА команда (`restoreTaskCommand`), не несколько узко-именованных. Все
 * ветвления §11.10/§11.11 — это ответы на один и тот же вопрос
 * ("восстановить эту завершённую задачу — как именно?"), они разделяют один
 * и тот же вход (`id` завершённой задачи) и один и тот же конечный эффект
 * (снять `completed`, записать одной операцией) — раскладывать их по разным
 * функциям означало бы, что вызывающий код (`Completed.tsx`) должен сам
 * заранее знать, В КАКУЮ из пяти веток попадёт конкретная задача, чтобы
 * выбрать функцию — то есть дублировать здесь же написанную классификацию
 * снаружи. Вместо этого команда сама читает состояние (задача/родитель/
 * проект/серия) и либо восстанавливает, либо возвращает один из четырёх
 * "мне нужен явный выбор/это заблокировано" исходов — тот же приём, что уже
 * применяют `archiveProjectCommand`/`unarchiveProjectCommand` (одна команда,
 * `hadActiveTasks`/`already_archived` как наблюдаемые исходы, а не отдельные
 * функции на каждый случай).
 *
 * Выбор пользователя МЕЖДУ равноправными вариантами (архивный проект: в
 * проект или во Входящие; parent+subtask: восстановить пару или отдельную
 * задачу) — параметр входа (`archivedProjectChoice`/`hierarchyChoice`),
 * ПЕРЕДАННЫЙ вызывающим кодом, а не решение самой команды — задание прямо
 * этого требует ("UI передаёт явный выбор пользователя как параметр входа,
 * не команда сама решает"). Когда нужный выбор не передан, а ситуация его
 * требует, команда возвращает отдельный блокирующий исход
 * (`hierarchy_choice_required`/`archived_project_choice_required`) — не
 * гадает и не подставляет умолчание за пользователя.
 *
 * `describeRestoreSituation` (ниже) — отдельная, ЧИСТО читающая функция,
 * которой пользуется `Completed.tsx`, чтобы заранее (до открытия диалога)
 * узнать, какие из веток применимы к конкретной задаче, и показать только
 * подходящие варианты — не гадая на глазок, а по факту уже загруженных
 * состояний проекта/родителя/серии (задание: "собери это состояние из уже
 * загруженных данных... не гадай"). Она делит с `restoreTaskCommand`
 * ОДНУ и ту же классифицирующую функцию (`situationOf`), не дублирует
 * правила отдельным кодом, который мог бы разойтись с тем, что реально
 * проверяет запись.
 */

// --- Вход/результат -----------------------------------------------------------

export type RestoreHierarchyChoice = 'restore_pair' | 'restore_as_separate_task';
export type RestoreArchivedProjectChoice = 'restore_project' | 'restore_to_inbox';

export interface RestoreTaskInput {
  readonly id: Uuid;
  /**
   * `'restore'` (по умолчанию) — снять `completed` с самой задачи (и, если
   * применимо, её пары/проекта — см. заголовок файла). `'create_copy'` —
   * `01§11.10` "next существует → только `Создать отдельную копию`": НЕ
   * трогает завершённый occurrence (остаётся в истории как есть), вместо
   * этого создаёт новую обычную (не recurring) задачу с тем же содержимым
   * через уже готовый `createTaskCommand`. Допустима для ЛЮБОЙ recurring
   * задачи (`seriesId !== null`), не только заблокированной — спека прямо
   * требует доступности копии, когда next существует, но нигде не запрещает
   * её и когда next нет; `Completed.tsx` в объёме этого пакета работ
   * предлагает её только в заблокированном случае (дословно по §11.10), но
   * командный слой не обязан искусственно запрещать более широкое
   * использование, которое не нарушает ни один инвариант.
   */
  readonly action?: 'restore' | 'create_copy';
  /** Обязателен, когда `describeRestoreSituation` вернула
   * `hierarchyChoiceRequired: true` (parent и subtask оба завершены) —
   * иначе `{status:'hierarchy_choice_required'}`. */
  readonly hierarchyChoice?: RestoreHierarchyChoice;
  /** Обязателен, когда `describeRestoreSituation` вернула
   * `archivedProjectChoiceRequired: true` — иначе
   * `{status:'archived_project_choice_required'}`. */
  readonly archivedProjectChoice?: RestoreArchivedProjectChoice;
  /** Билинг-флаг для гейта 27/28 при `archivedProjectChoice:'restore_project'`
   * (`unarchiveProjectCommand`, "Unarchive that would exceed limit uses the
   * same gate") — та же роль, что `UnarchiveProjectInput.hasProEntitlement`.
   * Не нужен ни в одной другой ветке; по умолчанию `false`. */
  readonly hasProEntitlement?: boolean;
}

/**
 * Зависимости — Task (`CommandStoragePort`, тот же порт, что у остальных
 * task-команд) ПЛЮС Project (`CommandProjectStoragePort`, `project-port.ts`)
 * — команда обязана и прочитать состояние проекта (активный/архивный/
 * удалённый), и, в ветке `restore_project`, реально вызвать
 * `unarchiveProjectCommand` поверх него. Та же форма, что `DeleteProjectDeps`
 * (`project-delete.ts`) уже держит оба порта разом ради того же самого —
 * делегирования cross-entity работы уже готовым командам без ручного
 * дублирования их тела.
 */
export interface RestoreTaskDeps {
  readonly storage: CommandStoragePort;
  readonly projectStorage: CommandProjectStoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
  readonly generateId?: () => Uuid;
  readonly generateOpId?: () => Uuid;
}

/**
 * `tasks` — одна или две восстановленные записи: `[задача]` в обычном
 * случае и в `create_copy` (там это НОВАЯ задача, не тронутый occurrence),
 * `[parent, задача]` — только для `hierarchyChoice:'restore_pair'` (порядок
 * фиксирован: родитель первым, тот же порядок, что уже читается в
 * `01§11.11` "Восстановить родительскую и подзадачу"). `project` — проект,
 * если этим вызовом был разархивирован (`archivedProjectChoice:'restore_project'`),
 * иначе `null` — та же наблюдаемость, что `ArchiveProjectResult.project`.
 */
export type RestoreTaskResult =
  | { readonly status: 'ok'; readonly tasks: readonly Task[]; readonly project: Project | null }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' }
  /** Цель существует, но не завершена — нечего восстанавливать (тот же
   * отдельный исход, что `undoCompleteOccurrenceCommand`, не смешивается с
   * `not_found`: адрес валиден). */
  | { readonly status: 'not_completed' }
  /** `action:'create_copy'` на НЕ recurring задаче — копия имеет смысл
   * только у occurrence серии (`01§11.10`), обычная завершённая задача
   * восстанавливается напрямую, копировать её через эту ветку незачем. */
  | { readonly status: 'not_recurring' }
  /** `01§11.10` "no next → normal restore; next exists → no normal restore,
   * offer Создать отдельную копию" — БЛОКИРУЮЩИЙ исход обычного восстановления
   * (`action` отсутствует/`'restore'`), не молчаливый no-op: вызывающий код
   * обязан либо не предлагать эту кнопку, либо получить именно этот статус,
   * если всё же попытался. */
  | { readonly status: 'recurring_next_exists' }
  /** `01§11.11` "completed Parent + completed Subtask restore → choose..." —
   * `hierarchyChoice` не передан, а ситуация требует выбора. */
  | { readonly status: 'hierarchy_choice_required' }
  /** `01§11.11` "archived Project → choose..." — `archivedProjectChoice` не
   * передан, а ситуация требует выбора. */
  | { readonly status: 'archived_project_choice_required' };

// --- Ситуация: чтение без записи, общий код для UI и для самой команды -------

interface RestoreContext {
  readonly current: Task;
  /** Родитель `current`, если `current.parentTaskId !== null` — `null`,
   * если задача top-level ИЛИ родитель уже не читается (см. `parentAlive`). */
  readonly parent: Task | null;
  /** Проект `current.projectId`, если задан — `null`, если задача без
   * проекта ИЛИ проект уже не читается (см. `projectAlive`). */
  readonly project: Project | null;
  readonly parentAlive: boolean;
  readonly projectAlive: boolean;
  readonly nextOccurrenceExists: boolean;
}

async function loadRestoreContext(
  id: Uuid,
  deps: RestoreTaskDeps,
): Promise<
  | { readonly status: 'ok'; readonly context: RestoreContext }
  | { readonly status: 'not_found' | 'not_completed' }
> {
  const current = await deps.storage.tasks.findById(id);
  if (current === null || current.deletedAt !== null) {
    return { status: 'not_found' };
  }
  if (current.status !== 'completed') {
    return { status: 'not_completed' };
  }

  const parent =
    current.parentTaskId === null ? null : await deps.storage.tasks.findById(current.parentTaskId);
  const parentAlive = parent !== null && parent.deletedAt === null;

  const project =
    current.projectId === null
      ? null
      : await deps.projectStorage.projects.findById(current.projectId);
  const projectAlive = project !== null && project.deletedAt === null;

  const nextOccurrenceExists =
    current.seriesId === null
      ? false
      : (await deps.storage.tasks.listBySeries(current.seriesId, 'active')).length > 0;

  return {
    status: 'ok',
    context: { current, parent, project, parentAlive, projectAlive, nextOccurrenceExists },
  };
}

/** Флаги ситуации — какие ветки §11.10/§11.11 применимы к этой задаче ПРЯМО
 * СЕЙЧАС (по уже прочитанному состоянию). Ровно один источник истины: и
 * `describeRestoreSituation` (для UI), и `restoreTaskCommand` (для записи)
 * читают эти же флаги, вместо того чтобы классификация была продублирована
 * двумя независимыми кусками кода, которые могли бы разойтись. */
interface RestoreSituationFlags {
  readonly recurringBlocked: boolean;
  readonly hierarchyChoiceRequired: boolean;
  readonly archivedProjectChoiceRequired: boolean;
  /** Информационные — восстановление в эту ветку НЕ требует выбора
   * (автоматическое поведение), но UI может показать поясняющий текст. */
  readonly deletedParentAutoTopLevel: boolean;
  readonly deletedProjectAutoInbox: boolean;
}

function situationOf(context: RestoreContext): RestoreSituationFlags {
  const { current, parent, project, parentAlive, projectAlive, nextOccurrenceExists } = context;
  return {
    recurringBlocked: current.seriesId !== null && nextOccurrenceExists,
    hierarchyChoiceRequired: parentAlive && parent!.status === 'completed',
    archivedProjectChoiceRequired: projectAlive && project!.archivedAt !== null,
    deletedParentAutoTopLevel: current.parentTaskId !== null && !parentAlive,
    deletedProjectAutoInbox: current.projectId !== null && !projectAlive,
  };
}

export type RestoreSituationResult =
  | ({ readonly status: 'ok' } & RestoreSituationFlags)
  | { readonly status: 'not_found' }
  | { readonly status: 'not_completed' };

/**
 * Только чтение — вызывается `Completed.tsx` ПЕРЕД показом диалога, чтобы
 * собрать набор применимых вариантов из уже прочитанного состояния задачи/
 * родителя/проекта/серии (задание: "не гадай на глазок"), не дублируя
 * классификацию в UI-коде.
 */
export async function describeRestoreSituation(
  id: Uuid,
  deps: RestoreTaskDeps,
): Promise<RestoreSituationResult> {
  const loaded = await loadRestoreContext(id, deps);
  if (loaded.status !== 'ok') {
    return loaded;
  }
  return { status: 'ok', ...situationOf(loaded.context) };
}

// --- Создание отдельной копии (`01§11.10`, `action:'create_copy'`) -----------

/**
 * `01§11.10` "Создать отдельную копию" — та же content-копия, что задание
 * пакета работ дословно перечисляет: title/priority/project/section/
 * planned/deadline, БЕЗ `seriesId`/`occurrenceSeq` (обычная одноразовая
 * задача). Прочие поля планирования (`availableFrom`/`durationMin`/
 * `focusDate`/`dayBucket`) — вне этого перечня, остаются на умолчаниях
 * `createTaskCommand` (не скопированы) — намеренно уже, чем "скопировать
 * вообще всё", ровно по букве задания, не по более широкому "разумному"
 * толкованию.
 *
 * `rank`: `{placement:'explicit', rank: current.rank}` — команда, по
 * решению E01.4 (`rank-input.ts`), никогда сама не обходит список соседей
 * (не знает, в какой список копия должна попасть), а здесь неоткуда взять
 * соседей вызывающего экрана; переиспользование ранга завершённого
 * occurrence — валидный `Rank` без похода в хранилище за соседями, тот же
 * компромисс, что уже принят в этом дереве пакетов для похожих ситуаций
 * (не идеальная позиция, но корректное, не бьющее инвариант значение).
 *
 * `source:'user'` — копия создаётся ЯВНЫМ действием человека в UI
 * (`Completed.tsx`), не движком повторов (`source:'recurrence'` — это для
 * occurrence, которые генерирует `completeOccurrenceCommand`, не для этого
 * пути).
 */
async function createSeparateCopy(
  current: Task,
  deps: RestoreTaskDeps,
): Promise<RestoreTaskResult> {
  const taskDeps: TaskCommandDeps = {
    storage: deps.storage,
    now: deps.now,
    deviceId: deps.deviceId,
    ...(deps.generateId !== undefined ? { generateId: deps.generateId } : {}),
    ...(deps.generateOpId !== undefined ? { generateOpId: deps.generateOpId } : {}),
  };

  const created = await createTaskCommand(
    {
      ownerScope: current.ownerScope,
      title: current.title,
      description: current.description,
      priority: current.priority,
      projectId: current.projectId,
      sectionId: current.sectionId,
      captureState: current.captureState,
      plannedDate: current.plannedDate,
      plannedTime: current.plannedTime,
      deadlineDate: current.deadlineDate,
      deadlineTime: current.deadlineTime,
      source: 'user',
      rank: { placement: 'explicit', rank: current.rank },
    },
    taskDeps,
  );

  if (created.status === 'rejected') {
    return { status: 'rejected', validation: created.validation };
  }
  if (created.status !== 'ok') {
    throw new Error(
      'restoreTaskCommand/createSeparateCopy: createTaskCommand вернул недостижимый статус ' +
        '"not_found" — эта команда никогда так не отвечает при создании.',
    );
  }
  return { status: 'ok', tasks: [created.task], project: null };
}

// --- Обычное восстановление (`action` отсутствует/`'restore'`) ---------------

/** Единая форма итога резолюции проекта — обе ветки, требующие "снять
 * проект" (удалённый проект И `archivedProjectChoice:'restore_to_inbox'`),
 * приводят к одному и тому же эффекту записи (см. заголовок файла, блок про
 * `captureState`), поэтому здесь одна дискриминация на два, а не три исхода. */
type ProjectResolution = { readonly kind: 'unchanged' } | { readonly kind: 'clear' };

interface ProjectResolutionOutcome {
  readonly status: 'ok';
  readonly resolution: ProjectResolution;
  readonly unarchivedProject: Project | null;
}

async function resolveProject(
  context: RestoreContext,
  input: RestoreTaskInput,
  deps: RestoreTaskDeps,
): Promise<
  | ProjectResolutionOutcome
  | { readonly status: 'archived_project_choice_required' }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
> {
  const { current, project, projectAlive } = context;
  if (current.projectId === null) {
    return { status: 'ok', resolution: { kind: 'unchanged' }, unarchivedProject: null };
  }
  if (!projectAlive) {
    // Удалённый (tombstone) проект — `01§11.11` "restore top-level into
    // Inbox, retaining former Project snapshot in history": снимок
    // (`originalProjectNameSnapshot`) уже на задаче, эта функция его не
    // трогает (см. `restoreTaskCommand`, сборка итоговой записи).
    return { status: 'ok', resolution: { kind: 'clear' }, unarchivedProject: null };
  }
  if (project!.archivedAt === null) {
    return { status: 'ok', resolution: { kind: 'unchanged' }, unarchivedProject: null };
  }
  // Архивный проект — выбор обязателен (см. заголовок файла).
  if (input.archivedProjectChoice === undefined) {
    return { status: 'archived_project_choice_required' };
  }
  if (input.archivedProjectChoice === 'restore_to_inbox') {
    return { status: 'ok', resolution: { kind: 'clear' }, unarchivedProject: null };
  }
  // 'restore_project' — сначала разархивировать сам проект (готовая команда,
  // тот же гейт 27/28, что и у прямого "Разархивировать").
  const unarchiveResult = await unarchiveProjectCommand(
    { id: project!.id, hasProEntitlement: input.hasProEntitlement ?? false },
    {
      storage: deps.projectStorage,
      now: deps.now,
      deviceId: deps.deviceId,
      ...(deps.generateOpId !== undefined ? { generateOpId: deps.generateOpId } : {}),
    },
  );
  if (unarchiveResult.status === 'rejected') {
    return { status: 'rejected', validation: unarchiveResult.validation };
  }
  const unarchivedProject = unarchiveResult.status === 'ok' ? unarchiveResult.project : project!;
  return { status: 'ok', resolution: { kind: 'unchanged' }, unarchivedProject };
}

/** Один пункт плана записи — задача, которую нужно перевести в `active`, и
 * решение, обрывать ли её `parentTaskId` (становится top-level) при записи. */
interface RestorePlanEntry {
  readonly task: Task;
  readonly clearParent: boolean;
}

type HierarchyPlanResult =
  | { readonly status: 'ok'; readonly entries: readonly [RestorePlanEntry, ...RestorePlanEntry[]] }
  | { readonly status: 'hierarchy_choice_required' };

/**
 * `01§11.11` — планирует, СКОЛЬКО и КАКИХ задач затрагивает восстановление:
 *  - top-level задача (не subtask) → сама, без изменения иерархии;
 *  - subtask, родитель удалён (tombstone) → сама, top-level (`01§11.11`
 *    "deleted Parent → restore selected Subtask as top-level");
 *  - subtask, родитель жив и `active` → сама, child как был (обычное дело —
 *    завершённый subtask под активным parent никогда не был запрещён,
 *    инвариант ТОЛЬКО про АКТИВНОГО child под ЗАВЕРШЁННЫМ parent);
 *  - subtask, родитель жив и `completed` → ЗДЕСЬ и только здесь работает
 *    "Active child under completed Parent is never created" (см. заголовок
 *    файла, блок про блокировку): без `hierarchyChoice` — блокирующий исход,
 *    не запись; `restore_as_separate_task` — сама, top-level (родитель
 *    остаётся завершённым, НЕ тронут); `restore_pair` — родитель И subtask
 *    вместе, subtask остаётся child (родитель тоже становится `active`, так
 *    что "активный child под завершённым parent" в записи просто не
 *    возникает — по построению, не по дополнительной проверке).
 */
function planHierarchy(context: RestoreContext, input: RestoreTaskInput): HierarchyPlanResult {
  const { current, parent, parentAlive } = context;
  if (current.parentTaskId === null) {
    return { status: 'ok', entries: [{ task: current, clearParent: false }] };
  }
  if (!parentAlive) {
    return { status: 'ok', entries: [{ task: current, clearParent: true }] };
  }
  if (parent!.status === 'active') {
    return { status: 'ok', entries: [{ task: current, clearParent: false }] };
  }
  // parent жив и завершён — требуется явный выбор.
  if (input.hierarchyChoice === undefined) {
    return { status: 'hierarchy_choice_required' };
  }
  if (input.hierarchyChoice === 'restore_as_separate_task') {
    return { status: 'ok', entries: [{ task: current, clearParent: true }] };
  }
  return {
    status: 'ok',
    entries: [
      { task: parent!, clearParent: false },
      { task: current, clearParent: false },
    ],
  };
}

/** Плоский вход валидатора для одной восстанавливаемой записи — та же
 * сборка, что `undoCompleteOccurrenceCommand`, плюс переопределение
 * иерархии/проекта/`captureState` по уже принятому плану. */
function restoredValidationInput(
  entry: RestorePlanEntry,
  resolution: ProjectResolution,
): TaskValidationInput {
  const { task, clearParent } = entry;
  const isTopLevel = clearParent || task.parentTaskId === null;
  const projectId = resolution.kind === 'clear' ? null : task.projectId;
  const sectionId = resolution.kind === 'clear' ? null : task.sectionId;
  // `01§12` "moving top-level Task to Inbox... sets capture_state=inbox" —
  // тот же принцип, что уже применяет `deleteProjectKeepingTasksCommand`:
  // только top-level запись уходит в `inbox`, subtask остаётся `processed`
  // (инвариант `TaskHierarchy` и так этого требует для любого child).
  const captureState =
    resolution.kind === 'clear' ? (isTopLevel ? 'inbox' : 'processed') : task.captureState;
  return {
    ...flattenTask(task),
    parentTaskId: clearParent ? null : task.parentTaskId,
    captureState,
    projectId,
    sectionId,
    status: 'active',
    completedAt: null,
    completionKind: null,
  };
}

export async function restoreTaskCommand(
  input: RestoreTaskInput,
  deps: RestoreTaskDeps,
): Promise<RestoreTaskResult> {
  const loaded = await loadRestoreContext(input.id, deps);
  if (loaded.status !== 'ok') {
    return loaded;
  }
  const { context } = loaded;
  const { current } = context;

  if (input.action === 'create_copy') {
    if (current.seriesId === null) {
      return { status: 'not_recurring' };
    }
    return createSeparateCopy(current, deps);
  }

  const situation = situationOf(context);
  if (situation.recurringBlocked) {
    return { status: 'recurring_next_exists' };
  }

  const hierarchyPlan = planHierarchy(context, input);
  if (hierarchyPlan.status !== 'ok') {
    return hierarchyPlan;
  }

  const projectOutcome = await resolveProject(context, input, deps);
  if (projectOutcome.status !== 'ok') {
    return projectOutcome;
  }

  // --- Валидация ВСЕХ затронутых записей до единой записи (fail-closed) -----
  for (const entry of hierarchyPlan.entries) {
    const validationInput = restoredValidationInput(entry, projectOutcome.resolution);
    const validationContext = await deps.storage.tasks.loadValidationContext(
      entry.task.id,
      entry.clearParent ? null : entry.task.parentTaskId,
    );
    const validation = validateDomainMutation({
      entity: 'task',
      data: validationInput,
      context: validationContext,
    });
    if (!validation.valid) {
      return { status: 'rejected', validation };
    }
  }

  // --- Сборка + запись: ОДНА транзакция на всю пару, не последовательные ---
  // (см. заголовок файла — здесь ничего не делегируется другой узкой
  // команде, поэтому запись parent+subtask в одной `CommandDomainMutation`
  // — настоящая атомарность, не задокументированный компромисс, принятый
  // в остальных местах этого дерева пакетов при делегировании).
  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const hlc = { physical: deps.now, logical: 0, deviceId: deps.deviceId };

  const writes: CommandEntityWrite[] = [];
  const outboxEntries: SyncOutboxEntry[] = [];
  const restoredTasks: Task[] = [];

  for (const entry of hierarchyPlan.entries) {
    const { task, clearParent } = entry;
    const isTopLevel = clearParent || task.parentTaskId === null;
    const projectId = projectOutcome.resolution.kind === 'clear' ? null : task.projectId;
    const sectionId = projectOutcome.resolution.kind === 'clear' ? null : task.sectionId;
    const captureState =
      projectOutcome.resolution.kind === 'clear'
        ? isTopLevel
          ? 'inbox'
          : 'processed'
        : task.captureState;
    const parentTaskId = clearParent ? null : task.parentTaskId;

    const nextTask: Task = {
      ...task,
      ...buildHierarchy({
        parentTaskId,
        captureState,
        seriesId: task.seriesId,
        occurrenceSeq: task.occurrenceSeq,
        generatedFromOccurrenceId: task.generatedFromOccurrenceId,
      }),
      ...buildProjectPlacement({ projectId, sectionId }),
      ...buildCompletion({ status: 'active', completedAt: null, completionKind: null }),
      updatedAt: deps.now,
      revision: task.revision + 1n,
    };
    const changedFields = diffChangedFields(task, nextTask);
    const finalTask: Task = { ...nextTask, clocks: tickClocks(task.clocks, changedFields, hlc) };

    writes.push({ entity: 'task', value: finalTask });
    outboxEntries.push({
      opId: generateOpId(),
      deviceId: deps.deviceId,
      entityType: 'task',
      entityId: task.id,
      patchJson: buildPatchJson(finalTask, changedFields),
      fieldClocksJson: pickClocks(finalTask.clocks, changedFields),
      baseRevision: task.revision,
      createdAt: deps.now,
      retryCount: 0,
    });
    restoredTasks.push(finalTask);
  }

  const [firstOutboxEntry, ...restOutboxEntries] = outboxEntries;
  if (firstOutboxEntry === undefined) {
    throw new Error('restoreTaskCommand: план восстановления пуст — недостижимо, entries непусто.');
  }
  const outbox: NonEmptyArray<SyncOutboxEntry> = [firstOutboxEntry, ...restOutboxEntries];
  const mutation: CommandDomainMutation = { writes, outbox };
  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });

  return { status: 'ok', tasks: restoredTasks, project: projectOutcome.unarchivedProject };
}
