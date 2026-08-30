import type { Temporal } from '@js-temporal/polyfill';

import type { FieldClocks, Uuid } from '../values.js';
import type { EntityType } from './entity-type.js';

/**
 * `sync_outbox` (`02§2`, `02§7`, `00§7.1`). Локальная команда пишет
 * entity+outbox атомарно в одной транзакции — сам этот тип лишь описывает
 * форму записи; атомарность транзакции — забота командного слоя (следующий
 * пакет работ), не этого типа.
 */
export interface SyncOutboxEntry {
  readonly opId: Uuid;
  readonly deviceId: Uuid;
  readonly entityType: EntityType;
  readonly entityId: Uuid;
  readonly patchJson: Readonly<Record<string, unknown>>;
  readonly fieldClocksJson: FieldClocks;
  readonly baseRevision: bigint;
  readonly createdAt: Temporal.Instant;
  readonly retryCount: number;
}
