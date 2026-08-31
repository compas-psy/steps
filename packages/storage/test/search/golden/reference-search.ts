import { isTaskLabelActive } from '@shagi/core';

import {
  GOLDEN_LABELS,
  GOLDEN_PROJECTS,
  GOLDEN_TASK_LABELS,
  GOLDEN_TASKS,
} from '../../../src/search/golden/index.js';
import { rankCandidates, toResultRef } from '../../../src/search/index.js';
import type { SearchCandidate, SearchResultRef } from '../../../src/search/index.js';

/**
 * Эталонная функция поиска ТОЛЬКО для теста: линейный проход по
 * golden-датасету (`src/search/golden/dataset.ts`) + общая логика
 * ранжирования (`src/search/`) — НЕ движок хранения, ни IndexedDB, ни
 * будущий SQLite. Единственная задача — подтвердить, что сам датасет и
 * ожидания golden-тестов (`src/search/golden/cases.ts`) внутренне
 * непротиворечивы уже сейчас, пока настоящий IndexedDB-движок заблокирован
 * решением о зависимости-полифиле (см. отчёт пакета работ E02.3). Когда
 * блокер снимется, `test/indexeddb/golden/ranking.test.ts` прогонит тот же
 * `runSearchRankingGolden` против настоящего движка — этот файл здесь
 * останется как быстрый sanity-тест самого датасета, не заменяет его.
 */
function buildCandidates(): readonly SearchCandidate[] {
  const projectById = new Map(GOLDEN_PROJECTS.map((project) => [project.id, project]));
  const labelById = new Map(GOLDEN_LABELS.map((label) => [label.id, label]));

  const taskCandidates: SearchCandidate[] = GOLDEN_TASKS.map((task) => {
    const project = task.projectId === null ? null : (projectById.get(task.projectId) ?? null);
    const labelDisplayNames = GOLDEN_TASK_LABELS.filter(
      (link) => link.taskId === task.id && isTaskLabelActive(link),
    ).map((link) => labelById.get(link.labelId)?.displayName ?? '');

    return {
      kind: 'task',
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      projectTitle: project?.title ?? null,
      labelDisplayNames,
    };
  });

  const projectCandidates: SearchCandidate[] = GOLDEN_PROJECTS.map((project) => ({
    kind: 'project',
    id: project.id,
    title: project.title,
    description: project.description,
  }));

  const labelCandidates: SearchCandidate[] = GOLDEN_LABELS.map((label) => ({
    kind: 'label',
    id: label.id,
    title: label.displayName,
  }));

  return [...taskCandidates, ...projectCandidates, ...labelCandidates];
}

const CANDIDATES = buildCandidates();

export function referenceSearch(query: string): Promise<readonly SearchResultRef[]> {
  return Promise.resolve(rankCandidates(query, CANDIDATES).map(toResultRef));
}
