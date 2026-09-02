import { Temporal } from '@js-temporal/polyfill';

import { BASELINE_SCHEMA_PLAN } from '../migration/baseline-schema-plan.js';
import { ALL_TABLES } from '../schema/index.js';
import { runMigrations } from '../migration/migration.js';
import type {
  StoragePort,
  StorageWriteTransaction,
  TombstonePurgeSummary,
} from '../ports/index.js';
import { isTombstoneExpired } from '../tombstone/index.js';

import type { SqliteRow } from './driver-port.js';
import { applyMutationSql } from './mutation.js';
import {
  createSqliteMigrations,
  detectCurrentSchemaVersion,
  schemaOperationUpSql,
  sqliteMigrationCheckpoint,
} from './migrations.js';
import { NodeSqliteDriver } from './node-sqlite-driver.js';
import { createQueryPort } from './repositories.js';

/**
 * `StoragePort` (задание пакета работ E02.2, п.3) поверх `NodeSqliteDriver`.
 * Один SQLite-объект — один класс: и вне транзакции (методы `StoragePort`
 * читают через постоянно открытое соединение), и внутри неё (методы
 * `StorageWriteTransaction`, тот же драйвер, обёрнутый `driver.transaction`).
 */
export class SqliteStorage implements StoragePort {
  private readonly driver: NodeSqliteDriver;
  private readonly query: ReturnType<typeof createQueryPort>;

