import type { Temporal } from '@js-temporal/polyfill';

import type {
  DomainMutation,
  EntityWrite,
  StoragePort,
  StorageWriteTransaction,
  TombstonePurgeSummary,
} from '../ports/index.js';
import type { SearchResultRef } from '../search/index.js';
import { isNonEmptyArray } from '../values.js';
import { isTombstoneExpired } from '../tombstone/index.js';

import {
  decodeChecklistItem,
  decodeLabel,
  decodeProject,
  decodeSection,
  decodeTask,
  encodeAttachment,
  encodeChecklistItem,
  encodeLabel,
  encodeProject,
  encodeReminder,
  encodeRecurrenceSeries,
  encodeSection,
  encodeSyncOutboxEntry,
  encodeTask,
  encodeTaskLabel,
  encodeTaskLink,
  type StoredChecklistItem,
  type StoredLabel,
  type StoredProject,
  type StoredSection,
  type StoredTask,
} from './codec.js';
import { openIndexedDbDatabase, transactionDone, transactionSettled } from './request.js';
import { createQueryPort } from './repositories.js';
import { runSearch } from './search-index.js';
import {
  reindexLabelDocument,
  reindexProjectDocument,
  reindexTaskDocument,
  reindexTaskLabelDocument,
} from './search-index.js';
import { allObjectStoreNames } from './schema.js';
import {
  clearStore,
  deleteFromStore,
  getAllFromStore,
  putInStore,
  storeAccessFor,
  type StoreAccess,
} from './store-access.js';

/**
 * `StoragePort` поверх IndexedDB (задание пакета работ E02.3, п.2). Две
 * половины:
 *
 *  - `runTransaction` держит ОДНУ живую `readwrite`-транзакцию IndexedDB на
 *    область видимости всех store (`../schema/*` + поисковых, `allObjectStoreNames`)
 *    на весь колбэк: `applyMutation`/чтения внутри `tx` идут через ЭТУ ЖЕ
 *    транзакцию, поэтому read-your-writes (задание E02.1 п.7, уже
 *    проверено контрактом) получается бесплатно — это нативная гарантия
 *    IndexedDB для запросов внутри одной транзакции, не отдельный буфер,
 *    который пришлось бы поддерживать вручную (как в `../memory/`
 *    copy-on-write). Колбэк, бросивший исключение — `idbTx.abort()`
 *    (native rollback всех `put`, сделанных до этого момента); колбэк,
 *    завершившийся нормально — ждём `oncomplete`, только тогда результат
 *    считается зафиксированным.
 *
 *    ВАЖНО (архитектурное ограничение, не гипотетическое): между двумя
 *    последовательными `await` на IndexedDB-запросах транзакция обязана
 *    оставаться "активной" — то есть колбэк `run` не должен `await`-ить
 *    что-то, не привязанное к этой же транзакции (сетевой запрос,
 *    `setTimeout`, промис от другого API) ПОСЕРЕДИНЕ последовательности
 *    `applyMutation`/чтений: спецификация IndexedDB считает транзакцию
 *    неактивной, как только управление возвращается в цикл событий без
 *    незавершённого запроса на ней (`fake-indexeddb`, как и браузеры,
 *    планирует `onsuccess` через задачу, а не микротаск — см. комментарий
 *    `request.ts`). Последовательные `await requestToPromise(...)` держат
 *    транзакцию живой (продолжение `await` — микротаска, выполняется до
 *    следующей задачи), это стандартный паттерн (тот же, на котором
 *    построены `idb`/Dexie); не-IDB-асинхронность внутри колбэка — нет.
 *
 *  - Чтения СНАРУЖИ `runTransaction` (прямые вызовы `storage.tasks.findById(...)`
 *    и т.п.) открывают свою короткую `readonly`-транзакцию на каждый вызов
 *    через `Proxy`-обёртку `wrapReadRepository` — так `StorageQueryPort`
 *    не обязан помнить, есть ли сейчас открытая транзакция, а вызывающему
 *    коду (будущий командный слой) не нужно ничего передавать явно.
 */
export class IndexedDbStorage implements StoragePort {
  private readonly dbPromise: Promise<IDBDatabase>;

  constructor(dbPromise: Promise<IDBDatabase>) {
    this.dbPromise = dbPromise;
  }

  private async withReadAccess<T>(run: (access: StoreAccess) => Promise<T>): Promise<T> {
    const db = await this.dbPromise;
    const idbTx = db.transaction(allObjectStoreNames(), 'readonly');
    const result = await run(storeAccessFor(idbTx));
    await transactionDone(idbTx);
    return result;
  }

