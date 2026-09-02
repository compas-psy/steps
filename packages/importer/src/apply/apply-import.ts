/**
 * Применение плана импорта Todoist к хранилищу — шаг между Import Preview
 * (M47) и Import Result (M48).
 *
 * --- Почему через команды, а не одной транзакцией -------------------------
 *
 * CLAUDE.md, инвариант №1: «Единая точка входа `CreateTaskCommand` — через
 * неё идут Quick Add, импорт и все будущие адаптеры. Прямая запись в
 * хранилище запрещена». Поэтому импорт последовательно вызывает те же
 * команды, что и человек руками, и получает от них ту же валидацию.
 *
 * Следствие: импорт НЕ атомарен — каждая команда открывает свою
 * транзакцию. Это не упущение, а ровно та модель, которую описывает
 * `01§26`: страховкой служит не общая транзакция, а `import_batch_id` и
 * действие «Отменить импорт», которое работает 10 минут или до первой
 * ручной правки импортированного. Именно поэтому batch создаётся ПЕРВЫМ,
 * до единой созданной сущности: упавший на середине импорт всё равно
 * оставляет запись, по которой можно откатить сделанное.
 *
 * --- Лимиты ----------------------------------------------------------------
 *
 * `01§26`: «Import/backup/account-merge exception: migration never discards
 * data. If migration yields >10 active projects, all remain
 * readable/editable; only later create/reactivate is gated». Поэтому
 * проекты создаются с `origin: 'import'` — гейт правила 27 к ним не
 * применяется (`validation/project.ts`, `GATED_ORIGINS`).
 *
 * --- Вложения --------------------------------------------------------------
 *
 * «Комментарии Todoist.txt» (перелив описания) сегодня физически некуда
 * положить: `fileStore` во всех трёх оболочках `Unavailable` — вложения
 * это R1b (`SPEC/00 §10`). Придумывать `Attachment` со ссылкой на
 * несуществующий файл нельзя — это ложь в данных. Поэтому текст перелива
 * сохраняется БЕЗ ПОТЕРЬ в отчёте партии (`ImportBatch.reportJson`), а
 * Import Result сообщает об этом отдельной строкой. «No truncation»
 * (`01§26`) соблюдено; как только появится файловое хранилище, отчёт
 * превращается во вложение без потери данных.
 */
import { Temporal } from '@js-temporal/polyfill';
import {
  attachLabelToTaskCommand,
  createLabelCommand,
  createProjectCommand,
  createSectionCommand,
  createTaskCommand,
  generateUuidV7,
  initialRank,
  makeDurationMinutes,
  makePriority,
  rankAfter,
  type Label,
  type Rank,
  type Uuid,
} from '@shagi/core';
import type { StoragePort } from '@shagi/storage';

import type { TodoistImportPlan, TodoistProjectPlan } from '../todoist/model.js';

/** Срок действия «Отменить импорт» — `01§26`, дословно 10 минут. */
export const ROLLBACK_WINDOW_MINUTES = 10;

/** Статусы жизненного цикла партии. `@shagi/core` намеренно оставил
 * `ImportBatch.status` открытой строкой и отдал набор значений этому
 * пакету (см. комментарий `entities/import-batch.ts`). */
export const IMPORT_BATCH_STATUS = {
  applied: 'applied',
  rolledBack: 'rolled_back',
  failed: 'failed',
} as const;

export interface ApplyImportDeps {
  /**
   * Полный `StoragePort` — импорт и вызывает через него команды, и сам
   * пишет партию (`saveImportBatch`).
   *
   * Здесь тип берётся из `@shagi/storage` НАПРЯМУЮ, а не переобъявляется
   * узким портом, как это делает `@shagi/core` (ADR-0003). Причина та же,
   * что и там, но с обратным знаком: `core` не может импортировать типы
   * из `storage`, потому что `storage` уже зависит от `core` — а
   * `importer` от `core` и `storage` зависит оба, и цикла не возникает.
   * Пересечь узкие порты команд здесь всё равно невозможно: у каждого
   * своя несовместимая `applyMutation`.
   */
  readonly storage: StoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
  readonly ownerScope: Uuid;
  readonly hasProEntitlement: boolean;
  readonly generateId?: () => Uuid;
}

export interface ImportOutcome {
  readonly batchId: Uuid;
  readonly createdProjectIds: readonly Uuid[];
  readonly createdSectionIds: readonly Uuid[];
  readonly createdLabelIds: readonly Uuid[];
  readonly createdTaskIds: readonly Uuid[];
  /** Задачи, которые команда отвергла (например, слишком длинный
   * заголовок), — с причиной. Импорт не притворяется, что их не было. */
  readonly skipped: readonly { readonly title: string; readonly reason: string }[];
  readonly rollbackDeadline: Temporal.Instant;
}