  constructor(driver: NodeSqliteDriver) {
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
   * коммитит; исключение из него долетает до `NodeSqliteDriver.transaction`,
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
      };
      return run(tx);
    });
  }

  async eraseAllLocalData(): Promise<void> {
    // Список таблиц берётся из схемы (`ALL_TABLES`), а не переписывается
    // здесь: второй список однажды отстанет ровно на ту таблицу, которую
    // забудут стереть. `tasks_fts` — не в `ALL_TABLES` (это виртуальная
    // FTS5-таблица, `./fts.ts`), поэтому названа отдельно и явно.
    await this.driver.transaction(async () => {
      for (const table of ALL_TABLES) {
        // eslint-disable-next-line no-await-in-loop -- одна транзакция, порядок неважен, параллелить нечем
        await this.driver.execute(`DELETE FROM "${table.name}"`);
      }
      await this.driver.execute('DELETE FROM tasks_fts');
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
  driver: NodeSqliteDriver,
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
 * Настоящая точка входа приложения (задание пакета работ E02.2, «Критерий
 * готовности») — асинхронна, потому что честно проходит протокол миграций
 * (`../migration/migration.ts` `runMigrations` + `./migrations.ts`
 * `sqliteMigrationCheckpoint`), не обходит его.
 *
 * Провал миграции (`status: 'failed_read_only_recovery'`) в этом пакете
 * работ приводит к исключению, а не к отдельному read-only режиму:
 * `StoragePort` не моделирует состояние "только чтение с технической
 * ошибкой" (задание E02.1 п.4 упоминает его на уровне протокола миграций, но
 * не на уровне интерфейса `StoragePort`) — данные при этом НЕ теряются
 * (снимок восстановлен `sqliteMigrationCheckpoint`, файл БД цел), только
 * этот вызов не возвращает рабочее хранилище. Полноценный read-only fallback
 * (то, что реально покажет пользователю командный слой) — следующий пакет
 * работ, владеющий `StoragePort`-потребителями.
 */
export async function openSqliteStorage(path: string): Promise<StoragePort> {
  const driver = NodeSqliteDriver.open(path);
  const currentVersion = await detectCurrentSchemaVersion(driver);
  const outcome = await runMigrations({
    executor: driver,
    currentVersion,
    migrations: createSqliteMigrations(),
    checkpoint: sqliteMigrationCheckpoint,
  });
  if (outcome.status === 'failed_read_only_recovery') {
    throw new Error(
      `openSqliteStorage: миграция схемы провалилась на версии ${outcome.failedAtVersion} ` +
        `(снимок восстановлен, данные не потеряны): ${outcome.error}`,
    );
  }
  return new SqliteStorage(driver);
}

/**
 * Быстрый синхронный конструктор — единственный потребитель:
 * `test/sqlite/sqlite-storage-contract.test.ts`, где `runStorageContract`
 * (`../contract/storage-contract.ts`, чужая территория этого пакета работ —
 * трогать нельзя) требует `factory: () => StoragePort`, БЕЗ `Promise`, и
 * вызывает эту фабрику заново почти в каждом `it(...)`.
 *
 * `runMigrations` (используемый `openSqliteStorage` выше) — настоящая
 * `async function`: даже когда каждый её `await` разрешает уже вычисленное
 * значение без реального ожидания I/O, сам `await` всё равно обязан отдать
 * управление в очередь микрозадач хотя бы один раз (спецификация ECMAScript,
 * не деталь реализации движка) — синхронная функция в принципе не может
 * "дождаться" её результата. Обойти это, полагаясь на то, что тело
 * `runMigrations` при ОДНОЙ миграции успевает выполнить свою полезную работу
 * синхронно до первой приостановки, было бы хрупким трюком, завязанным на
 * деталь реализации, а не на контракт: он тихо сломался бы при появлении
 * второй миграции (`SQLITE_BASELINE_MIGRATION_VERSION`
 * перестанет быть единственной версией) — поэтому этот путь НЕ использует
 * `runMigrations`/checkpoint вообще, а напрямую переводит `BASELINE_SCHEMA_PLAN`
 * в DDL той же функцией перевода (`schemaOperationUpSql`, `./migrations.ts`),
 * которой пользуется настоящий асинхронный путь — единственное различие в
 * том, что здесь применение синхронно (`NodeSqliteDriver.execSync`) и без
 * checkpoint/восстановления (свежая `:memory:` база и так пуста, восстанавливать
 * нечего, если создание таблицы вдруг бросит — что означало бы баг в
 * `schema/tables.ts`, а не ожидаемый сценарий отказа).
 *
 * Полный протокол миграций (checkpoint, откат, `failed_read_only_recovery`)
 * проверяется отдельно и по-настоящему — `test/sqlite/migration.test.ts`,
 * через `openSqliteStorage`.
 *
 * **Внешние ключи здесь намеренно выключены сразу после открытия** —
 * единственное расхождение с `NodeSqliteDriver.open`, которое стоит громко
 * прокомментировать (см. отчёт пакета работ E02.2). Причина не в этом
 * классе, а в самом общем контракте (`../contract/storage-contract.ts`,
 * трогать нельзя): несколько его тестов сознательно пишут ОДНУ сущность
 * изолированно и ссылаются на id сущности из ДРУГОЙ таблицы, которую в этот
 * `factory()` НИКОГДА не вставляют — например
 * `TaskLabel — OR-set по HLC > countActiveByTask реагирует на addHlc/removeHlc`
 * пишет `task_labels` с `taskId`/`labelId`, для которых `tasks`/`labels`
 * пусты, а `ChecklistItem > tombstone-пункты не считаются в countActiveByTask`
 * пишет `checklist_items` с `taskId`, для которого `tasks` пусты — это
 * ЦЕЛЬ теста (изолированная проверка одного репозитория/счётчика), а не
 * недосмотр: сам `runStorageContract` описан как проверка "само хранилище
 * (пишет/читает/атомарность)", а не кросс-сущностной ссылочной целостности
 * — та по архитектуре пакета целиком принадлежит будущему командному слою
 * и валидатору `@shagi/core` (см. `../ports/task-repository.ts` заголовочный
 * комментарий и CLAUDE.md «Границы»). У эталонной реализации в памяти
 * (`../memory/in-memory-storage.ts`) такой проверки нет вообще (`Map` не
 * знает о внешних ключах) — контракт уже сегодня не гарантирует ссылочную
 * целостность как часть своего наблюдаемого поведения, и включённые здесь
 * `PRAGMA foreign_keys=ON` были бы более строгим требованием, чем сам
 * контракт, который эта фабрика обязана удовлетворить без единой правки.
 * `NodeSqliteDriver.open`/`openSqliteStorage` (настоящий продуктовый путь)
 * этого послабления не делают — там `PRAGMA foreign_keys=ON` безусловна, как
 * того требует `00§2`, и `test/sqlite/wal-and-foreign-keys.test.ts` проверяет
 * это напрямую, включая реальный отказ на висячей ссылке.
 */
export function createSqliteStorageForContract(): StoragePort {
  const driver = NodeSqliteDriver.open(':memory:');
  driver.execSync('PRAGMA foreign_keys = OFF');
  for (const operation of BASELINE_SCHEMA_PLAN) {
    driver.execSync(schemaOperationUpSql(operation));
  }
  return new SqliteStorage(driver);
}
