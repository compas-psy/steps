import { describe, expect, it } from 'vitest';

import { BASELINE_SCHEMA_PLAN } from '../../src/migration/baseline-schema-plan.js';
import { makeOutboxEntry, makeProject, makeTask } from '../../src/contract/fixtures.js';
import { NodeSqliteDriver } from '../../src/sqlite/node-sqlite-driver.js';
import { schemaOperationUpSql } from '../../src/sqlite/migrations.js';
import { SqliteStorage } from '../../src/sqlite/sqlite-storage.js';
import type { StoragePort } from '../../src/ports/index.js';

/** Открывает драйвер и хранилище раздельно (в отличие от
 * `createSqliteStorageForContract`) — так тест держит прямую ссылку на
 * `NodeSqliteDriver` для проверок физических таблиц в обход репозиториев,
 * без обращения к приватному полю класса. Внешние ключи выключены по той же
 * причине, что у `createSqliteStorageForContract`
 * (`../../src/sqlite/sqlite-storage.ts`, её комментарий) — этот тест
 * специально проверяет откат МУТАЦИИ, а не ссылочную целостность. */
function openTestStorage(): { storage: StoragePort; driver: NodeSqliteDriver } {
  const driver = NodeSqliteDriver.open(':memory:');
  driver.execSync('PRAGMA foreign_keys = OFF');
  for (const operation of BASELINE_SCHEMA_PLAN) {
    driver.execSync(schemaOperationUpSql(operation));
  }
  return { storage: new SqliteStorage(driver), driver };
}

/**
 * Демонстрация НАСТОЯЩЕГО отката транзакции (задание пакета работ E02.2,
 * «Критерий готовности»: "покажи, что откат транзакции работает на
 * практике"). Общий контракт (`../../src/contract/storage-contract.ts`,
 * прогнан против SQLite в `sqlite-storage-contract.test.ts`) уже проверяет
 * это через `StoragePort`-репозитории; здесь — то же самое, но проверка
 * бьёт МИМО репозиториев, напрямую в физические таблицы SQLite через
 * `NodeSqliteDriver`, чтобы исключить любое сомнение "а вдруг репозиторий
 * сам скрывает частичную запись фильтром" — прямой `SELECT COUNT(*)`
 * не оставляет такого зазора.
 */
describe('SQLite: настоящий откат транзакции (не эмуляция)', () => {
  it('исключение посреди мутации из нескольких записей не оставляет ни одной строки в физических таблицах', async () => {
    const { storage, driver } = openTestStorage();

    const project = makeProject();
    const taskA = makeTask({ projectId: project.id });
    const taskB = makeTask({ projectId: project.id });

    await expect(
      storage.runTransaction(async (tx) => {
        // Первая мутация — проходит, физически видна ВНУТРИ транзакции.
        await tx.applyMutation({
          writes: [{ entity: 'project', value: project }],
          outbox: [makeOutboxEntry('project', project.id)],
        });
        await tx.applyMutation({
          writes: [
            { entity: 'task', value: taskA },
            { entity: 'task', value: taskB },
          ],
          outbox: [makeOutboxEntry('task', taskA.id), makeOutboxEntry('task', taskB.id)],
        });
        // Сбой ПОСЛЕ трёх успешных applyMutation — вся пользовательская
        // транзакция (не только последний вызов) обязана откатиться целиком
        // (`../../src/ports/storage-port.ts` `StorageWriteTransaction`).
        throw new Error('намеренный сбой посреди мутации из нескольких записей');
      }),
    ).rejects.toThrow('намеренный сбой посреди мутации');

    const projectRows = await driver.queryAll('SELECT * FROM "projects"');
    const taskRows = await driver.queryAll('SELECT * FROM "tasks"');
    const outboxRows = await driver.queryAll('SELECT * FROM "sync_outbox"');
    const ftsRows = await driver.queryAll('SELECT * FROM "tasks_fts"');

    expect(projectRows).toEqual([]);
    expect(taskRows).toEqual([]);
    expect(outboxRows).toEqual([]);
    // FTS5-индекс синхронизируется в той же транзакции (`../../src/sqlite/fts.ts`)
    // — откат обязан унести и его следы, иначе индекс разошёлся бы с данными.
    expect(ftsRows).toEqual([]);
  });

  it('успешная транзакция после форсированного отката в предыдущей — база не залипает в BEGIN', async () => {
    const { storage } = openTestStorage();
    const task = makeTask();

    await expect(
      storage.runTransaction(async (tx) => {
        await tx.applyMutation({
          writes: [{ entity: 'task', value: task }],
          outbox: [makeOutboxEntry('task', task.id)],
        });
        throw new Error('форсированный сбой');
      }),
    ).rejects.toThrow('форсированный сбой');

    // Если бы ROLLBACK не прошёл (транзакция осталась открытой), следующий
    // `runTransaction` не смог бы начать свою (SQLite не допускает
    // вложенный `BEGIN` без SAVEPOINT) — этот вызов сам по себе доказательство.
    const otherTask = makeTask();
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: otherTask }],
        outbox: [makeOutboxEntry('task', otherTask.id)],
      });
    });

    await expect(storage.tasks.findById(task.id)).resolves.toBeNull();
    await expect(storage.tasks.findById(otherTask.id)).resolves.toEqual(otherTask);
  });
});
