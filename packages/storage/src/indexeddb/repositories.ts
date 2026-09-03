import { Temporal } from '@js-temporal/polyfill';
import {
  isTaskLabelActive,
  type CaptureState,
  type LabelValidationContext,
  type TaskParentSnapshot,
  type TaskValidationContext,
  type Uuid,
} from '@shagi/core';

import type {
  AttachmentRepository,
  ChecklistItemRepository,
  ImportBatchRepository,
  LabelRepository,
  ProjectRepository,
  RecurrenceSeriesRepository,
  ReminderRepository,
  SectionRepository,
  StorageQueryPort,
  SyncConflictRepository,
  SyncOutboxRepository,
  TaskLabelRepository,
  TaskLinkRepository,
  TaskRepository,
} from '../ports/index.js';

import {
  decodeAttachment,
  decodeChecklistItem,
  decodeImportBatch,
  decodeLabel,
  decodeProject,
  decodeRecurrenceSeries,
  decodeReminder,
  decodeSection,
  decodeSyncConflict,
  decodeSyncOutboxEntry,
  decodeTask,
  decodeTaskLabel,
  decodeTaskLink,
  type StoredAttachment,
  type StoredChecklistItem,
  type StoredImportBatch,
  type StoredLabel,
  type StoredProject,
  type StoredRecurrenceSeries,
  type StoredReminder,
  type StoredSection,
  type StoredSyncConflict,
  type StoredSyncOutboxEntry,
  type StoredTask,
  type StoredTaskLabel,
  type StoredTaskLink,
} from './codec.js';
import { getAllFromStore, getByKey, type StoreAccess } from './store-access.js';

/**
 * Реализация тринадцати read-репозиториев `StorageQueryPort` поверх
 * IndexedDB (задание пакета работ E02.3, п.2). Стратегия сознательно
 * простая: прочитать ВЕСЬ store (`getAllFromStore` — `IDBObjectStore.getAll()`,
 * без ручного курсора), декодировать (`./codec.ts`) и отфильтровать/
 * отсортировать в JS — теми же предикатами, что уже проверены общим
 * контрактом на эталонной реализации в памяти (`../memory/repositories.ts`
 * — методы этого файла написаны как её прямое зеркало, метод за методом,
 * не заново придуманная логика).
 *
 * Это не use maximum-эффективности IndexedDB (в проде эти методы стоило бы
 * провести через `IDBIndex` с диапазонами по `../schema/indexes.ts`, не
 * через `getAll()` + `Array#filter`), а сознательный выбор в пользу
 * ПРОВЕРЯЕМОЙ корректности сейчас: `runStorageContract` — источник истины
 * поведения, и зеркалирование уже проверенной им реализации сводит риск
 * "адаптер тонко разошёлся с контрактом" почти к нулю. Перевод на
 * `IDBIndex`-диапазоны без изменения наблюдаемого поведения — последующая
 * оптимизация, не предмет этого пакета работ (см. отчёт E02.3).
 */

function isAlive<T extends { deletedAt: Temporal.Instant | null }>(record: T): boolean {
  return record.deletedAt === null;
}

function compareNullableDate(a: Temporal.PlainDate | null, b: Temporal.PlainDate | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return Temporal.PlainDate.compare(a, b);
}

