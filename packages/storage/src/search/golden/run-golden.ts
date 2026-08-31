import { beforeAll, describe, expect, it } from 'vitest';

import type { SearchResultRef } from '../types.js';

import { GOLDEN_SEARCH_CASES } from './cases.js';

/**
 * Функция поиска произвольной реализации: запрос → упорядоченный список
 * ссылок на результаты. Никаких требований к тому, ЧТО внутри (инвертированный
 * индекс IndexedDB, FTS5-запрос SQLite, линейный проход по массиву) — только
 * форма входа/выхода. Именно это делает `runSearchRankingGolden` пригодным
 * для ЛЮБОГО движка (задание пакета работ E02.3, п.4).
 */
export type SearchFunction = (query: string) => Promise<readonly SearchResultRef[]>;

/**
 * Общий набор golden-тестов ранжирования (`../golden/cases.ts`,
 * `01§15`) — по аналогии с `../../contract/storage-contract.ts`:
 * `runStorageContract(name, factory)` прогоняется против каждой реализации
 * `StoragePort` без переписывания тестов, этот раннер прогоняется против
 * каждой реализации поиска без переписывания ожиданий.
 *
 * `createSearchFunction` вызывается один раз на весь `describe` (не на
 * каждый case) — датасет статичен и весь набор запросов read-only, поэтому
 * дорогая инициализация движка (загрузка `../golden/dataset.ts` в
 * IndexedDB/SQLite) не должна повторяться 18+ раз.
 *
 * Сейчас (пакет работ E02.3) прогоняется против IndexedDB-реализации,
 * `../../../test/search/golden/`. Когда появится SQLite FTS5-адаптер
 * (параллельный пакет работ), тот же вызов с другой `createSearchFunction`
 * — без единой правки `./cases.ts` — подтвердит, что оба движка сходятся.
 */
export function runSearchRankingGolden(
  name: string,
  createSearchFunction: () => Promise<SearchFunction> | SearchFunction,
): void {
  describe(`golden-тесты ранжирования поиска (01§15) — ${name}`, () => {
    let search: SearchFunction;

    beforeAll(async () => {
      search = await createSearchFunction();
    });

    for (const testCase of GOLDEN_SEARCH_CASES) {
      it(`"${testCase.query}" — ${testCase.name}`, async () => {
        const results = await search(testCase.query);
        expect(results).toEqual(testCase.expected);
      });
    }
  });
}
