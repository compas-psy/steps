/**
 * Адаптер `StoragePort` поверх `SqliteDriverPort` и НАТИВНАЯ точка входа
 * приложения.
 *
 * Файл отделён от `./sqlite-storage.ts` не по вкусу, а по графу импортов:
 * там живут пути, которым нужен `node:sqlite` (`openSqliteStorage` для
 * тестов/CI, синхронная фабрика общего контракта), а этот модуль обязан
 * оставаться пригодным для WebView — то есть не тянуть `node:` НИЧЕМ.
 * Статический импорт `node-sqlite-driver.ts` из этого графа уронил бы
 * оболочку до первого рендера: ES-модуль выполняется целиком при импорте
 * любого имени из него (разбор этой поломки — в
 * `@shagi/app` `state/storage-backend.ts`).
 */
import { Temporal } from '@js-temporal/polyfill';

import { ALL_TABLES, computeEraseOrder } from '../schema/index.js';
import { runMigrations } from '../migration/migration.js';
import type {
  StoragePort,
  StorageWriteTransaction,
  StorageDump,
  TombstonePurgeSummary,
  WorkspaceExport,
} from '../ports/index.js';
import { isTombstoneExpired } from '../tombstone/index.js';

import type { SqliteRow } from './driver-port.js';
import { applyMutationSql, saveImportBatchSql, writeMigrationDumpSql } from './mutation.js';
import {
  createBridgedMigrationCheckpoint,
  createSqliteMigrations,
  detectCurrentSchemaVersion,
} from './migrations.js';
import { BridgedSqliteDriver, type NativeSqlBridge } from './native-bridge.js';
import {
  rowToAttachment,
  rowToChecklistItem,
  rowToLabel,
  rowToProject,
  rowToRecurrenceSeries,
  rowToReminder,
  rowToSection,
  rowToTask,
  rowToImportBatch,
  rowToSyncConflict,
  rowToSyncOutboxEntry,
  rowToTaskLabel,
  rowToTaskLink,
} from './mappers.js';
import type { SqliteDriverPort } from './driver-port.js';
import { createQueryPort } from './repositories.js';

/**
 * `StoragePort` (задание пакета работ E02.2, п.3) поверх `SqliteDriverPort`.
 *
 * Драйвер — ПОРТ, а не конкретный `NodeSqliteDriver`: у порта две
 * реализации (ADR-0005) — `node:sqlite` для тестов/CI и мост в нативную
 * SQLite для Tauri-оболочек. До пакета работ ADR-0005 здесь стоял
 * конкретный класс, и это было бы не сужением типа, а запретом на вторую
 * реализацию: адаптер обязан работать с обеими одинаково, иначе смысл
 * порта теряется.
 * Один SQLite-объект — один класс: и вне транзакции (методы `StoragePort`
 * читают через постоянно открытое соединение), и внутри неё (методы
 * `StorageWriteTransaction`, тот же драйвер, обёрнутый `driver.transaction`).
 */
export class SqliteStorage implements StoragePort {
  private readonly driver: SqliteDriverPort;
  private readonly query: ReturnType<typeof createQueryPort>;

  constructor(driver: SqliteDriverPort) {
    this.driver = driver;
    this.query = createQueryPort(driver);
  }

  get tasks() {
    return this.query.tasks;
  }
  get projects() {
    return this.query.projects;
  }
  get sections() {
    return this.query.sections;
  }
  get labels() {
    return this.query.labels;
  }
  get taskLabels() {
    return this.query.taskLabels;
  }
  get checklistItems() {
    return this.query.checklistItems;
  }
  get reminders() {
    return this.query.reminders;
  }
  get recurrenceSeries() {
    return this.query.recurrenceSeries;
  }
  get attachments() {
    return this.query.attachments;
  }
  get taskLinks() {
    return this.query.taskLinks;
  }
  get importBatches() {
    return this.query.importBatches;
  }
  get syncOutbox() {
    return this.query.syncOutbox;
  }
  get syncConflicts() {
    return this.query.syncConflicts;
  }

  /**
   * `driver.transaction` открывает настоящий SQL `BEGIN IMMEDIATE`/`COMMIT`/
   * `ROLLBACK` (`./node-sqlite-driver.ts`) — колбэк, вернувшийся нормально,
   * коммитит; исключение из него долетает до `SqliteDriverPort.transaction`,
   * которое откатывает и перебрасывает исключение дальше (не глотает) —
   * ровно то же наблюдаемое поведение, что и `../memory/in-memory-storage.ts`
   * `runTransaction`, но настоящий откат СУБД, а не отбрасывание черновика
   * (`test/sqlite/transaction-rollback.test.ts` проверяет это, читая базу
   * напрямую после форсированного сбоя).
   */
  async runTransaction<T>(run: (tx: StorageWriteTransaction) => Promise<T>): Promise<T> {
    return this.driver.transaction(async () => {
      const tx: StorageWriteTransaction = {
        ...createQueryPort(this.driver),
        applyMutation: (mutation) => applyMutationSql(this.driver, mutation),
        saveImportBatch: (batch) => saveImportBatchSql(this.driver, batch),
      };
      return run(tx);
    });
  }