function compareRank(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareId(a: Uuid, b: Uuid): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareNullableOccurrenceSeq(a: bigint | null, b: bigint | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

async function allTasks(access: StoreAccess) {
  const rows = await getAllFromStore<StoredTask>(access, 'tasks');
  return rows.map(decodeTask);
}
async function allProjects(access: StoreAccess) {
  const rows = await getAllFromStore<StoredProject>(access, 'projects');
  return rows.map(decodeProject);
}
async function allSections(access: StoreAccess) {
  const rows = await getAllFromStore<StoredSection>(access, 'sections');
  return rows.map(decodeSection);
}
async function allLabels(access: StoreAccess) {
  const rows = await getAllFromStore<StoredLabel>(access, 'labels');
  return rows.map(decodeLabel);
}
async function allTaskLabels(access: StoreAccess) {
  const rows = await getAllFromStore<StoredTaskLabel>(access, 'task_labels');
  return rows.map(decodeTaskLabel);
}
async function allChecklistItems(access: StoreAccess) {
  const rows = await getAllFromStore<StoredChecklistItem>(access, 'checklist_items');
  return rows.map(decodeChecklistItem);
}
async function allReminders(access: StoreAccess) {
  const rows = await getAllFromStore<StoredReminder>(access, 'reminders');
  return rows.map(decodeReminder);
}
async function allAttachments(access: StoreAccess) {
  const rows = await getAllFromStore<StoredAttachment>(access, 'attachments');
  return rows.map(decodeAttachment);
}
async function allTaskLinks(access: StoreAccess) {
  const rows = await getAllFromStore<StoredTaskLink>(access, 'task_links');
  return rows.map(decodeTaskLink);
}
async function allSyncOutbox(access: StoreAccess) {
  const rows = await getAllFromStore<StoredSyncOutboxEntry>(access, 'sync_outbox');
  return rows.map(decodeSyncOutboxEntry);
}
async function allSyncConflicts(access: StoreAccess) {
  const rows = await getAllFromStore<StoredSyncConflict>(access, 'sync_conflicts');
  return rows.map(decodeSyncConflict);
}

async function countChecklistItemsByTask(access: StoreAccess, taskId: Uuid): Promise<number> {
  const items = await allChecklistItems(access);
  return items.filter((item) => item.taskId === taskId && isAlive(item)).length;
}
async function countActiveTaskLabelsByTask(access: StoreAccess, taskId: Uuid): Promise<number> {
  const links = await allTaskLabels(access);
  return links.filter((link) => link.taskId === taskId && isTaskLabelActive(link)).length;
}
// `reminder.enabled` — правило 19 (`02§2`) считает ACTIVE explicit
// reminder'ы, не строки за всю историю задачи: `cancelReminderCommand`
// (`@shagi/core`) пишет `enabled:false`, а не удаляет запись физически —
// без этого фильтра отменённая запись продолжала бы блокировать создание
// нового active explicit reminder, ломая штатный edit-flow (cancel
// старого → create нового). Найдено живым прогоном Task B8 (Android
// emulator smoke, Step 2c).
async function countExplicitRemindersByTask(access: StoreAccess, taskId: Uuid): Promise<number> {
  const reminders = await allReminders(access);
  return reminders.filter(
    (reminder) => reminder.taskId === taskId && reminder.kind === 'explicit' && reminder.enabled,
  ).length;
}
async function countTaskLinksByTask(access: StoreAccess, taskId: Uuid): Promise<number> {
  const links = await allTaskLinks(access);
  return links.filter((link) => link.taskId === taskId).length;
}
async function countActiveAttachmentsByTask(access: StoreAccess, taskId: Uuid): Promise<number> {
  const attachments = await allAttachments(access);
  return attachments.filter(
    (attachment) => attachment.taskId === taskId && attachment.state !== 'deleted',
  ).length;
}

async function computeParentSnapshot(
  access: StoreAccess,
  parentTaskId: Uuid,
): Promise<TaskParentSnapshot | null> {
  const parentRow = await getByKey<StoredTask>(access, 'tasks', parentTaskId);
  if (parentRow === undefined) return null;
  const parent = decodeTask(parentRow);
  if (!isAlive(parent)) return null;

  const tasks = await allTasks(access);
  const directSubtaskCount = tasks.filter(
    (task) => isAlive(task) && task.parentTaskId === parentTaskId,
  ).length;

  return {
    id: parent.id,
    projectId: parent.projectId,
    sectionId: parent.sectionId,
    parentTaskId: parent.parentTaskId,
    directSubtaskCount,
  };
}

export function createTaskRepository(access: StoreAccess): TaskRepository {
  return {
    async findById(id) {
      const row = await getByKey<StoredTask>(access, 'tasks', id);
      return row === undefined ? null : decodeTask(row);
    },

    async listByStatusAndPlannedDate(status) {
      const tasks = await allTasks(access);
      return tasks
        .filter((task) => isAlive(task) && task.status === status)
        .toSorted(
          (a, b) => compareNullableDate(a.plannedDate, b.plannedDate) || compareId(a.id, b.id),
        );
    },

    async listByStatusAndDeadlineDate(status) {
      const tasks = await allTasks(access);
      return tasks
        .filter((task) => isAlive(task) && task.status === status)
        .toSorted(
          (a, b) => compareNullableDate(a.deadlineDate, b.deadlineDate) || compareId(a.id, b.id),
        );
    },

    async listByCaptureStateAndStatus(captureState: CaptureState, status) {
      const tasks = await allTasks(access);
      return tasks
        .filter(
          (task) => isAlive(task) && task.captureState === captureState && task.status === status,
        )
        .toSorted(
          (a, b) => Temporal.Instant.compare(a.createdAt, b.createdAt) || compareId(a.id, b.id),
        );
    },

    async listByProjectSection(projectId, sectionId, status) {
      const tasks = await allTasks(access);
      return tasks
        .filter(
          (task) =>
            isAlive(task) &&
            task.status === status &&
            task.projectId === projectId &&
            task.sectionId === sectionId,
        )
        .toSorted((a, b) => compareRank(a.rank, b.rank));
    },

    async listDirectSubtasks(parentTaskId, status) {
      const tasks = await allTasks(access);
      return tasks
        .filter(
          (task) => isAlive(task) && task.status === status && task.parentTaskId === parentTaskId,
        )
        .toSorted((a, b) => compareRank(a.rank, b.rank));
    },

    async listByFocusDate(focusDate, status) {
      const tasks = await allTasks(access);
      return tasks
        .filter(
          (task) =>
            isAlive(task) &&
            task.status === status &&
            task.focusDate !== null &&
            task.focusDate.equals(focusDate),
        )
        .toSorted((a, b) => compareRank(a.rank, b.rank));
    },

    async listBySeries(seriesId, status) {
      const tasks = await allTasks(access);
      return tasks
        .filter((task) => isAlive(task) && task.status === status && task.seriesId === seriesId)
        .toSorted((a, b) => compareNullableOccurrenceSeq(a.occurrenceSeq, b.occurrenceSeq));
    },

    async countDirectSubtasks(parentTaskId) {
      const tasks = await allTasks(access);
      return tasks.filter((task) => isAlive(task) && task.parentTaskId === parentTaskId).length;
    },

    async loadParentSnapshot(parentTaskId) {
      return computeParentSnapshot(access, parentTaskId);
    },

    async loadValidationContext(id, parentTaskId) {
      const parent =
        parentTaskId === null ? null : await computeParentSnapshot(access, parentTaskId);

      const context: TaskValidationContext = {
        id,
        parent,
        checklistItemCount: id === null ? 0 : await countChecklistItemsByTask(access, id),
        labelCount: id === null ? 0 : await countActiveTaskLabelsByTask(access, id),
        explicitReminderCount: id === null ? 0 : await countExplicitRemindersByTask(access, id),
        linkCount: id === null ? 0 : await countTaskLinksByTask(access, id),
        attachmentCount: id === null ? 0 : await countActiveAttachmentsByTask(access, id),
      };
      return context;
    },
  };
}

export function createProjectRepository(access: StoreAccess): ProjectRepository {
  return {
    async findById(id) {
      const row = await getByKey<StoredProject>(access, 'projects', id);
      return row === undefined ? null : decodeProject(row);
    },
    async listActive() {
      const projects = await allProjects(access);
      return projects
        .filter((project) => isAlive(project) && project.archivedAt === null)
        .toSorted((a, b) => compareRank(a.rank, b.rank));
    },
    async countActiveExcluding(excludingId) {
      const projects = await allProjects(access);
      return projects.filter(
        (project) => project.id !== excludingId && isAlive(project) && project.archivedAt === null,
      ).length;
    },
  };
}

export function createSectionRepository(access: StoreAccess): SectionRepository {
  return {
    async findById(id) {
      const row = await getByKey<StoredSection>(access, 'sections', id);
      return row === undefined ? null : decodeSection(row);
    },
    async listByProject(projectId) {
      const sections = await allSections(access);
      return sections
        .filter((section) => isAlive(section) && section.projectId === projectId)
        .toSorted((a, b) => compareRank(a.rank, b.rank));
    },
  };
}

export function createLabelRepository(access: StoreAccess): LabelRepository {
  return {
    async findById(id) {
      const row = await getByKey<StoredLabel>(access, 'labels', id);
      return row === undefined ? null : decodeLabel(row);
    },
    async findByNormalizedName(normalizedName) {
      const labels = await allLabels(access);
      return (
        labels.find((label) => isAlive(label) && label.normalizedName === normalizedName) ?? null
      );
    },
    async listAll() {
      const labels = await allLabels(access);
      return labels
        .filter((label) => isAlive(label))
        .toSorted((a, b) => compareRank(a.rank, b.rank));
    },
    async loadValidationContext(excludingId) {
      const labels = await allLabels(access);
      const existingNormalizedNames = labels
        .filter((label) => label.id !== excludingId && isAlive(label))
        .map((label) => label.normalizedName);
      const context: LabelValidationContext = { existingNormalizedNames };
      return context;
    },
  };
}

export function createTaskLabelRepository(access: StoreAccess): TaskLabelRepository {
  return {
    async listByTask(taskId) {
      const links = await allTaskLabels(access);
      return links.filter((link) => link.taskId === taskId);
    },
    async listByLabel(labelId) {
      const links = await allTaskLabels(access);
      return links.filter((link) => link.labelId === labelId);
    },
    async countActiveByTask(taskId) {
      return countActiveTaskLabelsByTask(access, taskId);
    },
  };
}

export function createChecklistItemRepository(access: StoreAccess): ChecklistItemRepository {
  return {
    async listByTask(taskId) {
      const items = await allChecklistItems(access);
      return items
        .filter((item) => item.taskId === taskId && isAlive(item))
        .toSorted((a, b) => compareRank(a.rank, b.rank));
    },
    async countActiveByTask(taskId) {
      return countChecklistItemsByTask(access, taskId);
    },
  };
}

export function createReminderRepository(access: StoreAccess): ReminderRepository {
  return {
    async listByTask(taskId) {
      const reminders = await allReminders(access);
      return reminders.filter((reminder) => reminder.taskId === taskId);
    },
    async countExplicitByTask(taskId) {
      return countExplicitRemindersByTask(access, taskId);
    },
    async listAllEnabled() {
      const reminders = await allReminders(access);
      return reminders.filter((reminder) => reminder.enabled);
    },
  };
}

export function createRecurrenceSeriesRepository(access: StoreAccess): RecurrenceSeriesRepository {
  return {
    async findById(id) {
      const row = await getByKey<StoredRecurrenceSeries>(access, 'recurrence_series', id);
      return row === undefined ? null : decodeRecurrenceSeries(row);
    },
  };
}

export function createAttachmentRepository(access: StoreAccess): AttachmentRepository {
  return {
    async listByTask(taskId) {
      const attachments = await allAttachments(access);
      return attachments.filter((attachment) => attachment.taskId === taskId);
    },
    async countActiveByTask(taskId) {
      return countActiveAttachmentsByTask(access, taskId);
    },
  };
}

export function createTaskLinkRepository(access: StoreAccess): TaskLinkRepository {
  return {
    async listByTask(taskId) {
      const links = await allTaskLinks(access);
      return links.filter((link) => link.taskId === taskId);
    },
    async countByTask(taskId) {
      return countTaskLinksByTask(access, taskId);
    },
  };
}

export function createImportBatchRepository(access: StoreAccess): ImportBatchRepository {
  return {
    async findById(id) {
      const row = await getByKey<StoredImportBatch>(access, 'import_batches', id);
      return row === undefined ? null : decodeImportBatch(row);
    },
    async findLatest() {
      const rows = await getAllFromStore<StoredImportBatch>(access, 'import_batches');
      let latest: StoredImportBatch | null = null;
      for (const row of rows) {
        if (latest === null || row.started_at > latest.started_at) latest = row;
      }
      return latest === null ? null : decodeImportBatch(latest);
    },
  };
}

export function createSyncOutboxRepository(access: StoreAccess): SyncOutboxRepository {
  return {
    async listPending(limit) {
      const entries = await allSyncOutbox(access);
      const sorted = entries.toSorted(
        (a, b) => Temporal.Instant.compare(a.createdAt, b.createdAt) || compareId(a.opId, b.opId),
      );
      return limit === undefined ? sorted : sorted.slice(0, limit);
    },
    async countPending() {
      const entries = await allSyncOutbox(access);
      return entries.length;
    },
  };
}

export function createSyncConflictRepository(access: StoreAccess): SyncConflictRepository {
  return {
    async listUnresolved() {
      const conflicts = await allSyncConflicts(access);
      return conflicts.filter((conflict) => conflict.resolvedAt === null);
    },
  };
}

export function createQueryPort(access: StoreAccess): StorageQueryPort {
  return {
    tasks: createTaskRepository(access),
    projects: createProjectRepository(access),
    sections: createSectionRepository(access),
    labels: createLabelRepository(access),
    taskLabels: createTaskLabelRepository(access),
    checklistItems: createChecklistItemRepository(access),
    reminders: createReminderRepository(access),
    recurrenceSeries: createRecurrenceSeriesRepository(access),
    attachments: createAttachmentRepository(access),
    taskLinks: createTaskLinkRepository(access),
    importBatches: createImportBatchRepository(access),
    syncOutbox: createSyncOutboxRepository(access),
    syncConflicts: createSyncConflictRepository(access),
  };
}
