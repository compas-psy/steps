import type { Temporal } from '@js-temporal/polyfill';

import type { Uuid } from '../values.js';

/**
 * `import_batches` (`02§2`, `01§26`). Точный набор значений жизненного
 * цикла (`status`) не зафиксирован дословно ни в `01§26`, ни в `02§2` —
 * известна только семантика границ (batch активен, пока доступен
 * `Отменить импорт`: 10 минут или до первой ручной правки, `01§26`), а не
 * конкретные строки состояния. Изобретать enum, которого нет в контракте,
 * рискованнее, чем оставить `status` открытой строкой; конкретизация —
 * задача `@shagi/importer` (следующий пакет работ), владеющего этим
 * жизненным циклом.
 */
export interface ImportBatch {
  readonly id: Uuid;
  readonly source: string;
  readonly startedAt: Temporal.Instant;
  readonly finishedAt: Temporal.Instant | null;
  readonly rollbackDeadline: Temporal.Instant;
  readonly status: string;
  readonly reportJson: Readonly<Record<string, unknown>>;
}
