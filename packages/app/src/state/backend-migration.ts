/**
 * Одноразовый перенос содержимого из IndexedDB в нативную SQLite —
 * обязательство ADR-0005 перед уже установленными сборками.
 *
 * --- Почему перенос вообще нужен ------------------------------------------
 *
 * До ADR-0005 Android-оболочка работала на IndexedDB (ADR-0006 — временное
 * решение с явно записанным условием закрытия). Установки с этим backend'ом
 * существуют. Просто переключить backend значило бы, что у человека при
 * обновлении «исчезли» все задачи: они физически остались в IndexedDB, но
 * продукт смотрит уже в другое место. Это потеря данных с точки зрения
 * человека, независимо от того, что байты целы.
 *
 * --- Когда перенос происходит ----------------------------------------------
 *
 * Условия проверяются ВСЕ ТРИ, и каждое закрывает свой сценарий:
 *
 * 1. **SQLite пуста.** Если в ней уже что-то есть — работа идёт, переносить
 *    нечего и нельзя (перенос затёр бы новое старым).
 * 2. **Метки «уже переносили» нет.** Она ставится после успешного переноса.
 * 3. **База IndexedDB существует и непуста.** Проверяется через
 *    `indexedDB.databases()` — БЕЗ открытия: открытие СОЗДАЛО бы пустую базу
 *    на свежей установке, и следующий запуск считал бы, что переносить
 *    что-то надо.
 *
 * --- Почему после переноса база IndexedDB удаляется -------------------------
 *
 * Не ради чистоты. Без удаления возникает настоящая дыра: человек стирает
 * локальные данные (M52, `05§13` — «стереть» значит стереть), SQLite
 * пустеет, и при следующем запуске условие 1 снова выполняется — стёртые
 * задачи воскресают из IndexedDB. Удаление источника закрывает это
 * структурно; метка в настройках — вторая линия на случай, если удаление
 * не удалось.
 *
 * --- Что именно переносится ------------------------------------------------
 *
 * `dumpForMigration`/`loadFromMigrationDump` (`@shagi/storage`) — ВСЁ
 * состояние устройства, включая tombstone, очередь синхронизации и партии
 * импорта. Не `exportAllEntities`: тот делает копию данных человека для
 * бэкапа и сознательно опускает и то, и другое (разбор — в самих методах).
 */
import { isAvailable, type PlatformCapabilitiesRegistry } from '@shagi/platform';
import type { StorageDump, StoragePort } from '@shagi/storage';
import { createIndexedDbStorage } from '@shagi/storage/indexeddb';

/** Ключ метки в `localPreferences` — тот же префикс, что у темы и
 * онбординга. */
export const BACKEND_MIGRATION_KEY = 'shagi.preferences.migratedToSqlite';

export type BackendMigrationOutcome =
  | {
      readonly status: 'not_needed';
      readonly reason: 'sqlite_not_empty' | 'already_migrated' | 'no_source';
    }
  | {
      readonly status: 'migrated';
      readonly counts: BackendMigrationCounts;
      readonly sourceDeleted: boolean;
    }
  | { readonly status: 'failed'; readonly error: string };

export interface BackendMigrationCounts {
  readonly tasks: number;
  readonly projects: number;
  readonly sections: number;
  readonly labels: number;
  readonly outbox: number;
  /** Задачи-tombstone среди перенесённых — считаются отдельно, потому что
   * именно их легче всего потерять незаметно. */
  readonly deletedTasks: number;
}

function countsOf(dump: StorageDump): BackendMigrationCounts {
  return {
    tasks: dump.tasks.length,
    projects: dump.projects.length,
    sections: dump.sections.length,
    labels: dump.labels.length,
    outbox: dump.syncOutbox.length,
    deletedTasks: dump.tasks.filter((task) => task.deletedAt !== null).length,
  };
}

function isDumpEmpty(dump: StorageDump): boolean {
  return (
    dump.tasks.length === 0 &&
    dump.projects.length === 0 &&
    dump.sections.length === 0 &&
    dump.labels.length === 0 &&
    dump.checklistItems.length === 0 &&
    dump.recurrenceSeries.length === 0 &&
    dump.syncOutbox.length === 0
  );
}

/** Есть ли такая база IndexedDB — без её создания. */
async function indexedDbExists(databaseName: string): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  // `databases()` есть в Chromium/WebKit; в средах без него честнее
  // считать, что источника нет, чем открыть базу и тем самым создать её.
  const list = (indexedDB as { databases?: () => Promise<{ name?: string }[]> }).databases;
  if (typeof list !== 'function') return false;
  const databases = await list.call(indexedDB);
  return databases.some((entry) => entry.name === databaseName);
}

async function deleteIndexedDb(databaseName: string): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  return new Promise<boolean>((resolve) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.addEventListener('success', () => resolve(true), { once: true });
    request.addEventListener('error', () => resolve(false), { once: true });
    // `blocked` — база ещё открыта где-то: перенос всё равно состоялся,
    // метка не даст повториться, поэтому это не провал переноса.
    request.addEventListener('blocked', () => resolve(false), { once: true });
  });
}

export interface BackendMigrationInput {
  readonly target: StoragePort;
  readonly platform: PlatformCapabilitiesRegistry;
  /** Имя базы IndexedDB прежней сборки. */
  readonly sourceDatabaseName: string;
}

export async function migrateIndexedDbToNative(
  input: BackendMigrationInput,
): Promise<BackendMigrationOutcome> {
  const preferences = input.platform.localPreferences;
  const marked = isAvailable(preferences) && preferences.get(BACKEND_MIGRATION_KEY) === '1';
  if (marked) return { status: 'not_needed', reason: 'already_migrated' };

  const existing = await input.target.dumpForMigration();
  if (!isDumpEmpty(existing)) return { status: 'not_needed', reason: 'sqlite_not_empty' };

  if (!(await indexedDbExists(input.sourceDatabaseName))) {
    // Свежая установка: источника нет. Метку всё равно ставим — чтобы
    // следующий запуск не перебирал `databases()` заново.
    if (isAvailable(preferences)) preferences.set(BACKEND_MIGRATION_KEY, '1');
    return { status: 'not_needed', reason: 'no_source' };
  }

  try {
    const source = createIndexedDbStorage(input.sourceDatabaseName);
    const dump = await source.dumpForMigration();
    if (isDumpEmpty(dump)) {
      if (isAvailable(preferences)) preferences.set(BACKEND_MIGRATION_KEY, '1');
      await source.closeConnection();
      await deleteIndexedDb(input.sourceDatabaseName);
      return { status: 'not_needed', reason: 'no_source' };
    }
    await input.target.loadFromMigrationDump(dump);
    // Метка ДО удаления: если удаление сорвётся, повтор всё равно не
    // случится.
    if (isAvailable(preferences)) preferences.set(BACKEND_MIGRATION_KEY, '1');
    // Соединение закрывается ПЕРЕД удалением: при живом соединении
    // `deleteDatabase` не удаляет базу, а уходит в `onblocked` и ждёт —
    // источник остался бы на диске навсегда (найдено тестом).
    await source.closeConnection();
    const sourceDeleted = await deleteIndexedDb(input.sourceDatabaseName);
    return { status: 'migrated', counts: countsOf(dump), sourceDeleted };
  } catch (error) {
    // Провал переноса НЕ ставит метку и НЕ трогает источник: данные
    // остаются там, где были, и следующий запуск попробует снова.
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}
