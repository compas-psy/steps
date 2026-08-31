/**
 * `@shagi/storage` — общая логика ранжирования поиска (задание пакета работ
 * E02.3, п.1). Платформонезависимая часть правил `01§15`: нормализация,
 * классификация совпадения, сравнение для сортировки — чистые функции над
 * уже полученными кандидатами, не знающие, откуда кандидаты взялись
 * (IndexedDB, будущий SQLite FTS5, что угодно ещё).
 *
 * Golden-датасет и раннер (`./golden/`) — отдельный подпуть экспорта
 * `@shagi/storage/search-golden` (как `@shagi/storage/contract` — тянет
 * `vitest`, поэтому не в этом барреле, см. комментарий `./golden/index.ts`).
 */
export { normalizeForSearch, tokenizeForSearch } from './normalize.js';
export { matchCandidate } from './match.js';
export { compareRankedResults, rankCandidates } from './rank.js';
export type {
  MatchTier,
  RankedSearchResult,
  SearchableLabel,
  SearchableProject,
  SearchableTask,
  SearchCandidate,
  SearchEntityKind,
  SearchResultRef,
} from './types.js';
export { toResultRef } from './types.js';
