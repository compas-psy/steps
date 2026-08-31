import type { ImportBatch, Uuid } from '@shagi/core';

/**
 * Только чтение. Жизненный цикл `import_batches` (какие статусы бывают,
 * когда создаётся/закрывается batch) — собственность `@shagi/importer`
 * (следующий пакет работ, см. комментарий `@shagi/core` `entities/import-batch.ts`);
 * этот пакет работ (E02.1) не изобретает для него отдельный write-контракт
 * поверх `applyMutation`, потому что `import_batches` не входит в
 * `EntityType` (`@shagi/core`) — он не мутируется обычным sync-merge'ем, а
 * значит и не описывается через `DomainMutation`. Write-путь для него —
 * задача пакета работ, который владеет `@shagi/importer`.
 */
export interface ImportBatchRepository {
  findById(id: Uuid): Promise<ImportBatch | null>;
}
