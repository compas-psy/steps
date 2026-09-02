/**
 * Пути SQLite-адаптера, которым нужен `node:sqlite` (ADR-0005, реализация
 * «тесты/CI»): открытие файловой базы протоколом миграций и быстрая
 * синхронная фабрика общего контракта. Сам адаптер (`SqliteStorage`) и
 * нативная точка входа — в `./storage.ts`, куда `node:` не заходит вовсе.
 */
import { BASELINE_SCHEMA_PLAN } from '../migration/baseline-schema-plan.js';
import { runMigrations } from '../migration/migration.js';
import type { StoragePort } from '../ports/index.js';

import {
  createSqliteMigrations,
  detectCurrentSchemaVersion,
  schemaOperationUpSql,
  sqliteMigrationCheckpoint,
} from './migrations.js';
import { NodeSqliteDriver } from './node-sqlite-driver.js';
import { SqliteStorage } from './storage.js';

export { SqliteStorage } from './storage.js';
export { openNativeSqliteStorage } from './storage.js';

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
