import { isTaskLabelActive, type CaptureState, type Uuid } from '@shagi/core';
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

import { sqlToNumber, uuidToSql } from './codec.js';
import type { SqliteParam, SqliteRow } from './driver-port.js';
import {
  rowToAttachment,
  rowToChecklistItem,
  rowToImportBatch,
  rowToLabel,
  rowToProject,
  rowToRecurrenceSeries,
  rowToReminder,
  rowToSection,
  rowToSyncConflict,
  rowToSyncOutboxEntry,
  rowToTask,
  rowToTaskLabel,
  rowToTaskLink,
} from './mappers.js';
import type { SqliteDriverPort } from './driver-port.js';

/**
 * `StorageQueryPort` (`../ports/query-port.ts`) поверх `SqliteDriverPort` —
 * задание пакета работ E02.2, п.3. Каждый метод — подготовленное выражение
 * с параметрами через `?` (`SqliteDriverPort.execute`/`queryAll`/`queryOne`
 * сами кешируют и параметризуют, `./node-sqlite-driver.ts`); нигде значения
 * не подставляются конкатенацией строки SQL — единственное место, где SQL
 * строится из "переменной" части, это ветвление ЦЕЛОГО запроса по
 * `null`-ости `sectionId`/`excludingId` (структура запроса, не данные), см.
 * `listByProjectSection`/`countActiveExcluding` ниже.
 *
 * Один и тот же `SqliteDriverPort` используется и вне транзакции
 * (`SqliteStorage`, `./sqlite-storage.ts`), и внутри неё
 * (`createWriteTransaction`) — оба случая создают этот объект заново поверх
 * того же соединения, поэтому чтение внутри активной транзакции драйвера
 * автоматически видит её ещё не закоммиченные эффекты (read-your-writes,
 * `../ports/storage-port.ts` `StorageWriteTransaction`) без специального
 * кода: это то же самое соединение SQLite.
 */

function isAliveRow(row: SqliteRow): boolean {
  return row.deleted_at === null;
}

function taskLabelCountActive(rows: readonly SqliteRow[]): number {
  return rows.map(rowToTaskLabel).filter(isTaskLabelActive).length;
}

