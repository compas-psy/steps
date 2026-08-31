import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { asUuid } from '@shagi/core';
import { describe, expect, it } from 'vitest';

import { openSqliteStorage } from '../../src/sqlite/sqlite-storage.js';
import { NodeSqliteDriver } from '../../src/sqlite/node-sqlite-driver.js';
import { makeOutboxEntry, makeProject, makeTask } from '../../src/contract/fixtures.js';

/**
 * Специфика SQLite сверх общего контракта (задание пакета работ E02.2, п.6):
 * WAL реально включён и внешние ключи реально запрещают висячую ссылку —
 * через настоящий продуктовый путь (`openSqliteStorage`/`NodeSqliteDriver.open`),
 * не через `createSqliteStorageForContract` (у неё внешние ключи намеренно
 * выключены — см. её комментарий в `src/sqlite/sqlite-storage.ts`).
 */
function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'shagi-sqlite-'));
  return join(dir, 'db.sqlite3');
}

describe('SQLite-специфика: WAL и внешние ключи (00§2, задание E02.2 п.6)', () => {
  it('PRAGMA journal_mode возвращает wal у файловой базы после openSqliteStorage', async () => {
    const path = tempDbPath();
    const storage = await openSqliteStorage(path);
    expect(storage).toBeDefined();

    const driver = NodeSqliteDriver.open(path);
    const journalMode = driver.pragma('journal_mode');
    expect(journalMode?.journal_mode).toBe('wal');
    await driver.close();
  });

  it('PRAGMA foreign_keys возвращает 1 (включены) после NodeSqliteDriver.open', () => {
    const driver = NodeSqliteDriver.open(':memory:');
    const foreignKeys = driver.pragma('foreign_keys');
    expect(foreignKeys?.foreign_keys).toBe(1n);
  });

  it('висячая ссылка (project_id на несуществующий проект) реально запрещена', async () => {
    const path = tempDbPath();
    const storage = await openSqliteStorage(path);

    const orphanTask = makeTask({ projectId: asUuid(crypto.randomUUID()) });

    await expect(
      storage.runTransaction(async (tx) => {
        await tx.applyMutation({
          writes: [{ entity: 'task', value: orphanTask }],
          outbox: [makeOutboxEntry('task', orphanTask.id)],
        });
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    // Настоящая проверка последствий: строка не появилась несмотря на
    // отказ (тот же принцип, что демонстрирует
    // `test/sqlite/transaction-rollback.test.ts`).
    await expect(storage.tasks.findById(orphanTask.id)).resolves.toBeNull();
  });

  it('корректная ссылка (project_id на реально вставленный проект) проходит', async () => {
    const path = tempDbPath();
    const storage = await openSqliteStorage(path);
    const project = makeProject();
    const task = makeTask({ projectId: project.id });

    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [
          { entity: 'project', value: project },
          { entity: 'task', value: task },
        ],
        outbox: [makeOutboxEntry('project', project.id), makeOutboxEntry('task', task.id)],
      });
    });

    await expect(storage.tasks.findById(task.id)).resolves.toEqual(task);
  });
});
