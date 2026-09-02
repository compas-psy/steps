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
  /**
   * Последняя по времени начала партия — по ней экран импорта узнаёт, есть
   * ли ещё что откатывать.
   *
   * Нужен именно поиск «последней», а не список: `01§26` даёт на отмену
   * 10 минут, но экран Import Result живёт ровно до первого перехода — уйдя
   * с него, человек терял единственную кнопку «Отменить импорт», хотя окно
   * ещё не истекло. Найдено живым прогоном M46–M49.
   */
  findLatest(): Promise<ImportBatch | null>;
}
