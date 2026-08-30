import type { Temporal } from '@js-temporal/polyfill';

import type { FieldClocks, Rank, Uuid } from '../values.js';

/** `checklist_items` (`02§2`, конспект §1). Лимит 200/задачу — §2 п.17,
 * забота валидатора (кросс-строчный count, не выразить типом). */
export interface ChecklistItem {
  readonly id: Uuid;
  readonly taskId: Uuid;
  readonly text: string;
  readonly done: boolean;
  readonly rank: Rank;
  readonly deletedAt: Temporal.Instant | null;
  readonly clocks: FieldClocks;
}
