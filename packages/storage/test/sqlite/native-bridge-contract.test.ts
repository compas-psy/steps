import { runStorageContract } from '../../src/contract/storage-contract.js';
import { openNativeSqliteStorage } from '../../src/sqlite/sqlite-storage.js';
import type { StoragePort } from '../../src/ports/index.js';
import { createFakeNativeBridge } from './support/fake-native-bridge.js';

/**
 * Общий контракт хранилища, прогнанный через МОСТ в нативную SQLite
 * (`src/sqlite/native-bridge.ts`) — то самое обязательство ADR-0005: «обе
 * реализации порта обязаны проходить один и тот же `runStorageContract`,
 * расхождение красным падает в тесте, а не всплывает в проде».
 *
 * Мост здесь настоящий по форме и поддельный только по транспорту: вместо
 * Tauri `invoke` — прямой вызов, но **через `JSON.parse(JSON.stringify(...))`
 * на каждой границе**. Это не украшение: именно сериализация в JSON — то
 * место, где 64-битные целые (метки времени в наносекундах, `revision`)
 * теряют точность, если кодирование сделано неверно. Тест поймает это
 * ровно так же, как поймал бы настоящий IPC.
 *
 * База — ФАЙЛОВАЯ, во временном каталоге: `journal_mode=WAL` на `:memory:`
 * не включается в принципе (ограничение SQLite), а `BridgedSqliteDriver.open`
 * обязан убедиться, что WAL действительно включён.
 */

/**
 * `runStorageContract` требует СИНХРОННУЮ фабрику, а нативный путь
 * асинхронен целиком (открытие + протокол миграций). Обёртка отдаёт
 * `StoragePort` немедленно и откладывает КАЖДЫЙ вызов до готовности
 * настоящего — тестовый приём, чтобы прогнать контракт без единой правки
 * ни в нём, ни в продуктовом коде.
 */
/** Пустая цель для `Proxy` — вынесена наружу, чтобы не пересоздаваться на
 * каждый узел пути. */
function proxyTarget(): void {}

function lazyStoragePort(ready: Promise<StoragePort>): StoragePort {
  const node = (path: readonly string[]): unknown =>
    new Proxy(proxyTarget as unknown as object, {
      get: (_target, property) =>
        typeof property === 'string' ? node([...path, property]) : undefined,
      apply: (_target, _thisArg, args: unknown[]) =>
        ready.then((storage) => {
          let owner: Record<string, unknown> = storage as unknown as Record<string, unknown>;
          let value: unknown = storage;
          for (const key of path) {
            owner = value as Record<string, unknown>;
            value = owner[key];
          }
          return (value as (...a: unknown[]) => unknown).apply(owner, args);
        }),
    });
  return node([]) as StoragePort;
}

let counter = 0;

runStorageContract('sqlite (мост в нативную SQLite)', () =>
  lazyStoragePort(
    openNativeSqliteStorage(
      createFakeNativeBridge({ relaxForeignKeysAfterOpen: true }),
      `contract-${(counter += 1)}.db`,
    ),
  ),
);

export { lazyStoragePort };
