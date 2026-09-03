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

import type { InMemoryTables } from './tables.js';

/** Читает текущее поколение таблиц в момент вызова — не захватывает ссылку
 * заранее, потому что `InMemoryStorage.runTransaction` заменяет
 * `this.tables` целиком при коммите (`in-memory-storage.ts`), а
 * репозитории внешнего порта обязаны видеть уже закоммиченное поколение
 * при следующем же вызове. */
export type TablesAccessor = () => InMemoryTables;

function isAlive<T extends { deletedAt: Temporal.Instant | null }>(record: T): boolean {
  return record.deletedAt === null;
}

function compareNullableDate(a: Temporal.PlainDate | null, b: Temporal.PlainDate | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // null сортируется последним
  if (b === null) return -1;
  return Temporal.PlainDate.compare(a, b);
}

function compareRank(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function createTaskRepository(tables: TablesAccessor): TaskRepository {
  return {
    async findById(id) {
      return tables().tasks.get(id) ?? null;
    },

    async listByStatusAndPlannedDate(status) {
      return [...tables().tasks.values()]
        .filter((task) => isAlive(task) && task.status === status)
        .toSorted(
          (a, b) => compareNullableDate(a.plannedDate, b.plannedDate) || compareId(a.id, b.id),
        );
    },

    async listByStatusAndDeadlineDate(status) {
      return [...tables().tasks.values()]
        .filter((task) => isAlive(task) && task.status === status)
        .toSorted(
          (a, b) => compareNullableDate(a.deadlineDate, b.deadlineDate) || compareId(a.id, b.id),
        );
    },

    async listByCaptureStateAndStatus(captureState: CaptureState, status) {
      return [...tables().tasks.values()]
        .filter(
          (task) => isAlive(task) && task.captureState === captureState && task.status === status,
        )
        .toSorted(
          (a, b) => Temporal.Instant.compare(a.createdAt, b.createdAt) || compareId(a.id, b.id),
        );
    },

    async listByProjectSection(projectId, sectionId, status) {
      return [...tables().tasks.values()]
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
      return [...tables().tasks.values()]
        .filter(
          (task) => isAlive(task) && task.status === status && task.parentTaskId === parentTaskId,
        )
        .toSorted((a, b) => compareRank(a.rank, b.rank));
    },

    async listByFocusDate(focusDate, status) {
      return [...tables().tasks.values()]
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
      return [...tables().tasks.values()]
        .filter((task) => isAlive(task) && task.status === status && task.seriesId === seriesId)
        .toSorted((a, b) => compareNullableOccurrenceSeq(a.occurrenceSeq, b.occurrenceSeq));
    },

    async countDirectSubtasks(parentTaskId) {
      let count = 0;
      for (const task of tables().tasks.values()) {
        if (isAlive(task) && task.parentTaskId === parentTaskId) count += 1;
      }
      return count;
    },

    async loadParentSnapshot(parentTaskId) {
      return computeParentSnapshot(tables(), parentTaskId);
    },

    async loadValidationContext(id, parentTaskId) {
      const parent = parentTaskId === null ? null : computeParentSnapshot(tables(), parentTaskId);

      const context: TaskValidationContext = {
        id,
        parent,
        checklistItemCount: id === null ? 0 : countChecklistItemsByTask(tables(), id),
        labelCount: id === null ? 0 : countActiveTaskLabelsByTask(tables(), id),
        explicitReminderCount: id === null ? 0 : countExplicitRemindersByTask(tables(), id),
        linkCount: id === null ? 0 : countTaskLinksByTask(tables(), id),
        attachmentCount: id === null ? 0 : countActiveAttachmentsByTask(tables(), id),
      };
      return context;
    },
  };
}

function compareId(a: Uuid, b: Uuid): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function computeParentSnapshot(
  tables: InMemoryTables,
  parentTaskId: Uuid,
): TaskParentSnapshot | null {
  const parent = tables.tasks.get(parentTaskId);
  if (parent === undefined || !isAlive(parent)) {
    return null;
  }
  let directSubtaskCount = 0;
  for (const task of tables.tasks.values()) {
    if (isAlive(task) && task.parentTaskId === parentTaskId) directSubtaskCount += 1;
  }
  return {
    id: parent.id,
    projectId: parent.projectId,
    sectionId: parent.sectionId,
    parentTaskId: parent.parentTaskId,
    directSubtaskCount,
  };
}

function compareNullableOccurrenceSeq(a: bigint | null, b: bigint | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function countChecklistItemsByTask(tables: InMemoryTables, taskId: Uuid): number {
  let count = 0;
  for (const item of tables.checklistItems.values()) {
    if (item.taskId === taskId && isAlive(item)) count += 1;
  }
  return count;
}

function countActiveTaskLabelsByTask(tables: InMemoryTables, taskId: Uuid): number {
  let count = 0;
  for (const link of tables.taskLabels.values()) {
    if (link.taskId === taskId && isTaskLabelActive(link)) count += 1;
  }
  return count;
}

function countExplicitRemindersByTask(tables: InMemoryTables, taskId: Uuid): number {
  let count = 0;
  for (const reminder of tables.reminders.values()) {
    if (reminder.taskId === taskId && reminder.kind === 'explicit') count += 1;
  }
  return count;
}

function countTaskLinksByTask(tables: InMemoryTables, taskId: Uuid): number {
  let count = 0;
  for (const link of tables.taskLinks.values()) {
    if (link.taskId === taskId) count += 1;
  }
  return count;
}

function countActiveAttachmentsByTask(tables: InMemoryTables, taskId: Uuid): number {
  let count = 0;
  for (const attachment of tables.attachments.values()) {
    if (attachment.taskId === taskId && attachment.state !== 'deleted') count += 1;
  }
  return count;
}

export function createProjectRepository(tables: TablesAccessor): ProjectRepository {
  return {
    async findById(id) {
      return tables().projects.get(id) ?? null;
    },
    async listActive() {
      return [...tables().projects.values()]
        .filter((project) => isAlive(project) && project.archivedAt === null)
        .toSorted((a, b) => compareRank(a.rank, b.rank));
    },
    async countActiveExcluding(excludingId) {
      let count = 0;
      for (const project of tables().projects.values()) {
        if (project.id === excludingId) continue;
        if (isAlive(project) && project.archivedAt === null) count += 1;
      }
      return count;
    },
  };
}

export function createSectionRepository(tables: TablesAccessor): SectionRepository {
  return {
    async findById(id) {
      return tables().sections.get(id) ?? null;
    },
    async listByProject(projectId) {
      return [...tables().sections.values()]
        .filter((section) => isAlive(section) && section.projectId === projectId)
        .toSorted((a, b) => compareRank(a.rank, b.rank));
    },
  };
}

export function createLabelRepository(tables: TablesAccessor): LabelRepository {
  return {
    async findById(id) {
      return tables().labels.get(id) ?? null;
    },
    async findByNormalizedName(normalizedName) {
      for (const label of tables().labels.values()) {
        if (isAlive(label) && label.normalizedName === normalizedName) return label;
      }
      return null;
    },
    async listAll() {
      return [...tables().labels.values()]
        .filter((label) => isAlive(label))
        .toSorted((a, b) => compareRank(a.rank, b.rank));
    },
    async loadValidationContext(excludingId) {
      const existingNormalizedNames: string[] = [];
      for (const label of tables().labels.values()) {
        if (label.id === excludingId) continue;
        if (isAlive(label)) existingNormalizedNames.push(label.normalizedName);
      }
      const context: LabelValidationContext = { existingNormalizedNames };
      return context;
    },
  };
}

export function createTaskLabelRepository(tables: TablesAccessor): TaskLabelRepository {
  return {
    async listByTask(taskId) {
      return [...tables().taskLabels.values()].filter((link) => link.taskId === taskId);
    },
    async listByLabel(labelId) {
      return [...tables().taskLabels.values()].filter((link) => link.labelId === labelId);
    },
    async countActiveByTask(taskId) {
      return countActiveTaskLabelsByTask(tables(), taskId);
    },
  };
}

export function createChecklistItemRepository(tables: TablesAccessor): ChecklistItemRepository {
  return {
    async listByTask(taskId) {
      return [...tables().checklistItems.values()]
        .filter((item) => item.taskId === taskId && isAlive(item))
        .toSorted((a, b) => compareRank(a.rank, b.rank));
    },
    async countActiveByTask(taskId) {
      return countChecklistItemsByTask(tables(), taskId);
    },
  };
}

export function createReminderRepository(tables: TablesAccessor): ReminderRepository {
  return {
    async listByTask(taskId) {
      return [...tables().reminders.values()].filter((reminder) => reminder.taskId === taskId);
    },
    async countExplicitByTask(taskId) {
      return countExplicitRemindersByTask(tables(), taskId);
    },
    async listAllEnabled() {
      return [...tables().reminders.values()].filter((reminder) => reminder.enabled);
    },
  };
}

export function createRecurrenceSeriesRepository(
  tables: TablesAccessor,
): RecurrenceSeriesRepository {
  return {
    async findById(id) {
      return tables().recurrenceSeries.get(id) ?? null;
    },
  };
}

export function createAttachmentRepository(tables: TablesAccessor): AttachmentRepository {
  return {
    async listByTask(taskId) {
      return [...tables().attachments.values()].filter(
        (attachment) => attachment.taskId === taskId,
      );
    },
    async countActiveByTask(taskId) {
      return countActiveAttachmentsByTask(tables(), taskId);
    },
  };
}

export function createTaskLinkRepository(tables: TablesAccessor): TaskLinkRepository {
  return {
    async listByTask(taskId) {
      return [...tables().taskLinks.values()].filter((link) => link.taskId === taskId);
    },
    async countByTask(taskId) {
      return countTaskLinksByTask(tables(), taskId);
    },
  };
}

export function createImportBatchRepository(tables: TablesAccessor): ImportBatchRepository {
  return {
    async findById(id) {
      return tables().importBatches.get(id) ?? null;
    },
    async findLatest() {
      const all = [...tables().importBatches.values()];
      return all.reduce<(typeof all)[number] | null>(
        (latest, batch) =>
          latest === null || Temporal.Instant.compare(batch.startedAt, latest.startedAt) > 0
            ? batch
            : latest,
        null,
      );
    },
  };
}

export function createSyncOutboxRepository(tables: TablesAccessor): SyncOutboxRepository {
  return {
    async listPending(limit) {
      const all = [...tables().syncOutbox.values()].toSorted(
        (a, b) => Temporal.Instant.compare(a.createdAt, b.createdAt) || compareId(a.opId, b.opId),
      );
      return limit === undefined ? all : all.slice(0, limit);
    },
    async countPending() {
      return tables().syncOutbox.size;
    },
  };
}

export function createSyncConflictRepository(tables: TablesAccessor): SyncConflictRepository {
  return {
    async listUnresolved() {
      return [...tables().syncConflicts.values()].filter(
        (conflict) => conflict.resolvedAt === null,
      );
    },
  };
}

export function createQueryPort(tables: TablesAccessor): StorageQueryPort {
  return {
    tasks: createTaskRepository(tables),
    projects: createProjectRepository(tables),
    sections: createSectionRepository(tables),
    labels: createLabelRepository(tables),
    taskLabels: createTaskLabelRepository(tables),
    checklistItems: createChecklistItemRepository(tables),
    reminders: createReminderRepository(tables),
    recurrenceSeries: createRecurrenceSeriesRepository(tables),
    attachments: createAttachmentRepository(tables),
    taskLinks: createTaskLinkRepository(tables),
    importBatches: createImportBatchRepository(tables),
    syncOutbox: createSyncOutboxRepository(tables),
    syncConflicts: createSyncConflictRepository(tables),
  };
}
