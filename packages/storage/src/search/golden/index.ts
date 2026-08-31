/**
 * `@shagi/storage/search-golden` — golden-тесты ранжирования поиска
 * (задание пакета работ E02.3, п.4). Подпуть экспорта отдельный от
 * `@shagi/storage` (`package.json` → `exports`), как и `@shagi/storage/contract`
 * — этот модуль тянет `vitest` (`run-golden.ts`), основной вход пакета — нет.
 *
 * Датасет (`./dataset.ts`) — настоящие доменные сущности `@shagi/core`,
 * загружаемые в хранилище через обычный `StoragePort.runTransaction` +
 * `applyMutation`, как любые другие данные. Ожидания (`./cases.ts`) —
 * список «запрос → порядок результатов». Раннер (`./run-golden.ts`)
 * прогоняет их против ЛЮБОЙ функции поиска — сейчас против IndexedDB
 * (`../../../test/search/golden/`), позже — без изменений здесь — против
 * будущего SQLite FTS5-адаптера.
 */
export { GOLDEN_SEARCH_CASES, type GoldenSearchCase } from './cases.js';
export {
  GOLDEN_LABEL_IMPORTANT,
  GOLDEN_LABEL_URGENT,
  GOLDEN_LABELS,
  GOLDEN_PROJECT_HEALTH,
  GOLDEN_PROJECT_REPAIR,
  GOLDEN_PROJECT_VACATION,
  GOLDEN_PROJECTS,
  GOLDEN_TASK_ALL_DEALS_YE_TITLE,
  GOLDEN_TASK_BOOK_TICKETS,
  GOLDEN_TASK_BUY_IPHONE,
  GOLDEN_TASK_CHECK_MAIL,
  GOLDEN_TASK_CLEAN_HOUSE,
  GOLDEN_TASK_ELECTRONICS,
  GOLDEN_TASK_FIX_BUG,
  GOLDEN_TASK_LABELS,
  GOLDEN_TASK_MILK_EXACT,
  GOLDEN_TASK_MILK_PREFIX,
  GOLDEN_TASK_MILK_SUBSTRING,
  GOLDEN_TASK_MILK_TOKEN,
  GOLDEN_TASK_REPORT_YO_TITLE,
  GOLDEN_TASK_REVISION_ACTIVE,
  GOLDEN_TASK_REVISION_COMPLETED,
  GOLDEN_TASK_SEE_DOCTOR,
  GOLDEN_TASKS,
} from './dataset.js';
export { runSearchRankingGolden, type SearchFunction } from './run-golden.js';
