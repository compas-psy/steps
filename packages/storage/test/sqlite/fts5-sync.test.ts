import { describe, expect, it } from 'vitest';

import { BASELINE_SCHEMA_PLAN } from '../../src/migration/baseline-schema-plan.js';
import {
  makeHlc,
  makeLabel,
  makeOutboxEntry,
  makeProject,
  makeTask,
  makeTaskLabel,
  nextInstant,
} from '../../src/contract/fixtures.js';
import { NodeSqliteDriver } from '../../src/sqlite/node-sqlite-driver.js';
import { schemaOperationUpSql } from '../../src/sqlite/migrations.js';
import { SqliteStorage } from '../../src/sqlite/sqlite-storage.js';
import type { SqliteRow } from '../../src/sqlite/driver-port.js';
import type { StoragePort } from '../../src/ports/index.js';

/**
 * Синхронизация FTS5 (задание пакета работ E02.2, п.4, п.6) — явные операции
 * в той же транзакции, что и запись задачи (`../../src/sqlite/fts.ts`, её
 * заголовочный комментарий обосновывает выбор против триггеров). Ранжирование
 * — вне охвата (отдельный пакет работ); здесь только то, что содержимое
 * `tasks_fts` не расходится с каноническими строками после серии
 * вставок/обновлений/удалений.
 */
function openTestStorage(): { storage: StoragePort; driver: NodeSqliteDriver } {
  const driver = NodeSqliteDriver.open(':memory:');
  driver.execSync('PRAGMA foreign_keys = OFF');
  for (const operation of BASELINE_SCHEMA_PLAN) {
    driver.execSync(schemaOperationUpSql(operation));
  }
  return { storage: new SqliteStorage(driver), driver };
}

type FtsRow = SqliteRow & {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly project_title: string;
  readonly label_display_names: string;
};

async function ftsRowFor(driver: NodeSqliteDriver, taskId: string): Promise<FtsRow | null> {
  return driver.queryOne<FtsRow>(`SELECT * FROM "tasks_fts" WHERE id = ?`, [taskId]);
}

describe('SQLite: синхронизация FTS5 с каноническими строками (задание E02.2 п.4, п.6)', () => {
  it('вставка задачи создаёт строку tasks_fts с её title/description', async () => {
    const { storage, driver } = openTestStorage();
    const task = makeTask({ title: 'Купить молоко' });

    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: task }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });

    const row = await ftsRowFor(driver, task.id);
    expect(row?.title).toBe('Купить молоко');
    expect(row?.project_title).toBe('');
    expect(row?.label_display_names).toBe('');
  });

  it('обновление заголовка задачи обновляет строку tasks_fts на месте (без дублей)', async () => {
    const { storage, driver } = openTestStorage();
    const task = makeTask({ title: 'Черновик' });
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: task }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });

    const updated = { ...task, title: 'Готово', updatedAt: nextInstant() };
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: updated }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });

    const rows = await driver.queryAll<FtsRow>(`SELECT * FROM "tasks_fts" WHERE id = ?`, [task.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe('Готово');
  });

  it('переименование проекта пересчитывает project_title во всех его задачах', async () => {
    const { storage, driver } = openTestStorage();
    const project = makeProject({ title: 'Работа' });
    const taskA = makeTask({ projectId: project.id, title: 'Задача A' });
    const taskB = makeTask({ projectId: project.id, title: 'Задача B' });

    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [
          { entity: 'project', value: project },
          { entity: 'task', value: taskA },
          { entity: 'task', value: taskB },
        ],
        outbox: [
          makeOutboxEntry('project', project.id),
          makeOutboxEntry('task', taskA.id),
          makeOutboxEntry('task', taskB.id),
        ],
      });
    });

    const renamed = { ...project, title: 'Личное', updatedAt: nextInstant() };
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'project', value: renamed }],
        outbox: [makeOutboxEntry('project', project.id)],
      });
    });

    await expect(ftsRowFor(driver, taskA.id)).resolves.toMatchObject({ project_title: 'Личное' });
    await expect(ftsRowFor(driver, taskB.id)).resolves.toMatchObject({ project_title: 'Личное' });
  });

  it('добавление и снятие метки обновляет label_display_names (OR-set по HLC)', async () => {
    const { storage, driver } = openTestStorage();
    const task = makeTask();
    const label = makeLabel({ displayName: 'важное' });
    const addedAt = makeHlc(nextInstant());

    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [
          { entity: 'task', value: task },
          { entity: 'label', value: label },
        ],
        outbox: [makeOutboxEntry('task', task.id), makeOutboxEntry('label', label.id)],
      });
    });
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task_label', value: makeTaskLabel(task.id, label.id, addedAt) }],
        outbox: [makeOutboxEntry('task_label', task.id)],
      });
    });

    await expect(ftsRowFor(driver, task.id)).resolves.toMatchObject({
      label_display_names: 'важное',
    });

    const removedAt = makeHlc(nextInstant());
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [
          { entity: 'task_label', value: makeTaskLabel(task.id, label.id, addedAt, removedAt) },
        ],
        outbox: [makeOutboxEntry('task_label', task.id)],
      });
    });

    await expect(ftsRowFor(driver, task.id)).resolves.toMatchObject({ label_display_names: '' });
  });

  it('переименование метки обновляет label_display_names во всех задачах с активной связью', async () => {
    const { storage, driver } = openTestStorage();
    const task = makeTask();
    const label = makeLabel({ displayName: 'срочно' });
    const addedAt = makeHlc(nextInstant());

    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [
          { entity: 'task', value: task },
          { entity: 'label', value: label },
        ],
        outbox: [makeOutboxEntry('task', task.id), makeOutboxEntry('label', label.id)],
      });
    });
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task_label', value: makeTaskLabel(task.id, label.id, addedAt) }],
        outbox: [makeOutboxEntry('task_label', task.id)],
      });
    });

    const renamedLabel = { ...label, displayName: 'горит', updatedAt: nextInstant() };
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'label', value: renamedLabel }],
        outbox: [makeOutboxEntry('label', label.id)],
      });
    });

    await expect(ftsRowFor(driver, task.id)).resolves.toMatchObject({
      label_display_names: 'горит',
    });
  });

  it('tombstone задачи убирает её строку из tasks_fts (tombstone не user-visible, 02§1)', async () => {
    const { storage, driver } = openTestStorage();
    const task = makeTask();
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: task }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });
    await expect(ftsRowFor(driver, task.id)).resolves.not.toBeNull();

    const tombstoned = { ...task, deletedAt: nextInstant(), updatedAt: nextInstant() };
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: tombstoned }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });

    await expect(ftsRowFor(driver, task.id)).resolves.toBeNull();
  });

  it('после серии вставок/обновлений/удалений tasks_fts.id совпадает ровно со множеством живых задач', async () => {
    const { storage, driver } = openTestStorage();
    const survivor = makeTask({ title: 'Живая' });
    const toBeDeleted = makeTask({ title: 'Будет удалена' });

    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [
          { entity: 'task', value: survivor },
          { entity: 'task', value: toBeDeleted },
        ],
        outbox: [makeOutboxEntry('task', survivor.id), makeOutboxEntry('task', toBeDeleted.id)],
      });
    });

    const tombstoned = { ...toBeDeleted, deletedAt: nextInstant(), updatedAt: nextInstant() };
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: tombstoned }],
        outbox: [makeOutboxEntry('task', toBeDeleted.id)],
      });
    });

    const ftsIds = (await driver.queryAll<FtsRow>(`SELECT id FROM "tasks_fts"`)).map((r) => r.id);
    expect(ftsIds).toEqual([survivor.id]);
  });
});