  /**
   * M52 (`05§13`). Реальный дефект, найденный Android-смоуком: наивный
   * `DELETE FROM` по `ALL_TABLES` в исходном порядке объявления падал
   * `FOREIGN KEY constraint failed` на `tasks` — при включённых внешних
   * ключах (`00§2`, обязательны) таблицы-сателлиты (`task_labels`/
   * `checklist_items`/...) всё ещё ссылались на удаляемые строки. Порядок
   * теперь — `computeEraseOrder(ALL_TABLES)` (`../schema/erase-order.ts`):
   * топологическая сортировка по реальному графу FK, а не список,
   * который можно забыть обновить.
   *
   * Список таблиц по-прежнему берётся из схемы (`ALL_TABLES`), не
   * переписывается здесь: второй список однажды отстанет ровно на ту
   * таблицу, которую забудут стереть. `tasks_fts` — не в `ALL_TABLES` (это
   * виртуальная FTS5-таблица, `./fts.ts`) и без FK, поэтому названа
   * отдельно и явно, порядок для неё не важен.
   *
   * Никакой `PRAGMA foreign_keys = OFF`/`defer_foreign_keys` — корректный
   * порядок делает это ненужным: self-referencing колонки `tasks`
   * (`parent_task_id`/`generated_from_occurrence_id`) обнуляются ОТДЕЛЬНЫМ
   * шагом до удаления (обе nullable — `SET NULL` не нарушает ограничение
   * ни для одной строки), после чего ни одна строка `tasks` не ссылается
   * на другую и `DELETE FROM "tasks"` безопасен независимо от порядка
   * построчной обработки внутри самого SQLite.
   */
  async eraseAllLocalData(): Promise<void> {
    await this.driver.transaction(async () => {
      await this.driver.execute('DELETE FROM "tasks_fts"');
      await this.driver.execute(
        'UPDATE "tasks" SET parent_task_id = NULL, generated_from_occurrence_id = NULL ' +
          'WHERE parent_task_id IS NOT NULL OR generated_from_occurrence_id IS NOT NULL',
      );
      for (const table of computeEraseOrder(ALL_TABLES)) {
        // eslint-disable-next-line no-await-in-loop -- одна транзакция; порядок ЗНАЧИМ (FK-граф) — параллелить нельзя
        await this.driver.execute(`DELETE FROM "${table.name}"`);
      }
    });
  }

  async exportAllEntities(): Promise<WorkspaceExport> {
    // Только живые записи: удалённое остаётся удалённым и в копии
    // (`StoragePort.exportAllEntities`). У связей `task_labels`/
    // `task_links`/`reminders`/серий поля `deleted_at` нет вовсе — они
    // выбираются целиком.
    const alive = ' WHERE deleted_at IS NULL';
    const [
      projects,
      sections,
      tasks,
      labels,
      taskLabels,
      checklistItems,
      reminders,
      recurrenceSeries,
      taskLinks,
      attachments,
    ] = await Promise.all([
      this.driver.queryAll<SqliteRow>(`SELECT * FROM "projects"${alive}`, []),
      this.driver.queryAll<SqliteRow>(`SELECT * FROM "sections"${alive}`, []),
      this.driver.queryAll<SqliteRow>(`SELECT * FROM "tasks"${alive}`, []),
      this.driver.queryAll<SqliteRow>(`SELECT * FROM "labels"${alive}`, []),
      this.driver.queryAll<SqliteRow>('SELECT * FROM "task_labels"', []),
      this.driver.queryAll<SqliteRow>(`SELECT * FROM "checklist_items"${alive}`, []),
      this.driver.queryAll<SqliteRow>('SELECT * FROM "reminders"', []),
      this.driver.queryAll<SqliteRow>('SELECT * FROM "recurrence_series"', []),
      this.driver.queryAll<SqliteRow>('SELECT * FROM "task_links"', []),
      this.driver.queryAll<SqliteRow>('SELECT * FROM "attachments"', []),
    ]);
    return {
      projects: projects.map(rowToProject),
      sections: sections.map(rowToSection),
      tasks: tasks.map(rowToTask),
      labels: labels.map(rowToLabel),
      taskLabels: taskLabels.map(rowToTaskLabel),
      checklistItems: checklistItems.map(rowToChecklistItem),
      reminders: reminders.map(rowToReminder),
      recurrenceSeries: recurrenceSeries.map(rowToRecurrenceSeries),
      taskLinks: taskLinks.map(rowToTaskLink),
      attachments: attachments.map(rowToAttachment),
    };
  }

