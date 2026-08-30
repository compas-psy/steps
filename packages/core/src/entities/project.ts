import type { Temporal } from '@js-temporal/polyfill';

import type { FieldClocks, Rank, Uuid } from '../values.js';

/**
 * `projects` (`02§2`, конспект §1, `01§1`, `01§12`).
 *
 * Лимиты — 10 активных на Free (§2 п.27), потолок 500 (§2 п.28), title
 * 1..120, description 0..10 000 (§2 п.22) — кросс-строчные/счётные проверки,
 * забота будущего валидатора, не этого типа.
 */
export type ProjectDefaultView = 'list' | 'board';

export interface Project {
  readonly id: Uuid;
  readonly title: string;
  readonly description: string;
  /** Контролируемая палитра, не произвольный hex (конспект §1). Конкретный
   * каталог токенов — собственность `@shagi/ui`; здесь непрозрачный ключ. */
  readonly colorToken: string;
  /** Ключ из курируемого набора иконок, либо `null` — без иконки. */
  readonly icon: string | null;
  readonly defaultView: ProjectDefaultView;
  readonly favorite: boolean;
  readonly archivedAt: Temporal.Instant | null;
  readonly rank: Rank;
  readonly createdAt: Temporal.Instant;
  readonly updatedAt: Temporal.Instant;
  readonly deletedAt: Temporal.Instant | null;
  readonly clocks: FieldClocks;
}
