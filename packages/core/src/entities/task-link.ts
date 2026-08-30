import type { Temporal } from '@js-temporal/polyfill';

import type { Uuid } from '../values.js';

/** `task_links` (`02§2`, `01§1`, `01§25`). Лимит 20/задачу и разрешённые
 * схемы (`https, http, mailto, tel`; прочие — explicit confirmation) —
 * забота валидатора, не этого типа. */
export interface TaskLink {
  readonly id: Uuid;
  readonly taskId: Uuid;
  readonly url: string;
  readonly displayLabel: string | null;
  readonly createdAt: Temporal.Instant;
  readonly updatedAt: Temporal.Instant;
}
