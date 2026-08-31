import { BASELINE_SCHEMA_PLAN } from '../migration/index.js';

/**
 * Интерпретация `../migration/baseline-schema-plan.ts` для IndexedDB
 * (задание пакета работ E02.3, п.2): `create_table` → `db.createObjectStore`,
 * `create_index` → `store.createIndex`, `create_fts_index` → своя структура
 * поиска (FTS5 в браузере нет, `02§4`) — три собственных object store,
 * см. `search-index.ts`. Ключевое свойство: НИКАКОГО отдельного списка
 * "какие store/индексы завести" здесь не заведено вручную — `BASELINE_SCHEMA_PLAN`
 * уже перечисляет `ALL_TABLES`/`ALL_INDEXES` (`../schema/*`) в правильном
 * порядке (таблицы раньше индексов), этот файл только МЕХАНИЧЕСКИ переводит
 * каждую операцию плана в вызов IndexedDB API — расхождение между "что
 * реально создалось в браузере" и "что говорит замороженная схема" здесь
 * структурно невозможно, а не проверяется тестом постфактум.
 */

/** Три дополнительных store поисковой подсистемы (`./search-index.ts`),
 * не описанные в платформонезависимой `../schema/*` (та описывает только
 * то, что одинаково для SQLite/IndexedDB; собственная структура поискового
 * индекса — решение каждого адаптера отдельно, `02§4`). */
export const SEARCH_DOCUMENTS_STORE = 'search_documents';
export const SEARCH_INDEX_STORE = 'search_index';
export const SEARCH_INDEX_BY_ENTITY_STORE = 'search_index_by_entity';

export const DATABASE_VERSION = 1;

/**
 * Единственный `onupgradeneeded`-обработчик версии 1 (базовая схема "с
 * нуля" — новая база всегда открывается версией 0 → 1, апгрейда с более
 * ранней непустой версии здесь ещё не бывает, поэтому нет ветвления по
 * `event.oldVersion`). IndexedDB сама делает это атомарно: весь
 * `onupgradeneeded` выполняется в неявной versionchange-транзакции — если
 * внутри бросить исключение, транзакция откатывается целиком и версия базы
 * не меняется (это и есть "web versioned IndexedDB upgrade" из `02§15` —
 * атомарность здесь даёт сама платформа, не собственный checkpoint-код).
 * Recovery-снапшот для БУДУЩИХ деструктивных миграций (версия 2+) — отдельный
 * механизм, `./checkpoint.ts`, не завязанный на то, что версия 1 — это
 * создание, не изменение.
 */
export function applyBaselineSchema(db: IDBDatabase): void {
  const stores = new Map<string, IDBObjectStore>();

  for (const op of BASELINE_SCHEMA_PLAN) {
    if (op.op !== 'create_table') continue;
    const keyPath = toKeyPath(op.table.primaryKey);
    stores.set(op.table.name, db.createObjectStore(op.table.name, { keyPath }));
  }

  for (const op of BASELINE_SCHEMA_PLAN) {
    if (op.op !== 'create_index') continue;
    const store = stores.get(op.index.table);
    if (store === undefined) {
      throw new Error(
        `applyBaselineSchema: индекс "${op.index.name}" ссылается на несуществующую таблицу "${op.index.table}"`,
      );
    }
    store.createIndex(op.index.name, toKeyPath(op.index.columns));
  }

  // create_fts_index (FTS5 у IndexedDB нет, `02§4`) — своя поисковая
  // подсистема, три store вместо одного виртуального FTS5-индекса.
  db.createObjectStore(SEARCH_DOCUMENTS_STORE, { keyPath: ['kind', 'id'] });
  db.createObjectStore(SEARCH_INDEX_STORE, { keyPath: 'token' });
  db.createObjectStore(SEARCH_INDEX_BY_ENTITY_STORE, { keyPath: ['kind', 'id'] });
}

function toKeyPath(columns: readonly string[]): string | string[] {
  if (columns.length === 0) {
    throw new Error('toKeyPath: пустой список колонок ключа');
  }
  return columns.length === 1 ? columns[0]! : [...columns];
}

/** Все имена store, которые обязаны быть в области видимости транзакции
 * `runTransaction` (`./indexeddb-storage.ts`) — тринадцать доменных таблиц
 * (`../schema/tables.ts` `ALL_TABLES`) плюс три поисковых. Читается из
 * `applyBaselineSchema`-плана, а не хардкожен отдельным списком — по той же
 * причине, что и сама схема выше: один источник, а не два синхронизируемых
 * вручную. */
export function allObjectStoreNames(): readonly string[] {
  const tableNames = BASELINE_SCHEMA_PLAN.filter((op) => op.op === 'create_table').map(
    (op) => op.table.name,
  );
  return [...tableNames, SEARCH_DOCUMENTS_STORE, SEARCH_INDEX_STORE, SEARCH_INDEX_BY_ENTITY_STORE];
}
