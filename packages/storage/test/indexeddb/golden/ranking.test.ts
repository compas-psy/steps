import { makeOutboxEntry } from '../../../src/contract/fixtures.js';
import type { EntityWrite } from '../../../src/ports/index.js';
import {
  GOLDEN_LABELS,
  GOLDEN_PROJECTS,
  GOLDEN_TASK_LABELS,
  GOLDEN_TASKS,
  runSearchRankingGolden,
  type SearchFunction,
} from '../../../src/search/golden/index.js';
import { createTestIndexedDbStorage } from '../support/create-test-storage.js';

/**
 * Прогон golden-тестов ранжирования (`01§15`) против НАСТОЯЩЕЙ IndexedDB-
 * реализации — задание пакета работ E02.3, п.4, главная часть пакета работ.
 * Тот же `runSearchRankingGolden`/`GOLDEN_SEARCH_CASES`, что и эталонная
 * проверка датасета в `test/search/golden/ranking.test.ts` — без единой
 * правки набора запросов или ожиданий (см. комментарий там), только своя
 * загрузка датасета в реальное хранилище.
 */
async function loadGoldenDatasetSearchFunction(): Promise<SearchFunction> {
  const storage = createTestIndexedDbStorage();

  const writes: EntityWrite[] = [
    ...GOLDEN_PROJECTS.map((project): EntityWrite => ({ entity: 'project', value: project })),
    ...GOLDEN_LABELS.map((label): EntityWrite => ({ entity: 'label', value: label })),
    ...GOLDEN_TASKS.map((task): EntityWrite => ({ entity: 'task', value: task })),
    ...GOLDEN_TASK_LABELS.map((link): EntityWrite => ({ entity: 'task_label', value: link })),
  ];

  await storage.runTransaction(async (tx) => {
    await tx.applyMutation({
      writes,
      // Один общий outbox-элемент на всю загрузку датасета — контракту
      // важно только, что список непустой (`DomainMutation.outbox`,
      // `../../../src/ports/transaction.ts`); что именно синхронизируется
      // при загрузке фикстур golden-теста — вне интереса этого теста.
      outbox: [makeOutboxEntry('project', GOLDEN_PROJECTS[0]!.id)],
    });
  });

  return (query: string) => storage.search(query);
}

runSearchRankingGolden('indexeddb', loadGoldenDatasetSearchFunction);