export function createTaskRepository(driver: SqliteDriverPort): TaskRepository {
  return {
    async findById(id) {
      const row = await driver.queryOne<SqliteRow>(`SELECT * FROM "tasks" WHERE id = ?`, [
        uuidToSql(id),
      ]);
      return row === null ? null : rowToTask(row);
    },

    async listByStatusAndPlannedDate(status) {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "tasks" WHERE deleted_at IS NULL AND status = ?
         ORDER BY (planned_date IS NULL) ASC, planned_date ASC, id ASC`,
        [status],
      );
      return rows.map(rowToTask);
    },

    async listByStatusAndDeadlineDate(status) {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "tasks" WHERE deleted_at IS NULL AND status = ?
         ORDER BY (deadline_date IS NULL) ASC, deadline_date ASC, id ASC`,
        [status],
      );
      return rows.map(rowToTask);
    },

    async listByCaptureStateAndStatus(captureState: CaptureState, status) {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "tasks" WHERE deleted_at IS NULL AND capture_state = ? AND status = ?
         ORDER BY created_at ASC, id ASC`,
        [captureState, status],
      );
      return rows.map(rowToTask);
    },

    async listByProjectSection(projectId, sectionId, status) {
      const rows =
        sectionId === null
          ? await driver.queryAll<SqliteRow>(
              `SELECT * FROM "tasks" WHERE deleted_at IS NULL AND status = ? AND project_id = ?
               AND section_id IS NULL ORDER BY rank ASC`,
              [status, uuidToSql(projectId)],
            )
          : await driver.queryAll<SqliteRow>(
              `SELECT * FROM "tasks" WHERE deleted_at IS NULL AND status = ? AND project_id = ?
               AND section_id = ? ORDER BY rank ASC`,
              [status, uuidToSql(projectId), uuidToSql(sectionId)],
            );
      return rows.map(rowToTask);
    },

    async listDirectSubtasks(parentTaskId, status) {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "tasks" WHERE deleted_at IS NULL AND status = ? AND parent_task_id = ?
         ORDER BY rank ASC`,
        [status, uuidToSql(parentTaskId)],
      );
      return rows.map(rowToTask);
    },

    async listByFocusDate(focusDate, status) {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "tasks" WHERE deleted_at IS NULL AND status = ? AND focus_date = ?
         ORDER BY rank ASC`,
        [status, focusDate.toString()],
      );
      return rows.map(rowToTask);
    },

    async listBySeries(seriesId, status) {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "tasks" WHERE deleted_at IS NULL AND status = ? AND series_id = ?
         ORDER BY (occurrence_seq IS NULL) ASC, occurrence_seq ASC`,
        [status, uuidToSql(seriesId)],
      );
      return rows.map(rowToTask);
    },

    async countDirectSubtasks(parentTaskId) {
      return countDirectSubtasksSql(driver, parentTaskId);
    },

    async loadParentSnapshot(parentTaskId) {
      return loadParentSnapshotSql(driver, parentTaskId);
    },

    async loadValidationContext(id, parentTaskId) {
      const parent =
        parentTaskId === null ? null : await loadParentSnapshotSql(driver, parentTaskId);

      if (id === null) {
        return {
          id,
          parent,
          checklistItemCount: 0,
          labelCount: 0,
          explicitReminderCount: 0,
          linkCount: 0,
          attachmentCount: 0,
        };
      }

      const [checklistItemCount, labelCount, explicitReminderCount, linkCount, attachmentCount] =
        await Promise.all([
          countRows(
            driver,
            `SELECT COUNT(*) AS n FROM "checklist_items" WHERE task_id = ? AND deleted_at IS NULL`,
            [uuidToSql(id)],
          ),
          countActiveTaskLabels(driver, id),
          countRows(
            driver,
            `SELECT COUNT(*) AS n FROM "reminders" WHERE task_id = ? AND kind = 'explicit'`,
            [uuidToSql(id)],
          ),
          countRows(driver, `SELECT COUNT(*) AS n FROM "task_links" WHERE task_id = ?`, [
            uuidToSql(id),
          ]),
          countRows(
            driver,
            `SELECT COUNT(*) AS n FROM "attachments" WHERE task_id = ? AND state != 'deleted'`,
            [uuidToSql(id)],
          ),
        ]);

      return {
        id,
        parent,
        checklistItemCount,
        labelCount,
        explicitReminderCount,
        linkCount,
        attachmentCount,
      };
    },
  };
}

async function countRows(
  driver: SqliteDriverPort,
  sql: string,
  params: readonly SqliteParam[],
): Promise<number> {
  const row = await driver.queryOne<SqliteRow>(sql, params);
  return row === null ? 0 : sqlToNumber(row.n ?? null);
}

async function countDirectSubtasksSql(
  driver: SqliteDriverPort,
  parentTaskId: Uuid,
): Promise<number> {
  return countRows(
    driver,
    `SELECT COUNT(*) AS n FROM "tasks" WHERE deleted_at IS NULL AND parent_task_id = ?`,
    [uuidToSql(parentTaskId)],
  );
}

async function countActiveTaskLabels(driver: SqliteDriverPort, taskId: Uuid): Promise<number> {
  const rows = await driver.queryAll<SqliteRow>(`SELECT * FROM "task_labels" WHERE task_id = ?`, [
    uuidToSql(taskId),
  ]);
  return taskLabelCountActive(rows);
}

async function loadParentSnapshotSql(driver: SqliteDriverPort, parentTaskId: Uuid) {
  const row = await driver.queryOne<SqliteRow>(`SELECT * FROM "tasks" WHERE id = ?`, [
    uuidToSql(parentTaskId),
  ]);
  if (row === null || !isAliveRow(row)) {
    return null;
  }
  const task = rowToTask(row);
  const directSubtaskCount = await countDirectSubtasksSql(driver, parentTaskId);
  return {
    id: task.id,
    projectId: task.projectId,
    sectionId: task.sectionId,
    parentTaskId: task.parentTaskId,
    directSubtaskCount,
  };
}

