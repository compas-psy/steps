import { normalizeForSearch, tokenizeForSearch } from './normalize.js';
import type { MatchTier, SearchCandidate } from './types.js';

/**
 * Классифицирует совпадение нормализованного запроса с одним нормализованным
 * полем — уровни 1–4 правил `01§15`. Порядок проверок обязан быть именно
 * таким (`exact` → `prefix` → `token` → `substring`), потому что каждый
 * следующий вариант — надмножество предыдущего по формальному условию
 * (exact ⊂ prefix ⊂ ... по побитовому смыслу "startsWith"/"includes"): при
 * проверке в другом порядке более точное совпадение никогда бы не
 * возвращалось, всё схлопывалось бы в `substring`.
 */
function classifyField(normalizedQuery: string, rawField: string): 1 | 2 | 3 | 4 | null {
  const normalizedField = normalizeForSearch(rawField);
  if (normalizedField.length === 0) return null;

  if (normalizedField === normalizedQuery) return 1;
  if (normalizedField.startsWith(normalizedQuery)) return 2;

  const tokens = tokenizeForSearch(normalizedField);
  if (tokens.some((token) => token.startsWith(normalizedQuery))) return 3;

  if (normalizedField.includes(normalizedQuery)) return 4;
  return null;
}

/** Уровень 6 применяется к любому кандидату с полем `description` — и у
 * `Task`, и у `Project` оно есть в схеме (`../schema/tables.ts`), у `Label`
 * — нет (сама сущность его не имеет), поэтому этот геттер, а не общее поле
 * в `SearchCandidate`. */
function descriptionOf(candidate: SearchCandidate): string | null {
  return candidate.kind === 'label' ? null : candidate.description;
}

/** Уровень 5 ("project/label") относится только к задачам: совпадение по
 * ДЕНОРМАЛИЗОВАННЫМ полям проекта/меток задачи, а не к самим сущностям
 * Project/Label (те находятся собственным заголовком через уровни 1–4,
 * `matchCandidate` вызовет `classifyField` на их `title` раньше, чем дойдёт
 * сюда). Правило `01§15` не разделяет "по проекту" и "по меткам" на разные
 * уровни — здесь тоже один уровень на оба поля. */
function projectOrLabelSubstringMatch(
  normalizedQuery: string,
  candidate: SearchCandidate,
): boolean {
  if (candidate.kind !== 'task') return false;
  const texts = [
    ...(candidate.projectTitle !== null ? [candidate.projectTitle] : []),
    ...candidate.labelDisplayNames,
  ];
  return texts.some((text) => normalizeForSearch(text).includes(normalizedQuery));
}

/**
 * Главная точка входа: классифицирует кандидата целиком по всем шести
 * уровням `01§15`, возвращая САМЫЙ высокий применимый (наименьшее число —
 * `1` выше `6`), либо `null`, если кандидат не совпадает ни на одном уровне
 * (в отличие от промаха внутри одного уровня — такой кандидат не входит в
 * результаты поиска вовсе, не просто ранжируется низко).
 */
export function matchCandidate(query: string, candidate: SearchCandidate): MatchTier | null {
  const normalizedQuery = normalizeForSearch(query);
  if (normalizedQuery.length === 0) return null;

  const titleTier = classifyField(normalizedQuery, candidate.title);
  if (titleTier !== null) return titleTier;

  if (projectOrLabelSubstringMatch(normalizedQuery, candidate)) return 5;

  const description = descriptionOf(candidate);
  if (description !== null && normalizeForSearch(description).includes(normalizedQuery)) {
    return 6;
  }

  return null;
}
