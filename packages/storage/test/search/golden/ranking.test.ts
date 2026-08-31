import { runSearchRankingGolden } from '../../../src/search/golden/run-golden.js';

import { referenceSearch } from './reference-search.js';

/**
 * Прогон golden-тестов ранжирования (`01§15`) против эталонной
 * реализации поиска (`./reference-search.ts` — линейный проход по
 * датасету, не движок хранения). Подтверждает, что датасет и ожидания
 * (`src/search/golden/cases.ts`) сами по себе непротиворечивы.
 *
 * `test/indexeddb/golden/ranking.test.ts` обязан прогнать ТОТ ЖЕ раннер
 * против настоящего IndexedDB-движка — заблокировано решением о
 * devDependency-полифиле для IndexedDB в Node (см. отчёт пакета работ
 * E02.3).
 */
runSearchRankingGolden(
  'эталонная реализация (линейный проход, без хранилища)',
  () => referenceSearch,
);
