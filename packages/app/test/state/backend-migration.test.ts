// eslint-disable-next-line import/no-unassigned-import -- побочный эффект: регистрирует indexedDB в globalThis
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createUnavailablePlatform, type PlatformCapabilitiesRegistry } from '@shagi/platform';
import { makeOutboxEntry, makeTask } from '@shagi/storage/contract';
import { createIndexedDbStorage } from '@shagi/storage/indexeddb';
import { createInMemoryStorage } from '@shagi/storage/memory';
import { Temporal } from '@js-temporal/polyfill';

import {
  BACKEND_MIGRATION_KEY,
  migrateIndexedDbToNative,
} from '../../src/state/backend-migration.js';

/**
 * Перенос IndexedDB → нативная SQLite (ADR-0005) на НАСТОЯЩЕЙ IndexedDB
 * (полифил реализует тот же алгоритм) и настоящем `StoragePort` в
 * приёмнике. Сам SQLite-приёмник здесь не нужен: решение «переносить или
 * нет» и полнота переноса от адаптера приёмника не зависят — это проверено
 * общим контрактом хранилища (`dumpForMigration`/`loadFromMigrationDump`
 * там же).
 */

/** Платформа с рабочим `localPreferences` — метка «уже переносили» живёт
 * в нём. */
function platformWithPreferences(): PlatformCapabilitiesRegistry {
  const values = new Map<string, string>();
  return {
    ...createUnavailablePlatform(),
    localPreferences: {
      get: (key: string) => values.get(key) ?? null,
      set: (key: string, value: string) => {
        values.set(key, value);
      },
      remove: (key: string) => {
        values.delete(key);
      },
    },
  } as PlatformCapabilitiesRegistry;
}

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    for (const event of ['success', 'error', 'blocked']) {
      request.addEventListener(event, () => resolve(), { once: true });
    }
  });
}

let counter = 0;
let sourceName = '';

beforeEach(async () => {
  counter += 1;
  sourceName = `shagi-migration-${counter}`;
  await deleteDatabase(sourceName);
});

describe('migrateIndexedDbToNative', () => {
  it('свежая установка: источника нет — переносить нечего, метка ставится', async () => {
    const platform = platformWithPreferences();
    const target = createInMemoryStorage();

    const outcome = await migrateIndexedDbToNative({
      target,
      platform,
      sourceDatabaseName: sourceName,
    });

    expect(outcome).toEqual({ status: 'not_needed', reason: 'no_source' });
    // Метка ставится и здесь: следующий запуск не должен перебирать
    // `indexedDB.databases()` заново.
    expect(platform.localPreferences).toHaveProperty('get');
    const preferences = platform.localPreferences as { get: (key: string) => string | null };
    expect(preferences.get(BACKEND_MIGRATION_KEY)).toBe('1');
  });

  it('переносит задачи, иерархию, tombstone и очередь синхронизации', async () => {
    const source = createIndexedDbStorage(sourceName);
    const parent = makeTask({ title: 'Родитель' });
    const child = makeTask({ title: 'Подзадача', parentTaskId: parent.id });
    const removed = makeTask({
      title: 'Удалённая',
      deletedAt: Temporal.Instant.fromEpochMilliseconds(1_700_000_000_000),
    });
    const entry = makeOutboxEntry('task', parent.id);
    await source.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [
          { entity: 'task', value: parent },
          { entity: 'task', value: child },
          { entity: 'task', value: removed },
        ],
        outbox: [entry],
      });
    });
    await source.closeConnection();

    const target = createInMemoryStorage();
    const outcome = await migrateIndexedDbToNative({
      target,
      platform: platformWithPreferences(),
      sourceDatabaseName: sourceName,
    });

    expect(outcome.status).toBe('migrated');
    if (outcome.status !== 'migrated') return;
    expect(outcome.counts).toMatchObject({ tasks: 3, deletedTasks: 1, outbox: 1 });

    const moved = await target.dumpForMigration();
    expect(moved.tasks.map((task) => task.id).toSorted()).toEqual(
      [parent.id, child.id, removed.id].toSorted(),
    );
    // Иерархия — та же, а не «похожая».
    expect(moved.tasks.find((task) => task.id === child.id)?.parentTaskId).toBe(parent.id);
    // Tombstone остался tombstone'ом.
    expect(moved.tasks.find((task) => task.id === removed.id)?.deletedAt).not.toBeNull();
    // Очередь синхронизации переехала и не выросла: перенос не порождает
    // операций, которых человек не делал.
    expect(moved.syncOutbox.map((row) => row.opId)).toEqual([entry.opId]);
  });

  it('база-источник удаляется после переноса — иначе стёртые данные воскресли бы', async () => {
    const source = createIndexedDbStorage(sourceName);
    const task = makeTask({ title: 'Задача' });
    await source.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: task }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });
    // Соединение, которым тест наполнял источник, закрывается: в жизни к
    // моменту переноса прежний запуск приложения уже завершился, и второго
    // живого соединения к этой базе нет.
    await source.closeConnection();

    const outcome = await migrateIndexedDbToNative({
      target: createInMemoryStorage(),
      platform: platformWithPreferences(),
      sourceDatabaseName: sourceName,
    });
    expect(outcome.status).toBe('migrated');

    const databases = await indexedDB.databases();
    expect(databases.map((entry) => entry.name)).not.toContain(sourceName);
  });

  it('повторный запуск ничего не переносит: метка на месте', async () => {
    const platform = platformWithPreferences();
    const preferences = platform.localPreferences as { set: (k: string, v: string) => void };
    preferences.set(BACKEND_MIGRATION_KEY, '1');

    const outcome = await migrateIndexedDbToNative({
      target: createInMemoryStorage(),
      platform,
      sourceDatabaseName: sourceName,
    });

    expect(outcome).toEqual({ status: 'not_needed', reason: 'already_migrated' });
  });

  it('непустой приёмник не трогается: перенос не затирает новое старым', async () => {
    const target = createInMemoryStorage();
    const existing = makeTask({ title: 'Уже в SQLite' });
    await target.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: existing }],
        outbox: [makeOutboxEntry('task', existing.id)],
      });
    });

    const outcome = await migrateIndexedDbToNative({
      target,
      platform: platformWithPreferences(),
      sourceDatabaseName: sourceName,
    });

    expect(outcome).toEqual({ status: 'not_needed', reason: 'sqlite_not_empty' });
    expect((await target.dumpForMigration()).tasks).toHaveLength(1);
  });

  it('после стирания локальных данных перенос НЕ повторяется', async () => {
    // Сценарий-ловушка: человек стёр всё (M52), SQLite снова пуста. Без
    // метки и без удаления источника задачи воскресли бы из IndexedDB —
    // ровно то, что `05§13` запрещает.
    const source = createIndexedDbStorage(sourceName);
    const task = makeTask({ title: 'Стёртая' });
    await source.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: task }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });
    await source.closeConnection();

    const platform = platformWithPreferences();
    const target = createInMemoryStorage();
    expect(
      (await migrateIndexedDbToNative({ target, platform, sourceDatabaseName: sourceName })).status,
    ).toBe('migrated');

    await target.eraseAllLocalData();
    const second = await migrateIndexedDbToNative({
      target,
      platform,
      sourceDatabaseName: sourceName,
    });

    expect(second).toEqual({ status: 'not_needed', reason: 'already_migrated' });
    expect((await target.dumpForMigration()).tasks).toEqual([]);
  });
});
