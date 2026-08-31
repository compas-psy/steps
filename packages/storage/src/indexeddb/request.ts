import { applyBaselineSchema, DATABASE_VERSION } from './schema.js';

/**
 * Промис-обёртки над колбэчным `IDBRequest`/`IDBTransaction` API (задание
 * пакета работ E02.3, п.2) — единственное место в адаптере, где встречаются
 * события IndexedDB, остальной код пишет `await requestToPromise(...)`.
 * `addEventListener`, а не `on<событие> =` — гейт репозитория
 * (`unicorn/prefer-add-event-listener`) требует именно так: presigning
 * `on*` молча заменил бы предыдущий обработчик, если бы кто-то по ошибке
 * повторно вызвал одну из этих функций на уже занятом объекте.
 */
export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('IndexedDB request: неизвестная ошибка'));
    });
  });
}

/** Разрешается на `complete`, отклоняется на `abort`/`error` — путь коммита
 * `runTransaction` (`./indexeddb-storage.ts`) при успешном колбэке. */
export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('error', () => {
      reject(tx.error ?? new Error('IndexedDB transaction: ошибка'));
    });
    tx.addEventListener('abort', () => {
      reject(tx.error ?? new Error('IndexedDB transaction: прервана (abort)'));
    });
  });
}

/** Разрешается в любом исходе (`complete`/`abort`/`error`), никогда не
 * отклоняется — путь отката `runTransaction`: там уже есть "настоящая"
 * ошибка колбэка, которую нужно перебросить дальше, а не подменить её
 * ошибкой транзакции. Используется только чтобы ДОЖДАТЬСЯ физического
 * завершения `abort()`, прежде чем считать откат состоявшимся. */
export function transactionSettled(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('abort', () => resolve());
    tx.addEventListener('error', () => resolve());
  });
}

/**
 * Открывает (или создаёт) базу версии `../schema/*` (`./schema.ts`
 * `applyBaselineSchema`). `onblocked`-эквивалент (`'blocked'`) — не
 * гипотетический случай: он реален, если в том же процессе уже открыто
 * соединение со старой версией (нескольким вкладкам PWA конкурировать за
 * апгрейд — обычная ситуация в вебе, `02§4`); здесь превращается в явный
 * отказ, а не зависает молча.
 */
export function openIndexedDbDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => applyBaselineSchema(request.result));
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('openIndexedDbDatabase: не удалось открыть базу'));
    });
    request.addEventListener('blocked', () => {
      reject(
        new Error(
          'openIndexedDbDatabase: открытие заблокировано другим открытым соединением той же базы',
        ),
      );
    });
  });
}
