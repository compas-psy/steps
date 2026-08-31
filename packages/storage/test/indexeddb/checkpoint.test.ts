import { describe, expect, it } from 'vitest';

import { makeOutboxEntry, makeTask } from '../../src/contract/fixtures.js';
import {
  createIndexedDbCheckpoint,
  createIndexedDbStorage,
  indexedDbCheckpointPort,
  openIndexedDbDatabase,
  restoreIndexedDbCheckpoint,
  type IndexedDbMigrationExecutor,
} from '../../src/indexeddb/index.js';
import { clearStore, storeAccessFor } from '../../src/indexeddb/store-access.js';
import { runMigrations, type MigrationStep } from '../../src/migration/index.js';

// eslint-disable-next-line import/no-unassigned-import -- побочный эффект: регистрирует fake-indexeddb в globalThis (см. ./support/create-test-storage.ts)
import './support/create-test-storage.js';

/**
 * `02§15`: "web versioned IndexedDB upgrade + recovery snapshot for
 * destructive changes" — прямые тесты `../../src/indexeddb/checkpoint.ts`
 * (задание пакета работ E02.3, «миграции с recovery-снапшотом»). Версии 2+
 * ещё не существует (только базовая схема версии 1, создаваемая нативным
 * `onupgradeneeded`, см. комментарий `checkpoint.ts`) — здесь синтетический
 * сценарий версии 2 доказывает, что сам механизм (checkpoint → миграция →
 * восстановление при провале) работает целиком, ДО того как появится
 * настоящая миграция, которая его использует.
 */
function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('error', () => reject(tx.error ?? new Error('транзакция упала')));
  });
}

describe('createIndexedDbCheckpoint / restoreIndexedDbCheckpoint', () => {
  it('снимок фиксирует состояние на момент вызова, восстановление отменяет всё, что случилось после', async () => {
    const name = `test-checkpoint-${crypto.randomUUID()}`;
    const storage = createIndexedDbStorage(name);

    const taskBefore = makeTask({ title: 'До снимка' });
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: taskBefore }],
        outbox: [makeOutboxEntry('task', taskBefore.id)],
      });
    });

    const db = await openIndexedDbDatabase(name);
    const executor: IndexedDbMigrationExecutor = { db };
    const checkpoint = await createIndexedDbCheckpoint(executor);

    const taskAfter = makeTask({ title: 'После снимка' });
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: taskAfter }],
        outbox: [makeOutboxEntry('task', taskAfter.id)],
      });
    });
    await expect(storage.tasks.findById(taskAfter.id)).resolves.not.toBeNull();

    await restoreIndexedDbCheckpoint(executor, checkpoint);

    await expect(storage.tasks.findById(taskBefore.id)).resolves.not.toBeNull();
    await expect(storage.tasks.findById(taskAfter.id)).resolves.toBeNull();
  });
});

describe('runMigrations (../../src/migration) поверх indexedDbCheckpointPort', () => {
  it('провал шага миграции восстанавливает данные к состоянию до него — данные не теряются (02§15)', async () => {
    const name = `test-migrate-${crypto.randomUUID()}`;
    const storage = createIndexedDbStorage(name);

    const stableTask = makeTask({ title: 'Стабильные данные' });
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: stableTask }],
        outbox: [makeOutboxEntry('task', stableTask.id)],
      });
    });

    const db = await openIndexedDbDatabase(name);
    const executor: IndexedDbMigrationExecutor = { db };

    const steps: MigrationStep<IndexedDbMigrationExecutor>[] = [
      {
        version: 1,
        description:
          'уже применена нативным onupgradeneeded — currentVersion=1 ниже, эта ветка не должна вызываться',
        up: () => {
          throw new Error('версия 1 не должна применяться повторно');
        },
        down: () => {
          throw new Error('down не реализован для синтетического шага 1');
        },
      },
      {
        version: 2,
        description: 'синтетический разрушительный шаг: стирает все задачи, затем падает',
        up: async ({ db: target }) => {
          const tx = target.transaction(['tasks'], 'readwrite');
          const access = storeAccessFor(tx);
          await clearStore(access, 'tasks');
          await waitForTransaction(tx);
          throw new Error('намеренный сбой миграции версии 2');
        },
        down: () => {
          throw new Error(
            'down недостижим в этом сценарии — миграция ни разу не применилась успешно',
          );
        },
      },
    ];

    const outcome = await runMigrations({
      executor,
      currentVersion: 1,
      migrations: steps,
      checkpoint: indexedDbCheckpointPort,
    });

    expect(outcome).toEqual({
      status: 'failed_read_only_recovery',
      fromVersion: 1,
      failedAtVersion: 2,
      error: 'намеренный сбой миграции версии 2',
    });

    // Данные не потеряны — checkpoint, снятый ДО шага версии 2, восстановил
    // их несмотря на то, что `up` успел стереть store и только потом упасть.
    await expect(storage.tasks.findById(stableTask.id)).resolves.not.toBeNull();
  });

  it('успешная миграция не трогает checkpoint-восстановление — up применяется как есть', async () => {
    const name = `test-migrate-ok-${crypto.randomUUID()}`;
    const storage = createIndexedDbStorage(name);
    const task = makeTask({ title: 'Задача до миграции' });
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: task }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });

    const db = await openIndexedDbDatabase(name);
    const executor: IndexedDbMigrationExecutor = { db };

    let applied = false;
    const steps: MigrationStep<IndexedDbMigrationExecutor>[] = [
      {
        version: 1,
        description:
          'уже применена нативным onupgradeneeded — currentVersion=1 ниже, эта ветка не должна вызываться',
        up: () => {
          throw new Error('версия 1 не должна применяться повторно');
        },
        down: () => {
          throw new Error('down не реализован для синтетического шага 1');
        },
      },
      {
        version: 2,
        description: 'синтетический безобидный шаг — просто помечает факт применения',
        up: () => {
          applied = true;
        },
        down: () => {
          applied = false;
        },
      },
    ];

    const outcome = await runMigrations({
      executor,
      currentVersion: 1,
      migrations: steps,
      checkpoint: indexedDbCheckpointPort,
    });

    expect(outcome).toEqual({ status: 'migrated', fromVersion: 1, toVersion: 2 });
    expect(applied).toBe(true);
    await expect(storage.tasks.findById(task.id)).resolves.not.toBeNull();
  });
});
