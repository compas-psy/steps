import {
  isTaskLabelActive,
  type Label,
  type Project,
  type Task,
  type TaskLabel,
  type Uuid,
} from '@shagi/core';

import { TASK_LABEL_BY_LABEL_INDEX, TASK_LABEL_BY_TASK_INDEX } from '../schema/indexes.js';
import {
  normalizeForSearch,
  rankCandidates,
  tokenizeForSearch,
  toResultRef,
  type SearchCandidate,
  type SearchEntityKind,
  type SearchResultRef,
} from '../search/index.js';

import {
  decodeLabel,
  decodeProject,
  decodeTask,
  decodeTaskLabel,
  type StoredLabel,
  type StoredProject,
  type StoredTask,
  type StoredTaskLabel,
} from './codec.js';
import {
  SEARCH_DOCUMENTS_STORE,
  SEARCH_INDEX_BY_ENTITY_STORE,
  SEARCH_INDEX_STORE,
} from './schema.js';
import {
  clearStore,
  deleteFromStore,
  getAllFromStore,
  getByKey,
  putInStore,
  type StoreAccess,
} from './store-access.js';

/**
 * Поисковая подсистема IndexedDB-адаптера (задание пакета работ E02.3, п.2)
 * — три store вместо FTS5 (которого у IndexedDB нет, `02§4`):
 *
 *  - `search_documents` — по одной денормализованной записи на кандидата
 *    (задача/проект/метка): заголовок, описание, статус, ДЕНОРМАЛИЗОВАННЫЕ
 *    `projectTitle`/`labelDisplayNames` задачи (буквально те же поля, что
 *    `../schema/indexes.ts` `TASK_SEARCH_FTS_INDEX.denormalizedFields`).
 *    Это то, что реально читает `runSearch` — полный скан этого store,
 *    затем `../search/rankCandidates` (общая логика ранжирования, п.1
 *    того же пакета работ) решает итоговый порядок. Обязательно ПОЛНЫЙ
 *    скан, а не выборка через токен-индекс ниже: уровни 4/6 правил `01§15`
 *    (подстрока, описание) требуют проверить КАЖДОГО кандидата — токен-индекс
 *    по префиксам этого структурно не сузит без потери корректности.
 *
 *  - `search_index` (токен → список посылок `{kind, id}`) и
 *    `search_index_by_entity` (обратная карта `{kind, id} → токены`) —
 *    честно поддерживаются на каждой записи (см. `reindexTokens` ниже,
 *    убирает только устаревшие посылки, не весь список целиком), но
 *    `runSearch` их пока не читает — по причине из предыдущего абзаца
 *    ($search_documents$ и так сканируется целиком ради уровней 4/6, поэтому
 *    выборка кандидатов через `search_index` не сокращала бы фактическую
 *    работу на такой словарной модели, где токен покрывает только уровни
 *    1–3). Следующий шаг, КОГДА датасет вырастет настолько, что полный скан
 *    `search_documents` станет узким местом — заменить его в `runSearch` на
 *    "взять из `search_index` только кандидатов уровней 1–3 напрямую, плюс
 *    отдельный n-gram/триграммный индекс для уровня 4" (задача следующего
 *    пакета работ; см. отчёт E02.3). Здесь эти две таблицы уже настоящие и
 *    протестированы напрямую (`test/indexeddb/search-index.test.ts`) — не
 *    заглушка, а фундамент, который используется в `rebuildSearchIndex` и
 *    будет использован в `runSearch`, когда до этого дойдёт очередь.
 *
 * "Search index rebuildable from canonical rows" (`02§3`) обеспечивается
 * буквально: `rebuildSearchIndex` строит все три store заново из `tasks`/
 * `projects`/`labels`/`task_labels` — источник истины всегда канонические
 * таблицы, поисковые store — их производная, не наоборот.
 */

export interface StoredSearchDocument {
  readonly kind: SearchEntityKind;
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: 'active' | 'completed' | null;
  readonly project_title: string | null;
  readonly label_display_names: readonly string[];
}

interface StoredSearchIndexPosting {
  readonly kind: SearchEntityKind;
  readonly id: string;
}

interface StoredSearchIndexEntry {
  readonly token: string;
  readonly postings: readonly StoredSearchIndexPosting[];
}

interface StoredSearchIndexByEntity {
  readonly kind: SearchEntityKind;
  readonly id: string;
  readonly tokens: readonly string[];
}

function documentKey(kind: SearchEntityKind, id: string): [SearchEntityKind, string] {
  return [kind, id];
}

// --- Токен-индекс (посылки) --------------------------------------------------

async function addPosting(
  access: StoreAccess,
  token: string,
  kind: SearchEntityKind,
  id: string,
): Promise<void> {
  const entry = await getByKey<StoredSearchIndexEntry>(access, SEARCH_INDEX_STORE, token);
  const postings = entry?.postings ?? [];
  if (postings.some((posting) => posting.kind === kind && posting.id === id)) return;
  await putInStore(access, SEARCH_INDEX_STORE, { token, postings: [...postings, { kind, id }] });
}

