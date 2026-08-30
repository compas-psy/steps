import type { Temporal } from '@js-temporal/polyfill';

import type { Hlc } from '../hlc.js';
import type { Uuid } from '../values.js';
import type { EntityType } from './entity-type.js';

/**
 * `sync_conflicts` (`02§2`, `02§8`). Surfaced conflict для одного и того же
 * user-visible поля при причинно-конкурентной, существенно различающейся
 * правке — выбор победителя (LWW по HLC, либо явный A/B от пользователя) —
 * забота merge-слоя `@shagi/sync`, не этого типа.
 */
export interface SyncConflict {
  readonly id: Uuid;
  readonly entityType: EntityType;
  readonly entityId: Uuid;
  readonly field: string;
  readonly localValue: unknown;
  readonly remoteValue: unknown;
  readonly winnerValue: unknown;
  readonly localClock: Hlc;
  readonly remoteClock: Hlc;
  readonly resolvedAt: Temporal.Instant | null;
}