export function createProjectRepository(driver: SqliteDriverPort): ProjectRepository {
  return {
    async findById(id) {
      const row = await driver.queryOne<SqliteRow>(`SELECT * FROM "projects" WHERE id = ?`, [
        uuidToSql(id),
      ]);
      return row === null ? null : rowToProject(row);
    },
    async listActive() {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "projects" WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY rank ASC`,
      );
      return rows.map(rowToProject);
    },
    async countActiveExcluding(excludingId) {
      return excludingId === null
        ? countRows(
            driver,
            `SELECT COUNT(*) AS n FROM "projects" WHERE deleted_at IS NULL AND archived_at IS NULL`,
            [],
          )
        : countRows(
            driver,
            `SELECT COUNT(*) AS n FROM "projects" WHERE deleted_at IS NULL AND archived_at IS NULL AND id != ?`,
            [uuidToSql(excludingId)],
          );
    },
  };
}

export function createSectionRepository(driver: SqliteDriverPort): SectionRepository {
  return {
    async findById(id) {
      const row = await driver.queryOne<SqliteRow>(`SELECT * FROM "sections" WHERE id = ?`, [
        uuidToSql(id),
      ]);
      return row === null ? null : rowToSection(row);
    },
    async listByProject(projectId) {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "sections" WHERE deleted_at IS NULL AND project_id = ? ORDER BY rank ASC`,
        [uuidToSql(projectId)],
      );
      return rows.map(rowToSection);
    },
  };
}

export function createLabelRepository(driver: SqliteDriverPort): LabelRepository {
  return {
    async findById(id) {
      const row = await driver.queryOne<SqliteRow>(`SELECT * FROM "labels" WHERE id = ?`, [
        uuidToSql(id),
      ]);
      return row === null ? null : rowToLabel(row);
    },
    async findByNormalizedName(normalizedName) {
      const row = await driver.queryOne<SqliteRow>(
        `SELECT * FROM "labels" WHERE deleted_at IS NULL AND normalized_name = ? LIMIT 1`,
        [normalizedName],
      );
      return row === null ? null : rowToLabel(row);
    },
    async listAll() {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "labels" WHERE deleted_at IS NULL ORDER BY rank ASC`,
      );
      return rows.map(rowToLabel);
    },
    async loadValidationContext(excludingId) {
      const rows =
        excludingId === null
          ? await driver.queryAll<SqliteRow>(`SELECT * FROM "labels" WHERE deleted_at IS NULL`)
          : await driver.queryAll<SqliteRow>(
              `SELECT * FROM "labels" WHERE deleted_at IS NULL AND id != ?`,
              [uuidToSql(excludingId)],
            );
      return { existingNormalizedNames: rows.map(rowToLabel).map((label) => label.normalizedName) };
    },
  };
}

export function createTaskLabelRepository(driver: SqliteDriverPort): TaskLabelRepository {
  return {
    async listByTask(taskId) {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "task_labels" WHERE task_id = ?`,
        [uuidToSql(taskId)],
      );
      return rows.map(rowToTaskLabel);
    },
    async listByLabel(labelId) {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "task_labels" WHERE label_id = ?`,
        [uuidToSql(labelId)],
      );
      return rows.map(rowToTaskLabel);
    },
    async countActiveByTask(taskId) {
      return countActiveTaskLabels(driver, taskId);
    },
  };
}

export function createChecklistItemRepository(driver: SqliteDriverPort): ChecklistItemRepository {
  return {
    async listByTask(taskId) {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "checklist_items" WHERE task_id = ? AND deleted_at IS NULL ORDER BY rank ASC`,
        [uuidToSql(taskId)],
      );
      return rows.map(rowToChecklistItem);
    },
    async countActiveByTask(taskId) {
      return countRows(
        driver,
        `SELECT COUNT(*) AS n FROM "checklist_items" WHERE task_id = ? AND deleted_at IS NULL`,
        [uuidToSql(taskId)],
      );
    },
  };
}

export function createReminderRepository(driver: SqliteDriverPort): ReminderRepository {
  return {
    async listByTask(taskId) {
      const rows = await driver.queryAll<SqliteRow>(`SELECT * FROM "reminders" WHERE task_id = ?`, [
        uuidToSql(taskId),
      ]);
      return rows.map(rowToReminder);
    },
    async countExplicitByTask(taskId) {
      return countRows(
        driver,
        `SELECT COUNT(*) AS n FROM "reminders" WHERE task_id = ? AND kind = 'explicit'`,
        [uuidToSql(taskId)],
      );
    },
  };
}