async function removePosting(
  access: StoreAccess,
  token: string,
  kind: SearchEntityKind,
  id: string,
): Promise<void> {
  const entry = await getByKey<StoredSearchIndexEntry>(access, SEARCH_INDEX_STORE, token);
  if (entry === undefined) return;
  const postings = entry.postings.filter(
    (posting) => !(posting.kind === kind && posting.id === id),
  );
  if (postings.length === 0) {
    await deleteFromStore(access, SEARCH_INDEX_STORE, token);
  } else {
    await putInStore(access, SEARCH_INDEX_STORE, { token, postings });
  }
}

/** Пересчитывает токены ОДНОЙ сущности через обратную карту
 * `search_index_by_entity` — убирает ровно те посылки, которых у неё
 * больше нет, добавляет ровно новые; не трогает посылки других сущностей
 * на этот же токен (общий случай: два разных заголовка делят общее слово). */
async function reindexTokens(
  access: StoreAccess,
  kind: SearchEntityKind,
  id: string,
  title: string | null,
): Promise<void> {
  const key = documentKey(kind, id);
  const existing = await getByKey<StoredSearchIndexByEntity>(
    access,
    SEARCH_INDEX_BY_ENTITY_STORE,
    key,
  );
  const oldTokens = existing?.tokens ?? [];
  const newTokens =
    title === null ? [] : [...new Set(tokenizeForSearch(normalizeForSearch(title)))];

  for (const token of oldTokens) {
    if (!newTokens.includes(token)) await removePosting(access, token, kind, id);
  }
  for (const token of newTokens) {
    if (!oldTokens.includes(token)) await addPosting(access, token, kind, id);
  }

  if (newTokens.length === 0) {
    await deleteFromStore(access, SEARCH_INDEX_BY_ENTITY_STORE, key);
  } else {
    await putInStore(access, SEARCH_INDEX_BY_ENTITY_STORE, { kind, id, tokens: newTokens });
  }
}

// --- search_documents ---------------------------------------------------------

async function upsertSearchDocument(access: StoreAccess, doc: StoredSearchDocument): Promise<void> {
  await putInStore(access, SEARCH_DOCUMENTS_STORE, doc);
  await reindexTokens(access, doc.kind, doc.id, doc.title);
}

async function removeSearchDocument(
  access: StoreAccess,
  kind: SearchEntityKind,
  id: string,
): Promise<void> {
  await deleteFromStore(access, SEARCH_DOCUMENTS_STORE, documentKey(kind, id));
  await reindexTokens(access, kind, id, null);
}

/** Живой (не tombstone) проект по id — `null`, если проекта нет или он
 * tombstone: денормализация задачи не должна показывать удалённый проект
 * как живой, независимо от того, что в `Task.originalProjectNameSnapshot`
 * (это отдельное поле командного слоя, не забота поиска). */
async function liveProjectTitle(
  access: StoreAccess,
  projectId: Uuid | null,
): Promise<string | null> {
  if (projectId === null) return null;
  const row = await getByKey<StoredProject>(access, 'projects', projectId);
  if (row === undefined || row.deleted_at !== null) return null;
  return row.title;
}

async function activeLabelDisplayNames(access: StoreAccess, taskId: Uuid): Promise<string[]> {
  const links = await requestIndexGetAll<StoredTaskLabel>(
    access,
    'task_labels',
    TASK_LABEL_BY_TASK_INDEX.name,
    taskId,
  );
  const names: string[] = [];
  for (const link of links) {
    if (!isTaskLabelActive(decodeTaskLabel(link))) continue;
    const label = await getByKey<StoredLabel>(access, 'labels', link.label_id);
    if (label !== undefined && label.deleted_at === null) names.push(label.display_name);
  }
  return names;
}

function requestIndexGetAll<T>(
  access: StoreAccess,
  storeName: string,
  indexName: string,
  key: IDBValidKey,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = access.store(storeName).index(indexName).getAll(key);
    request.addEventListener('success', () => resolve(request.result as T[]));
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('IndexedDB index.getAll: ошибка'));
    });
  });
}

export async function reindexTaskDocument(access: StoreAccess, task: Task): Promise<void> {
  if (task.deletedAt !== null) {
    await removeSearchDocument(access, 'task', task.id);
    return;
  }
  const projectTitle = await liveProjectTitle(access, task.projectId);
  const labelDisplayNames = await activeLabelDisplayNames(access, task.id);

  await upsertSearchDocument(access, {
    kind: 'task',
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    project_title: projectTitle,
    label_display_names: labelDisplayNames,
  });
}

/** Переименование/удаление проекта денормализовано на КАЖДУЮ его задачу
 * (`search_documents.project_title`) — каскад ищет их полным сканом
 * `tasks` (в замороженных индексах `../schema/indexes.ts` нет отдельного
 * `tasks(project_id)`, только составной `(project_id, section_id, status,
 * rank)` — использовать его для голого "все задачи проекта" пришлось бы
 * диапазоном по всем комбинациям хвостовых полей; полный скан здесь проще
 * и не хуже по факту, переименования проектов — редкая операция). */
