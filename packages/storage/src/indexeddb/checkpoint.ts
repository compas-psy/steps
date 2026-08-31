import type { MigrationCheckpointPort } from '../migration/index.js';

import { transactionDone } from './request.js';
import { clearStore, getAllFromStore, putInStore, storeAccessFor } from './store-access.js';

/**
 * Recovery-снапшот для IndexedDB-миграций (`02§15`: "web versioned
 * IndexedDB upgrade + recovery snapshot for destructive changes") —
 * реализация общего платформонезависимого контракта `MigrationCheckpointPort`
 * (`../migration/migration.ts`, задание пакета работ E02.1 п.4) для этого
 * адаптера (задание E02.3, "миграции с recovery-снапшотом").
 *
 * Снимок — плоский объект "имя store → все его записи" (уже закодированные
 * `Stored*`-строки, `./codec.ts`, НЕ доменные объекты — снимок должен
 * восстанавливать физическое состояние базы байт-в-байт, а не проходить
 * через кодек туда и обратно ещё раз). Версия 1 (базовая схема) создаётся
 * нативным `onupgradeneeded` (`./schema.ts`) — IndexedDB уже даёт
 * атомарность этому шагу бесплатно (весь `onupgradeneeded` — одна неявная
 * versionchange-транзакция: исключение внутри откатывает её целиком, версия
 * базы не меняется), поэтому `createIndexedDbCheckpoint`/`restoreIndexedDbCheckpoint`
 * здесь не используются для версии 1 — они существуют для БУДУЩЕЙ версии 2+
 * с деструктивным изменением схемы (`runMigrations` вызовет `createCheckpoint`
 * перед каждым шагом и `restoreCheckpoint`, если шаг бросит, `../migration/migration.ts`).
 * Механизм проверен НАПРЯМУЮ — `test/indexeddb/checkpoint.test.ts` — на
 * синтетическом сценарии "миграция 2 портит данные и падает → откат к
 * снимку версии 1", не дожидаясь появления настоящей версии 2.
 */
export interface IndexedDbSnapshot {
  readonly [storeName: string]: readonly unknown[];
}

/** Исполнитель миграции для этого адаптера (`TExecutor` в
 * `MigrationStep<TExecutor>`/`MigrationCheckpointPort<TExecutor, _>`) — само
 * открытое соединение с базой, единственное, что нужно шагам миграции. */
export interface IndexedDbMigrationExecutor {
  readonly db: IDBDatabase;
}

export async function createIndexedDbCheckpoint(
  executor: IndexedDbMigrationExecutor,
): Promise<IndexedDbSnapshot> {
  const storeNames = existingObjectStoreNames(executor.db);
  const idbTx = executor.db.transaction(storeNames, 'readonly');
  const access = storeAccessFor(idbTx);

  const snapshot: Record<string, unknown[]> = {};
  for (const name of storeNames) {
    snapshot[name] = await getAllFromStore(access, name);
  }

  await transactionDone(idbTx);
  return snapshot;
}

export async function restoreIndexedDbCheckpoint(
  executor: IndexedDbMigrationExecutor,
  checkpoint: IndexedDbSnapshot,
): Promise<void> {
  const storeNames = Object.keys(checkpoint).filter((name) =>
    existingObjectStoreNames(executor.db).includes(name),
  );
  const idbTx = executor.db.transaction(storeNames, 'readwrite');
  const access = storeAccessFor(idbTx);

  for (const name of storeNames) {
    await clearStore(access, name);
    for (const row of checkpoint[name] ?? []) {
      await putInStore(access, name, row);
    }
  }

  await transactionDone(idbTx);
}

/** Снимает только store, реально существующие в этом соединении на момент
 * вызова — не жёстко `allObjectStoreNames()` из `./schema.ts`: у будущей
 * версии N-1 (до очередной миграции) состав store может отличаться от
 * состава, который знает СЕЙЧАС собранный код адаптера (миграция как раз и
 * добавляет/убирает store). `db.objectStoreNames` — это то, что РЕАЛЬНО
 * есть в базе прямо сейчас, источник истины для снимка. */
function existingObjectStoreNames(db: IDBDatabase): readonly string[] {
  return Array.from(db.objectStoreNames);
}

export const indexedDbCheckpointPort: MigrationCheckpointPort<
  IndexedDbMigrationExecutor,
  IndexedDbSnapshot
> = {
  createCheckpoint: createIndexedDbCheckpoint,
  restoreCheckpoint: restoreIndexedDbCheckpoint,
};