/** Всё, что нужно командам, кроме их собственного среза хранилища. */
interface CommandContext {
  readonly storage: StoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
}

function nextRank(previous: Rank | null): Rank {
  return previous === null ? initialRank() : rankAfter(previous);
}

export async function applyTodoistImport(
  plan: TodoistImportPlan,
  deps: ApplyImportDeps,
): Promise<ImportOutcome> {
  const generateId = deps.generateId ?? generateUuidV7;
  const batchId = generateId();
  const rollbackDeadline = deps.now.add({ minutes: ROLLBACK_WINDOW_MINUTES });
  const context: CommandContext = {
    storage: deps.storage,
    now: deps.now,
    deviceId: deps.deviceId,
  };

  const createdProjectIds: Uuid[] = [];
  const createdSectionIds: Uuid[] = [];
  const createdLabelIds: Uuid[] = [];
  const createdTaskIds: Uuid[] = [];
  const skipped: { title: string; reason: string }[] = [];
  const overflowComments: { task: string; text: string }[] = [];

  // Партия заводится ДО первой сущности: импорт не атомарен, и оборвавшийся
  // на середине обязан оставить след, по которому его можно откатить.
  await deps.storage.runTransaction(async (tx) => {
    await tx.saveImportBatch({
      id: batchId,
      source: 'todoist_csv',
      startedAt: deps.now,
      finishedAt: null,
      rollbackDeadline,
      status: IMPORT_BATCH_STATUS.applied,
      reportJson: { projects: plan.totals.projects, tasks: plan.totals.tasks },
    });
  });

  // --- метки: одна на весь импорт, а не по метке на проект ----------------
  const labelIdByName = new Map<string, Uuid>();
  let lastLabelRank: Rank | null = null;
  const allLabels = new Set<string>();
  for (const project of plan.projects) {
    for (const task of project.tasks) for (const label of task.labels) allLabels.add(label);
  }
  for (const name of allLabels) {
    const created = await createLabelCommand(
      {
        displayName: name,
        colorToken: null,
        rank: { placement: 'explicit', rank: nextRank(lastLabelRank) },
      },
      context,
    );
    if (created.status !== 'ok') {
      skipped.push({ title: name, reason: 'label_rejected' });
      continue;
    }
    const label: Label = created.label;
    lastLabelRank = label.rank;
    labelIdByName.set(name, label.id);
    createdLabelIds.push(label.id);
  }

  let lastProjectRank: Rank | null = null;
  for (const project of plan.projects) {
    const outcome = await importProject(project, {
      context,
      deps,
      batchId,
      labelIdByName,
      projectRank: nextRank(lastProjectRank),
    });
    if (outcome === null) {
      skipped.push({ title: project.projectTitle, reason: 'project_rejected' });
      continue;
    }
    lastProjectRank = outcome.projectRank;
    createdProjectIds.push(outcome.projectId);
    createdSectionIds.push(...outcome.sectionIds);
    createdTaskIds.push(...outcome.taskIds);
    skipped.push(...outcome.skipped);
    overflowComments.push(...outcome.overflowComments);
  }

  // Отчёт партии дописывается фактом: что реально создано и что не влезло.
  await deps.storage.runTransaction(async (tx) => {
    await tx.saveImportBatch({
      id: batchId,
      source: 'todoist_csv',
      startedAt: deps.now,
      finishedAt: deps.now,
      rollbackDeadline,
      status: IMPORT_BATCH_STATUS.applied,
      reportJson: {
        projectIds: createdProjectIds,
        sectionIds: createdSectionIds,
        labelIds: createdLabelIds,
        taskIds: createdTaskIds,
        skipped,
        // Перелив комментариев — здесь, пока нет файлового хранилища
        // (см. заголовок файла). Целиком, без усечения.
        overflowComments,
      },
    });
  });

  return {
    batchId,
    createdProjectIds,
    createdSectionIds,
    createdLabelIds,
    createdTaskIds,
    skipped,
    rollbackDeadline,
  };
}

interface ProjectImportArgs {
  readonly context: CommandContext;
  readonly deps: ApplyImportDeps;
  readonly batchId: Uuid;
  readonly labelIdByName: ReadonlyMap<string, Uuid>;
  readonly projectRank: Rank;
}

interface ProjectImportOutcome {
  readonly projectId: Uuid;
  readonly projectRank: Rank;
  readonly sectionIds: readonly Uuid[];
  readonly taskIds: readonly Uuid[];
  readonly skipped: readonly { readonly title: string; readonly reason: string }[];
  readonly overflowComments: readonly { readonly task: string; readonly text: string }[];
}

