import { matchCandidate } from './match.js';
import type { RankedSearchResult, SearchCandidate } from './types.js';

/**
 * Вес для уровня 7 ("active раньше completed при равенстве", `01§15` п.7).
 * У `Project`/`Label` статуса нет — они всегда получают вес активной задачи
 * (`0`): правило говорит про порядок active/completed ЗАДАЧ, не про то, что
 * проекты/метки должны тонуть под завершёнными задачами при равном уровне
 * совпадения (в спецификации об этом ничего нет, а обратное поведение было
 * бы странным для пользователя — из двух совпадений на одном уровне метка
 * не должна прятаться под старой завершённой задачей).
 */
function statusWeight(candidate: SearchCandidate): 0 | 1 {
  return candidate.kind === 'task' && candidate.status === 'completed' ? 1 : 0;
}

/**
 * Сравнение двух уже проклассифицированных результатов для сортировки.
 * Первые два критерия — буквально уровни 1–4/5/6 и 7 из `01§15`. Третий
 * критерий (сравнение `id`) — то, чего в спецификации нет: `01§15` не
 * определяет tie-break, когда после уровня совпадения И active/completed
 * ещё остаётся равенство (например, две активные задачи с одинаковым
 * заголовком). Без него порядок результатов зависел бы от порядка
 * итерации `Map`/курсора IndexedDB/строк SQLite — недетерминированно и не
 * воспроизводимо в golden-тестах. Сравнение по `id` — самый нейтральный
 * вариант (не завязан ни на одно бизнес-поле, которое могло бы случайно
 * стать НЕЯВНЫМ восьмым правилом ранжирования); реализация IndexedDB и
 * будущая SQLite FTS5 обязаны сойтись и в этом детерминированном хвосте,
 * иначе golden-тесты (`./golden/`) разойдутся не из-за настоящего
 * расхождения ранжирования, а из-за случайного порядка равных результатов.
 */
export function compareRankedResults(a: RankedSearchResult, b: RankedSearchResult): number {
  if (a.tier !== b.tier) return a.tier - b.tier;

  const statusDiff = statusWeight(a.candidate) - statusWeight(b.candidate);
  if (statusDiff !== 0) return statusDiff;

  if (a.candidate.id === b.candidate.id) return 0;
  return a.candidate.id < b.candidate.id ? -1 : 1;
}

/**
 * Полный конвейер: фильтрует кандидатов, не совпавших ни на одном уровне,
 * классифицирует остальных и сортирует по правилам `01§15`. Чистая функция
 * над уже полученным списком кандидатов (задание пакета работ E02.3, п.1)
 * — она не знает и не должна знать, откуда кандидаты взялись (IndexedDB
 * инвертированный индекс, SQLite FTS5, линейный проход по массиву в
 * golden-тестах — не её забота).
 */
export function rankCandidates(
  query: string,
  candidates: readonly SearchCandidate[],
): RankedSearchResult[] {
  const ranked: RankedSearchResult[] = [];
  for (const candidate of candidates) {
    const tier = matchCandidate(query, candidate);
    if (tier !== null) ranked.push({ candidate, tier });
  }
  return ranked.toSorted(compareRankedResults);
}
