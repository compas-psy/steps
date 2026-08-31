import type { SyncOutboxEntry } from '@shagi/core';

/**
 * Только чтение. Запись в `sync_outbox` происходит исключительно как часть
 * `DomainMutation.outbox` внутри `applyMutation` (`./transaction.ts`) — вот
 * почему у самого outbox нет отдельного "write"-репозитория здесь.
 *
 * Жизненный цикл ПОСЛЕ записи — retry_count, удаление acked-записей
 * (`02§7`: "acked outbox запись удаляется") — принадлежит будущему
 * `@shagi/sync` (волна 2, вне границ этого пакета работ, см. задание
 * E02.1 «Границы»). Здесь достаточно уметь прочитать очередь для foreground
 * push-цикла ("push ≤500 ops").
 */
export interface SyncOutboxRepository {
  /** Упорядочено по `createdAt` — старые операции первыми (`02§7`). */
  listPending(limit?: number): Promise<readonly SyncOutboxEntry[]>;

  countPending(): Promise<number>;
}
