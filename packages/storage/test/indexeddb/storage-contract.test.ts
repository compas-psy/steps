import { runStorageContract } from '../../src/contract/storage-contract.js';

import { createTestIndexedDbStorage } from './support/create-test-storage.js';

/**
 * Прогон общего набора тестов контракта (задание пакета работ E02.1, п.7;
 * E02.3 «Главное требование») против IndexedDB-реализации — без единой
 * правки самого `runStorageContract`/`../../src/contract/storage-contract.ts`,
 * только своя фабрика (`fake-indexeddb`, devDependency, в тестовом рантайме
 * Node — см. `./support/create-test-storage.ts`).
 */
runStorageContract('indexeddb', () => createTestIndexedDbStorage());
