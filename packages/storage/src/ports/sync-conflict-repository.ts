import type { SyncConflict } from '@shagi/core';

/**
 * Только чтение. `sync_conflicts` заполняется merge-слоем (`@shagi/sync`,
 * волна 2) — здесь нет write-пути, потому что писать в эту таблицу неоткуда
 * до появления этого слоя (см. `@shagi/core` `entities/sync-conflict.ts`).
 */
export interface SyncConflictRepository {
  listUnresolved(): Promise<readonly SyncConflict[]>;
}
