import { createSqliteStorageForContract } from '../../src/sqlite/sqlite-storage.js';
import { runStorageContract } from '../../src/contract/storage-contract.js';

/**
 * Прогон общего набора тестов контракта (задание пакета работ E02.2, п.5)
 * против SQLite-адаптера — БЕЗ единой правки `runStorageContract` самой,
 * только своя фабрика (см. её комментарий и комментарий `createInMemoryStorage`
 * в `test/memory/storage-contract.test.ts`, который эта пара файлов
 * зеркалит по форме).
 *
 * `createSqliteStorageForContract` — быстрый синхронный конструктор
 * (`:memory:` + прямое применение DDL, см. его комментарий в
 * `src/sqlite/sqlite-storage.ts`): `runStorageContract` требует
 * `factory: () => StoragePort` без `Promise`, а он вызывается заново почти
 * в каждом `it(...)` ниже. Полный асинхронный протокол миграций
 * (`openSqliteStorage`) проверяется отдельно, по-настоящему —
 * `test/sqlite/migration.test.ts`.
 */
runStorageContract('sqlite (node:sqlite)', () => createSqliteStorageForContract());