export async function reindexProjectDocument(access: StoreAccess, project: Project): Promise<void> {
  if (project.deletedAt !== null) {
    await removeSearchDocument(access, 'project', project.id);
  } else {
    await upsertSearchDocument(access, {
      kind: 'project',
      id: project.id,
      title: project.title,
      description: project.description,
      status: null,
      project_title: null,
      label_display_names: [],
    });
  }

  const taskRows = await getAllFromStore<StoredTask>(access, 'tasks');
  for (const row of taskRows) {
    if (row.project_id === project.id && row.deleted_at === null) {
      await reindexTaskDocument(access, decodeTask(row));
    }
  }
}

/** Переименование/удаление метки — тот же каскад, что у проекта, но через
 * индекс `task_labels(label_id)` (он есть в замороженном списке, в отличие
 * от `tasks(project_id)`), поэтому здесь без полного скана. */
export async function reindexLabelDocument(access: StoreAccess, label: Label): Promise<void> {
  if (label.deletedAt !== null) {
    await removeSearchDocument(access, 'label', label.id);
  } else {
    await upsertSearchDocument(access, {
      kind: 'label',
      id: label.id,
      title: label.displayName,
      description: '',
      status: null,
      project_title: null,
      label_display_names: [],
    });
  }

  const links = await requestIndexGetAll<StoredTaskLabel>(
    access,
    'task_labels',
    TASK_LABEL_BY_LABEL_INDEX.name,
    label.id,
  );
  const seenTaskIds = new Set<string>();
  for (const link of links) {
    if (seenTaskIds.has(link.task_id)) continue;
    seenTaskIds.add(link.task_id);
    const taskRow = await getByKey<StoredTask>(access, 'tasks', link.task_id);
    if (taskRow !== undefined && taskRow.deleted_at === null) {
      await reindexTaskDocument(access, decodeTask(taskRow));
    }
  }
}

/** `task_labels` — upsert по `(taskId, labelId)` (`../ports/task-label-repository.ts`):
 * задевает ровно ОДНУ задачу, без каскада. */
export async function reindexTaskLabelDocument(
  access: StoreAccess,
  link: TaskLabel,
): Promise<void> {
  const taskRow = await getByKey<StoredTask>(access, 'tasks', link.taskId);
  if (taskRow !== undefined && taskRow.deleted_at === null) {
    await reindexTaskDocument(access, decodeTask(taskRow));
  }
}

// --- Запрос и полная пересборка ------------------------------------------------

function toSearchCandidate(doc: StoredSearchDocument): SearchCandidate {
  if (doc.kind === 'task') {
    return {
      kind: 'task',
      id: doc.id as Uuid,
      title: doc.title,
      description: doc.description,
      status: doc.status as 'active' | 'completed',
      projectTitle: doc.project_title,
      labelDisplayNames: doc.label_display_names,
    };
  }
  if (doc.kind === 'project') {
    return { kind: 'project', id: doc.id as Uuid, title: doc.title, description: doc.description };
  }
  return { kind: 'label', id: doc.id as Uuid, title: doc.title };
}

/** Точка входа поиска (`../search/rankCandidates` — общая логика
 * ранжирования, здесь только сбор кандидатов, п.1/п.2 задания E02.3). */
export async function runSearch(
  access: StoreAccess,
  query: string,
): Promise<readonly SearchResultRef[]> {
  const docs = await getAllFromStore<StoredSearchDocument>(access, SEARCH_DOCUMENTS_STORE);
  const candidates = docs.map(toSearchCandidate);
  return rankCandidates(query, candidates).map(toResultRef);
}

/**
 * Полная пересборка всех трёх поисковых store из канонических таблиц —
 * "search index rebuildable from canonical rows" (`02§3`) как рабочая
 * функция, а не только утверждение в комментарии. Сначала проекты/метки (их
 * `reindex*Document` сам каскадом трогает связанные задачи), затем ЯВНО все
 * задачи ещё раз — так задачи без проекта/меток тоже гарантированно
 * получают свежую запись, а не полагаются на чужой каскад.
 */
export async function rebuildSearchIndex(access: StoreAccess): Promise<void> {
  await clearAllSearchStores(access);

  const projectRows = await getAllFromStore<StoredProject>(access, 'projects');
  for (const row of projectRows) {
    if (row.deleted_at === null) await reindexProjectDocument(access, decodeProject(row));
  }

  const labelRows = await getAllFromStore<StoredLabel>(access, 'labels');
  for (const row of labelRows) {
    if (row.deleted_at === null) await reindexLabelDocument(access, decodeLabel(row));
  }

  const taskRows = await getAllFromStore<StoredTask>(access, 'tasks');
  for (const row of taskRows) {
    if (row.deleted_at === null) await reindexTaskDocument(access, decodeTask(row));
  }
}

async function clearAllSearchStores(access: StoreAccess): Promise<void> {
  await clearStore(access, SEARCH_DOCUMENTS_STORE);
  await clearStore(access, SEARCH_INDEX_STORE);
  await clearStore(access, SEARCH_INDEX_BY_ENTITY_STORE);
}

export type { StoredSearchIndexEntry, StoredSearchIndexByEntity };