export function createRecurrenceSeriesRepository(
  driver: SqliteDriverPort,
): RecurrenceSeriesRepository {
  return {
    async findById(id) {
      const row = await driver.queryOne<SqliteRow>(
        `SELECT * FROM "recurrence_series" WHERE id = ?`,
        [uuidToSql(id)],
      );
      return row === null ? null : rowToRecurrenceSeries(row);
    },
  };
}

export function createAttachmentRepository(driver: SqliteDriverPort): AttachmentRepository {
  return {
    async listByTask(taskId) {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "attachments" WHERE task_id = ?`,
        [uuidToSql(taskId)],
      );
      return rows.map(rowToAttachment);
    },
    async countActiveByTask(taskId) {
      return countRows(
        driver,
        `SELECT COUNT(*) AS n FROM "attachments" WHERE task_id = ? AND state != 'deleted'`,
        [uuidToSql(taskId)],
      );
    },
  };
}

export function createTaskLinkRepository(driver: SqliteDriverPort): TaskLinkRepository {
  return {
    async listByTask(taskId) {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "task_links" WHERE task_id = ?`,
        [uuidToSql(taskId)],
      );
      return rows.map(rowToTaskLink);
    },
    async countByTask(taskId) {
      return countRows(driver, `SELECT COUNT(*) AS n FROM "task_links" WHERE task_id = ?`, [
        uuidToSql(taskId),
      ]);
    },
  };
}

export function createImportBatchRepository(driver: SqliteDriverPort): ImportBatchRepository {
  return {
    async findById(id) {
      const row = await driver.queryOne<SqliteRow>(`SELECT * FROM "import_batches" WHERE id = ?`, [
        uuidToSql(id),
      ]);
      return row === null ? null : rowToImportBatch(row);
    },
    async findLatest() {
      const row = await driver.queryOne<SqliteRow>(
        `SELECT * FROM "import_batches" ORDER BY started_at DESC LIMIT 1`,
        [],
      );
      return row === null ? null : rowToImportBatch(row);
    },
  };
}

export function createSyncOutboxRepository(driver: SqliteDriverPort): SyncOutboxRepository {
  return {
    async listPending(limit) {
      const sql =
        limit === undefined
          ? `SELECT * FROM "sync_outbox" ORDER BY created_at ASC, op_id ASC`
          : `SELECT * FROM "sync_outbox" ORDER BY created_at ASC, op_id ASC LIMIT ?`;
      const rows =
        limit === undefined
          ? await driver.queryAll<SqliteRow>(sql)
          : await driver.queryAll<SqliteRow>(sql, [BigInt(limit)]);
      return rows.map(rowToSyncOutboxEntry);
    },
    async countPending() {
      return countRows(driver, `SELECT COUNT(*) AS n FROM "sync_outbox"`, []);
    },
  };
}

export function createSyncConflictRepository(driver: SqliteDriverPort): SyncConflictRepository {
  return {
    async listUnresolved() {
      const rows = await driver.queryAll<SqliteRow>(
        `SELECT * FROM "sync_conflicts" WHERE resolved_at IS NULL`,
      );
      return rows.map(rowToSyncConflict);
    },
  };
}

export function createQueryPort(driver: SqliteDriverPort): StorageQueryPort {
  return {
    tasks: createTaskRepository(driver),
    projects: createProjectRepository(driver),
    sections: createSectionRepository(driver),
    labels: createLabelRepository(driver),
    taskLabels: createTaskLabelRepository(driver),
    checklistItems: createChecklistItemRepository(driver),
    reminders: createReminderRepository(driver),
    recurrenceSeries: createRecurrenceSeriesRepository(driver),
    attachments: createAttachmentRepository(driver),
    taskLinks: createTaskLinkRepository(driver),
    importBatches: createImportBatchRepository(driver),
    syncOutbox: createSyncOutboxRepository(driver),
    syncConflicts: createSyncConflictRepository(driver),
  };
}
