import type { RecurrenceSeries, Uuid } from '@shagi/core';

/** Только чтение — см. `task-repository.ts`. Полноценный движок повторов —
 * эпик E11; здесь только хранение и чтение серии. */
export interface RecurrenceSeriesRepository {
  findById(id: Uuid): Promise<RecurrenceSeries | null>;
}
