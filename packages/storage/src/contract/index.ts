/**
 * `@shagi/storage/contract` — общий набор тестов контракта `StoragePort`
 * (задание пакета работ E02.1, п.7). Подпуть экспорта отдельный от
 * `@shagi/storage` (`package.json` → `exports`) намеренно: этот модуль тянет
 * `vitest`, а основной вход пакета — нет. Будущие SQLite/IndexedDB адаптеры
 * (следующие пакеты работ) импортируют `runStorageContract` отсюда и
 * прогоняют его же против своей фабрики — без переписывания тестов.
 */
export { runStorageContract } from './storage-contract.js';
export * from './fixtures.js';
