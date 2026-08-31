/**
 * `@shagi/storage/memory` — эталонная реализация `StoragePort` в памяти
 * (задание пакета работ E02.1, п.6).
 */
import { createEmptyTables } from './tables.js';
import { InMemoryStorage } from './in-memory-storage.js';
import type { StoragePort } from '../ports/index.js';

export { InMemoryStorage } from './in-memory-storage.js';

/** Фабрика — то, что общий набор тестов контракта (`../contract/index.js`)
 * принимает параметром для прогона против этой реализации. */
export function createInMemoryStorage(): StoragePort {
  return new InMemoryStorage(createEmptyTables());
}
