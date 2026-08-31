import { requestToPromise } from './request.js';

/**
 * Тонкая обёртка над `IDBTransaction`, общая для чтения снаружи транзакции
 * (короткая read-only транзакция на один вызов репозитория) и чтения/записи
 * внутри `runTransaction` (одна долгоживущая readwrite-транзакция на весь
 * колбэк, `./indexeddb-storage.ts`) — оба случая репозитории (`./repositories.ts`)
 * и поисковый индекс (`./search-index.ts`) видят одинаково, им всё равно,
 * какая именно `IDBTransaction` за этим стоит.
 */
export interface StoreAccess {
  store(name: string): IDBObjectStore;
}

export function storeAccessFor(tx: IDBTransaction): StoreAccess {
  return { store: (name) => tx.objectStore(name) };
}

export async function getByKey<T>(
  access: StoreAccess,
  storeName: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  return requestToPromise(access.store(storeName).get(key) as IDBRequest<T | undefined>);
}

export async function getAllFromStore<T>(access: StoreAccess, storeName: string): Promise<T[]> {
  return requestToPromise(access.store(storeName).getAll() as IDBRequest<T[]>);
}

export async function putInStore(
  access: StoreAccess,
  storeName: string,
  value: unknown,
): Promise<void> {
  await requestToPromise(access.store(storeName).put(value));
}

export async function deleteFromStore(
  access: StoreAccess,
  storeName: string,
  key: IDBValidKey,
): Promise<void> {
  await requestToPromise(access.store(storeName).delete(key));
}

export async function clearStore(access: StoreAccess, storeName: string): Promise<void> {
  await requestToPromise(access.store(storeName).clear());
}