  async dumpForMigration(): Promise<StorageDump> {
    // Без `WHERE deleted_at IS NULL`: перенос backend'а сохраняет всё,
    // включая tombstone (см. `StoragePort.dumpForMigration`).
    const all = async (table: string): Promise<readonly SqliteRow[]> =>
      this.driver.queryAll<SqliteRow>(`SELECT * FROM "${table}"`, []);
    const [
      projects,
      sections,
      tasks,
      labels,
      taskLabels,
      checklistItems,
      reminders,
      recurrenceSeries,
      taskLinks,
      attachments,
      syncOutbox,
      syncConflicts,
      importBatches,
    ] = await Promise.all([
      all('projects'),
      all('sections'),
      all('tasks'),
      all('labels'),
      all('task_labels'),
      all('checklist_items'),
      all('reminders'),
      all('recurrence_series'),
      all('task_links'),
      all('attachments'),
      all('sync_outbox'),
      all('sync_conflicts'),
      all('import_batches'),
    ]);
    return {
      projects: projects.map(rowToProject),
      sections: sections.map(rowToSection),
      tasks: tasks.map(rowToTask),
      labels: labels.map(rowToLabel),
      taskLabels: taskLabels.map(rowToTaskLabel),
      checklistItems: checklistItems.map(rowToChecklistItem),
      reminders: reminders.map(rowToReminder),
      recurrenceSeries: recurrenceSeries.map(rowToRecurrenceSeries),
      taskLinks: taskLinks.map(rowToTaskLink),
      attachments: attachments.map(rowToAttachment),
      syncOutbox: syncOutbox.map(rowToSyncOutboxEntry),
      syncConflicts: syncConflicts.map(rowToSyncConflict),
      importBatches: importBatches.map(rowToImportBatch),
    };
  }

  async loadFromMigrationDump(dump: StorageDump): Promise<void> {
    // Одной транзакцией: наполовину перенесённое хранилище — это порванные
    // ссылки, состояние хуже, чем «перенос не удался».
    await this.driver.transaction(async () => {
      await writeMigrationDumpSql(this.driver, dump);
    });
  }

  async purgeExpiredTombstones(now: Temporal.Instant): Promise<TombstonePurgeSummary> {
    return this.driver.transaction(async () => {
      const [task, project, section, label, checklistItem] = await Promise.all([
        purgeTable(this.driver, 'tasks', now),
        purgeTable(this.driver, 'projects', now),
        purgeTable(this.driver, 'sections', now),
        purgeTable(this.driver, 'labels', now),
        purgeTable(this.driver, 'checklist_items', now),
      ]);
      return { task, project, section, label, checklistItem };
    });
  }
}

/** Общая для пяти таблиц с `deleted_at` (`../ports/storage-port.ts`
 * `TombstonePurgeSummary`) чистка — переиспользует `isTombstoneExpired`
 * (`../tombstone/tombstone.ts`), а не пересчитывает 90-дневную границу
 * SQL-датой второй раз (то же обоснование, что у `../memory/in-memory-storage.ts`
 * `purgeTable`, только источник строк — таблица SQLite, а не `Map`). */
async function purgeTable(
  driver: SqliteDriverPort,
  table: string,
  now: Temporal.Instant,
): Promise<number> {
  const rows = await driver.queryAll<SqliteRow>(
    `SELECT id, deleted_at FROM "${table}" WHERE deleted_at IS NOT NULL`,
  );
  let removed = 0;
  for (const row of rows) {
    const deletedAtRaw = row.deleted_at;
    if (typeof deletedAtRaw !== 'bigint') continue;
    const deletedAt = Temporal.Instant.fromEpochNanoseconds(deletedAtRaw);
    if (isTombstoneExpired(deletedAt, now)) {
      await driver.execute(`DELETE FROM "${table}" WHERE id = ?`, [row.id ?? null]);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Точка входа НАСТОЯЩЕГО приложения на Tauri-оболочке (ADR-0005): нативная
 * SQLite через мост оболочки, тот же протокол миграций, что и у
 * `openSqliteStorage`, тот же адаптер вокруг.
 *
 * Отдельная функция, а не параметр `openSqliteStorage`, по одной причине:
 * `openSqliteStorage` открывает файл САМА (`NodeSqliteDriver.open`) и живёт
 * в мире, где есть `node:sqlite`; здесь файл открывает нативная сторона, и
 * ни строчки `node:` кода в этот путь попасть не должно — иначе сборка
 * оболочки утащит в бандл модуль, которого в WebView не существует (эта
 * ошибка уже случалась, разбор — в `../../app/src/state/storage-backend.ts`).
 *
 * Провал миграции бросает исключение с диагностикой — тихого отката на
 * другой backend здесь нет и быть не может: подменить нативное хранилище
 * веб-хранилищем значит показать человеку пустой продукт вместо его задач.
 */
export async function openNativeSqliteStorage(
  bridge: NativeSqlBridge,
  databaseName: string,
): Promise<StoragePort> {
  const driver = await BridgedSqliteDriver.open(bridge, databaseName);
  const currentVersion = await detectCurrentSchemaVersion(driver);
  const outcome = await runMigrations({
    executor: driver,
    currentVersion,
    migrations: createSqliteMigrations(),
    checkpoint: createBridgedMigrationCheckpoint(bridge),
  });
  if (outcome.status === 'failed_read_only_recovery') {
    throw new Error(
      `openNativeSqliteStorage: миграция схемы провалилась на версии ${outcome.failedAtVersion} ` +
        `(снимок восстановлен, данные не потеряны): ${outcome.error}`,
    );
  }
  return new SqliteStorage(driver);
}
