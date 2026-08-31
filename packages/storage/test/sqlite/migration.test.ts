import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ALL_INDEXES } from '../../src/schema/indexes.js';
import { ALL_TABLES } from '../../src/schema/tables.js';
import { runMigrations } from '../../src/migration/migration.js';
import { NodeSqliteDriver } from '../../src/sqlite/node-sqlite-driver.js';
import {
  createSqliteMigrations,
  detectCurrentSchemaVersion,
  sqliteMigrationCheckpoint,
} from '../../src/sqlite/migrations.js';
import { openSqliteStorage } from '../../src/sqlite/sqlite-storage.js';
import type { SqliteRow } from '../../src/sqlite/driver-port.js';

/**
 * Протокол миграций (`../../src/migration/migration.ts`) через настоящий
 * асинхронный путь (`openSqliteStorage`, `runMigrations` +
 * `sqliteMigrationCheckpoint`) — задание пакета работ E02.2, п.6: "миграция
 * на пустой базе создаёт ровно объявленную схему".
 */
function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'shagi-sqlite-migration-'));
  return join(dir, 'db.sqlite3');
}

type SqliteMasterRow = SqliteRow & {
  readonly type: string;
  readonly name: string;
};

describe('SQLite: материализация схемы через протокол миграций (задание E02.2 п.2, п.6)', () => {
  it('на пустой базе создаёт ровно 13 таблиц + служебные sqlite_* + 10 обычных индексов + 1 FTS5-таблицу', async () => {
    const path = tempDbPath();
    await openSqliteStorage(path);

    const driver = NodeSqliteDriver.open(path);
    const objects = await driver.queryAll<SqliteMasterRow>(
      `SELECT type, name FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY name`,
    );
    await driver.close();

    const tableNames = objects
      .filter((o) => o.type === 'table' && !o.name.startsWith('sqlite_'))
      .map((o) => o.name)
      // FTS5 создаёт shadow-таблицы (`tasks_fts_data`, `_idx`, `_content`, ...)
      // помимо самой виртуальной таблицы — не часть объявленной схемы
      // (`../../src/schema/tables.ts`), исключаются явно.
      .filter((name) => !name.startsWith('tasks_fts_'));

    const expectedTableNames = [...ALL_TABLES.map((t) => t.name), 'tasks_fts'].toSorted();
    expect(tableNames.toSorted()).toEqual(expectedTableNames);

    const indexNames = objects
      .filter((o) => o.type === 'index' && !o.name.startsWith('sqlite_autoindex_'))
      .map((o) => o.name);
    expect(indexNames.toSorted()).toEqual(ALL_INDEXES.map((i) => i.name).toSorted());
  });

  it('повторное открытие уже мигрированного файла не пытается создать таблицы заново', async () => {
    const path = tempDbPath();
    await openSqliteStorage(path);
    // Второй вызов на том же файле — не должен бросить "table already exists".
    await expect(openSqliteStorage(path)).resolves.toBeDefined();
  });

  it('detectCurrentSchemaVersion: 0 на пустой базе, 1 после применения baseline', async () => {
    const driver = NodeSqliteDriver.open(':memory:');
    await expect(detectCurrentSchemaVersion(driver)).resolves.toBe(0);

    await runMigrations({
      executor: driver,
      currentVersion: 0,
      migrations: createSqliteMigrations(),
      checkpoint: sqliteMigrationCheckpoint,
    });

    await expect(detectCurrentSchemaVersion(driver)).resolves.toBe(1);
  });

  it('runMigrations на пустой базе возвращает status=migrated fromVersion=0 toVersion=1', async () => {
    const driver = NodeSqliteDriver.open(':memory:');
    const outcome = await runMigrations({
      executor: driver,
      currentVersion: 0,
      migrations: createSqliteMigrations(),
      checkpoint: sqliteMigrationCheckpoint,
    });
    expect(outcome).toEqual({ status: 'migrated', fromVersion: 0, toVersion: 1 });
  });

  it('runMigrations на уже мигрированной версии возвращает status=up_to_date', async () => {
    const driver = NodeSqliteDriver.open(':memory:');
    await runMigrations({
      executor: driver,
      currentVersion: 0,
      migrations: createSqliteMigrations(),
      checkpoint: sqliteMigrationCheckpoint,
    });
    const outcome = await runMigrations({
      executor: driver,
      currentVersion: 1,
      migrations: createSqliteMigrations(),
      checkpoint: sqliteMigrationCheckpoint,
    });
    expect(outcome).toEqual({ status: 'up_to_date', version: 1 });
  });

  it('провал шага миграции восстанавливает снимок — checkpoint/restore настоящий, не эмуляция', async () => {
    const driver = NodeSqliteDriver.open(':memory:');
    const failingMigrations = [
      ...createSqliteMigrations(),
      {
        version: 2,
        description: 'намеренно ломающийся шаг — проверка отката checkpoint',
        up: async () => {
          throw new Error('намеренный сбой миграции 2');
        },
        down: async () => {},
      },
    ];

    const outcome = await runMigrations({
      executor: driver,
      currentVersion: 0,
      migrations: failingMigrations,
      checkpoint: sqliteMigrationCheckpoint,
    });

    expect(outcome).toMatchObject({
      status: 'failed_read_only_recovery',
      fromVersion: 0,
      failedAtVersion: 2,
    });

    // Снимок восстановлен ДО версии 2 — но версия 1 (baseline) успела
    // закоммититься и её checkpoint снят перед шагом 2, так что база
    // остаётся на версии 1, не откатывается до полностью пустой.
    await expect(detectCurrentSchemaVersion(driver)).resolves.toBe(1);
  });
});