  get tasks() {
    return this.wrapReadRepository((access) => createQueryPort(access).tasks);
  }
  get projects() {
    return this.wrapReadRepository((access) => createQueryPort(access).projects);
  }
  get sections() {
    return this.wrapReadRepository((access) => createQueryPort(access).sections);
  }
  get labels() {
    return this.wrapReadRepository((access) => createQueryPort(access).labels);
  }
  get taskLabels() {
    return this.wrapReadRepository((access) => createQueryPort(access).taskLabels);
  }
  get checklistItems() {
    return this.wrapReadRepository((access) => createQueryPort(access).checklistItems);
  }
  get reminders() {
    return this.wrapReadRepository((access) => createQueryPort(access).reminders);
  }
  get recurrenceSeries() {
    return this.wrapReadRepository((access) => createQueryPort(access).recurrenceSeries);
  }
  get attachments() {
    return this.wrapReadRepository((access) => createQueryPort(access).attachments);
  }
  get taskLinks() {
    return this.wrapReadRepository((access) => createQueryPort(access).taskLinks);
  }
  get importBatches() {
    return this.wrapReadRepository((access) => createQueryPort(access).importBatches);
  }
  get syncOutbox() {
    return this.wrapReadRepository((access) => createQueryPort(access).syncOutbox);
  }
  get syncConflicts() {
    return this.wrapReadRepository((access) => createQueryPort(access).syncConflicts);
  }

  /** Проксирует каждый метод read-репозитория через свою короткую
   * `readonly`-транзакцию (`withReadAccess`) — один `Proxy` вместо
   * тринадцати структурно одинаковых обёрток метод-за-методом. Типобезопасность
   * границы: `factory` типизирована честно (`(access) => TRepository`),
   * `Proxy`-перехват — нет (в этом и весь смысл: он универсален по форме
   * "любой метод возвращает `Promise`", что верно для ВСЕХ методов ВСЕХ
   * репозиториев этого пакета, `../ports/*.ts` — там нет ни одного
   * синхронного метода). */
  private wrapReadRepository<TRepository extends object>(
    factory: (access: StoreAccess) => TRepository,
  ): TRepository {
    return new Proxy({} as TRepository, {
      get: (_target, prop) => {
        return (...args: unknown[]) =>
          this.withReadAccess((access) => {
            const repository = factory(access);
            const method = (repository as Record<string | symbol, unknown>)[prop];
            if (typeof method !== 'function') {
              throw new TypeError(`wrapReadRepository: "${String(prop)}" не метод репозитория`);
            }
            return (method as (...methodArgs: unknown[]) => Promise<unknown>).apply(
              repository,
              args,
            );
          });
      },
    });
  }

  /** Поиск (`../search/`, п.1/п.2 задания E02.3) — не часть `StoragePort`
   * (контракт E02.1 его не описывает, см. отчёт), отдельный метод,
   * специфичный для этого адаптера; так же будет выглядеть эквивалент у
   * будущего SQLite FTS5-адаптера — своя сигнатура `search`, тот же
   * результат на golden-датасете (`../search/golden/`). */
  async search(query: string): Promise<readonly SearchResultRef[]> {
    return this.withReadAccess((access) => runSearch(access, query));
  }

  async runTransaction<T>(run: (tx: StorageWriteTransaction) => Promise<T>): Promise<T> {
    const db = await this.dbPromise;
    const idbTx = db.transaction(allObjectStoreNames(), 'readwrite');
    const access = storeAccessFor(idbTx);
    const query = createQueryPort(access);
    const tx: StorageWriteTransaction = {
      ...query,
      applyMutation: (mutation: DomainMutation) => applyMutationToStores(access, mutation),
    };

    let result: T;
    try {
      result = await run(tx);
    } catch (error) {
      try {
        idbTx.abort();
      } catch {
        // транзакция уже settled (сама упала раньше, например на ошибке
        // запроса) — abort() на уже завершённой транзакции бросает
        // InvalidStateError, но откатывать уже нечего, это не новая ошибка.
      }
      await transactionSettled(idbTx);
      throw error;
    }

    await transactionDone(idbTx);
    return result;
  }

  async eraseAllLocalData(): Promise<void> {
    const db = await this.dbPromise;
    // Одна транзакция на ВСЕ store (`allObjectStoreNames` — тот же список,
    // что и у записи): наполовину стёртая база хуже нестёртой, человек
    // считает, что данных нет, а часть осталась. База не удаляется целиком
    // (`deleteDatabase`) намеренно — это потребовало бы закрыть соединение
    // и переоткрыть его со всеми миграциями, тогда как приложение с этим
    // `StoragePort` продолжает работать здесь же, сразу после стирания.
    const idbTx = db.transaction(allObjectStoreNames(), 'readwrite');
    const access = storeAccessFor(idbTx);
    for (const name of allObjectStoreNames()) {
      // eslint-disable-next-line no-await-in-loop -- store'ы чистятся в ОДНОЙ транзакции, параллелить их нечем
      await clearStore(access, name);
    }
    await transactionDone(idbTx);
  }