async function importProject(
  plan: TodoistProjectPlan,
  args: ProjectImportArgs,
): Promise<ProjectImportOutcome | null> {
  const { context, deps, batchId, labelIdByName } = args;

  const createdProject = await createProjectCommand(
    {
      title: plan.projectTitle,
      colorToken: 'forest-800',
      defaultView: plan.defaultView,
      hasProEntitlement: deps.hasProEntitlement,
      rank: { placement: 'explicit', rank: args.projectRank },
      // Ключевая строка про лимиты — разбор в заголовке файла.
      origin: 'import',
    },
    context,
  );
  if (createdProject.status !== 'ok') return null;
  const projectId = createdProject.project.id;

  const sectionIdByName = new Map<string, Uuid>();
  const sectionIds: Uuid[] = [];
  let lastSectionRank: Rank | null = null;
  for (const name of plan.sectionNames) {
    const created = await createSectionCommand(
      { projectId, title: name, rank: { placement: 'explicit', rank: nextRank(lastSectionRank) } },
      context,
    );
    if (created.status !== 'ok') continue;
    lastSectionRank = created.section.rank;
    sectionIdByName.set(name, created.section.id);
    sectionIds.push(created.section.id);
  }

  const taskIds: Uuid[] = [];
  const skipped: { title: string; reason: string }[] = [];
  const idByRef = new Map<number, Uuid>();
  let lastTaskRank: Rank | null = null;

  // Порядок значим: родитель обязан существовать раньше ребёнка, иначе
  // валидатор отвергнет ссылку на несуществующего родителя. План идёт в
  // порядке файла, где родитель всегда выше, — но подстраховываемся явно:
  // сначала все верхнеуровневые, потом подзадачи, внутри групп — порядок
  // файла.
  const ordered = [
    ...plan.tasks.filter((task) => task.parentRef === null),
    ...plan.tasks.filter((task) => task.parentRef !== null),
  ];

  for (const task of ordered) {
    const rank = nextRank(lastTaskRank);
    const parentId = task.parentRef === null ? null : (idByRef.get(task.parentRef) ?? null);
    const sectionId =
      task.sectionName === null ? null : (sectionIdByName.get(task.sectionName) ?? null);
    const created = await createTaskCommand(
      {
        ownerScope: deps.ownerScope,
        title: task.title,
        description: task.description,
        priority: makePriority(task.priority),
        projectId,
        // Раздел ставится и подзадаче тоже. Первая версия обнуляла его у
        // детей — и валидатор отвергал КАЖДУЮ подзадачу импортируемого
        // проекта с разделами (правило 6: «projectId/sectionId подзадачи
        // равны родительским», `01§12` «Parent and direct Subtasks share
        // Project and Section»). Найдено тестом на фикстуре
        // `todoist-single`: из пяти задач доезжали три.
        sectionId,
        parentTaskId: parentId,
        captureState: 'processed',
        plannedDate: task.plannedDate === null ? null : Temporal.PlainDate.from(task.plannedDate),
        plannedTime: task.plannedTime === null ? null : Temporal.PlainTime.from(task.plannedTime),
        deadlineDate:
          task.deadlineDate === null ? null : Temporal.PlainDate.from(task.deadlineDate),
        durationMin: task.durationMin === null ? null : makeDurationMinutes(task.durationMin),
        source: 'import',
        sourceChannel: 'file',
        // Это и есть `import_batch_id` из `01§26`: по нему откат находит
        // импортированные задачи, не заводя второго поля.
        sourceCaptureBatchId: batchId,
        originalProjectNameSnapshot: plan.projectTitle,
        rank: { placement: 'explicit', rank },
      },
      context,
    );
    if (created.status !== 'ok') {
      skipped.push({ title: task.title, reason: 'task_rejected' });
      continue;
    }
    lastTaskRank = created.task.rank;
    idByRef.set(task.ref, created.task.id);
    taskIds.push(created.task.id);

    for (const labelName of task.labels) {
      const labelId = labelIdByName.get(labelName);
      if (labelId === undefined) continue;
      await attachLabelToTaskCommand(
        { taskId: created.task.id, labelId },
        { ...context, taskStorage: context.storage },
      );
    }
  }

  const overflowComments = plan.attachments.map((attachment) => ({
    task: plan.tasks.find((task) => task.ref === attachment.taskRef)?.title ?? '',
    text: attachment.text,
  }));

  return {
    projectId,
    projectRank: createdProject.project.rank,
    sectionIds,
    taskIds,
    skipped,
    overflowComments,
  };
}
