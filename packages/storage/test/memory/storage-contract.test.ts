import { createInMemoryStorage } from '../../src/memory/index.js';
import { runStorageContract } from '../../src/contract/storage-contract.js';

/**
 * Прогон общего набора тестов контракта (задание пакета работ E02.1, п.7)
 * против эталонной реализации в памяти. Следующие пакеты работ добавят
 * рядом `sqlite.contract.test.ts`/`indexeddb.contract.test.ts`, вызывающие
 * тот же `runStorageContract` со своей фабрикой — без переписывания тестов
 * ниже.
 */
runStorageContract('in-memory (эталон)', () => createInMemoryStorage());