  async purgeExpiredTombstones(now: Temporal.Instant): Promise<TombstonePurgeSummary> {
    const db = await this.dbPromise;
    const idbTx = db.transaction(
      ['tasks', 'projects', 'sections', 'labels', 'checklist_items'],
      'readwrite',
    );
    const access = storeAccessFor(idbTx);

    // Поисковый документ tombstone-задачи/проекта/метки уже убран в момент
    // самого tombstone (`applyMutation` → `reindex*Document`, см. ниже) — к
    // моменту purge его в `search_documents` уже нет, трогать поисковые
    // store здесь не нужно (см. комментарий `search-index.ts`).
    const summary: TombstonePurgeSummary = {
      task: await purgeExpired<StoredTask>(access, 'tasks', decodeTask, now),
      project: await purgeExpired<StoredProject>(access, 'projects', decodeProject, now),
      section: await purgeExpired<StoredSection>(access, 'sections', decodeSection, now),
      label: await purgeExpired<StoredLabel>(access, 'labels', decodeLabel, now),
      checklistItem: await purgeExpired<StoredChecklistItem>(
        access,
        'checklist_items',
        decodeChecklistItem,
        now,
      ),
    };

    await transactionDone(idbTx);
    return summary;
  }
}

async function purgeExpired<TStored extends { readonly id: string }>(
  access: StoreAccess,
  storeName: string,
  decode: (row: TStored) => { readonly id: string; readonly deletedAt: Temporal.Instant | null },
  now: Temporal.Instant,
): Promise<number> {
  const rows = await getAllFromStore<TStored>(access, storeName);
  let removed = 0;
  for (const row of rows) {
    const decoded = decode(row);
    if (decoded.deletedAt !== null && isTombstoneExpired(decoded.deletedAt, now)) {
      await deleteFromStore(access, storeName, decoded.id);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Единственное место, где сущность физически попадает в store, и
 * единственное место, где физически попадает outbox-запись — тот же
 * инвариант, что у `../memory/in-memory-storage.ts` `applyMutationToTables`
 * (задание E02.1: "мимо outbox не записать"), тот же рантайм-щит
 * `isNonEmptyArray` на случай вызова из нетипизированного кода
 * (`test/ports/transaction-outbox-invariant.test.ts` — общий для всех
 * реализаций тест контракта, не переопределяется здесь).
 *
 * После каждой записи задачи/проекта/метки/связи задача-метка — синхронный
 * (в смысле: та же транзакция) вызов `reindex*Document` (`./search-index.ts`)
 * держит `search_documents`/`search_index`/`search_index_by_entity` в
 * согласии с только что записанными каноническими строками — поисковый
 * индекс никогда не видел бы "наполовину" применённую мутацию, потому что
 * либо вся `runTransaction` коммитится, либо откатывается целиком.
 */
async function applyMutationToStores(access: StoreAccess, mutation: DomainMutation): Promise<void> {
  if (!isNonEmptyArray(mutation.outbox)) {
    throw new TypeError(
      'applyMutation: outbox обязан содержать хотя бы одну запись (00§7, задание E02.1) — ' +
        'типы это уже запрещают на этапе компиляции, рантайм-проверка здесь на случай ' +
        'вызова из нетипизированного кода.',
    );
  }

  for (const write of mutation.writes) {
    await writeEntity(access, write);
  }

  for (const entry of mutation.outbox) {
    await putInStore(access, 'sync_outbox', encodeSyncOutboxEntry(entry));
  }
}

async function writeEntity(access: StoreAccess, write: EntityWrite): Promise<void> {
  switch (write.entity) {
    case 'task':
      await putInStore(access, 'tasks', encodeTask(write.value));
      await reindexTaskDocument(access, write.value);
      return;
    case 'project':
      await putInStore(access, 'projects', encodeProject(write.value));
      await reindexProjectDocument(access, write.value);
      return;
    case 'section':
      await putInStore(access, 'sections', encodeSection(write.value));
      return;
    case 'label':
      await putInStore(access, 'labels', encodeLabel(write.value));
      await reindexLabelDocument(access, write.value);
      return;
    case 'task_label':
      await putInStore(access, 'task_labels', encodeTaskLabel(write.value));
      await reindexTaskLabelDocument(access, write.value);
      return;
    case 'checklist_item':
      await putInStore(access, 'checklist_items', encodeChecklistItem(write.value));
      return;
    case 'reminder':
      await putInStore(access, 'reminders', encodeReminder(write.value));
      return;
    case 'recurrence_series':
      await putInStore(access, 'recurrence_series', encodeRecurrenceSeries(write.value));
      return;
    case 'attachment':
      await putInStore(access, 'attachments', encodeAttachment(write.value));
      return;
    case 'task_link':
      await putInStore(access, 'task_links', encodeTaskLink(write.value));
      return;
  }
}

export function createIndexedDbStorage(databaseName: string): IndexedDbStorage {
  return new IndexedDbStorage(openIndexedDbDatabase(databaseName));
}
