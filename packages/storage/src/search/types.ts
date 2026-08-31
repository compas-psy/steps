import type { Uuid } from '@shagi/core';

/**
 * Три вида сущностей, которые покрывает поиск (`01§15`: "Search covers
 * tasks, completed tasks, projects, labels, future-available tasks" —
 * "completed" и "future-available" не отдельные виды сущностей, а свойства
 * задачи; видов ровно три).
 */
export type SearchEntityKind = 'task' | 'project' | 'label';

/**
 * Задача как кандидат поиска — уже спроецированная в форму, достаточную
 * ранжированию, а не сырой доменный `Task` (`@shagi/core`). Поля
 * `projectTitle`/`labelDisplayNames` — денормализованные значения,
 * буквально те же, что зафиксированы в `../schema/indexes.ts`
 * `TASK_SEARCH_FTS_INDEX.denormalizedFields` (`['project_title',
 * 'label_display_names']`, `02§3`): чья это обязанность — собрать их (join
 * при живом чтении на IndexedDB, физическая FTS5-колонка на native) —
 * решает конкретный адаптер хранения, не этот файл. `availableFrom` здесь
 * намеренно нет: "future-available tasks" (`01§15`) — это про то, что
 * задачу нужно ВКЛЮЧИТЬ в кандидаты поиска, даже если она ещё не наступила
 * (в отличие от обычных списков) — это забота выборки кандидатов
 * (адаптер), а не ранжирования (этот модуль сортирует уже отобранных
 * кандидатов и не должен ничего знать про `availableFrom`).
 */
export interface SearchableTask {
  readonly kind: 'task';
  readonly id: Uuid;
  readonly title: string;
  readonly description: string;
  readonly status: 'active' | 'completed';
  readonly projectTitle: string | null;
  readonly labelDisplayNames: readonly string[];
}

export interface SearchableProject {
  readonly kind: 'project';
  readonly id: Uuid;
  readonly title: string;
  readonly description: string;
}

export interface SearchableLabel {
  readonly kind: 'label';
  readonly id: Uuid;
  readonly title: string;
}

/**
 * Кандидат поиска — то, над чем работает вся логика этого модуля. Общее
 * поле `title` на всех трёх вариантах (для `Label` это `displayName`, но
 * называем его `title` здесь же — единообразный вход для уровней 1–4,
 * см. `match.ts`) специально выбрано так, чтобы уровни 1–4 правил
 * ранжирования (`01§15`) работали одной и той же функцией независимо от
 * вида сущности: и задача, и проект, и метка ищутся по своему заголовку
 * одинаково — это буквально то же самое правило, применённое к трём разным
 * таблицам, не три разных правила.
 */
export type SearchCandidate = SearchableTask | SearchableProject | SearchableLabel;

/**
 * Семь уровней ранжирования `01§15` — здесь только шесть числовых
 * (уровень 7, "active раньше completed", это не уровень *совпадения*, а
 * правило сравнения при равенстве уровня, см. `compareRankedResults` в
 * `rank.ts`).
 */
export type MatchTier = 1 | 2 | 3 | 4 | 5 | 6;

export interface RankedSearchResult<C extends SearchCandidate = SearchCandidate> {
  readonly candidate: C;
  readonly tier: MatchTier;
}

/** Минимальная ссылка на результат — то, что фактически сравнивают
 * golden-тесты (`./golden/`), не заботясь об остальных полях кандидата. */
export interface SearchResultRef {
  readonly kind: SearchEntityKind;
  readonly id: Uuid;
}

export function toResultRef(result: RankedSearchResult): SearchResultRef {
  return { kind: result.candidate.kind, id: result.candidate.id };
}
