import type { Temporal } from '@js-temporal/polyfill';

import type { FieldClocks, Rank, Uuid } from '../values.js';

/** `sections` (`02§2`, конспект §1). `project_id` обязателен по схеме —
 * секция без проекта не существует. Title 1..80 — забота валидатора. */
export interface Section {
  readonly id: Uuid;
  readonly projectId: Uuid;
  readonly title: string;
  readonly rank: Rank;
  readonly deletedAt: Temporal.Instant | null;
  readonly clocks: FieldClocks;
}
