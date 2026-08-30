import type { Temporal } from '@js-temporal/polyfill';

import type { FieldClocks, Rank, Uuid } from '../values.js';

/**
 * `labels` (`02§2`, конспект §1). `normalizedName` — ключ уникальности
 * (case-insensitive после Unicode-нормализации, §2 п.24), `displayName` —
 * то, что видит пользователь; они хранятся раздельно, потому что
 * нормализация необратима (`ВАЖНОЕ`/`Важное`/`важное` — один label, но
 * показан должен быть ровно тот вариант написания, что ввёл пользователь).
 * Сама уникальность — кросс-строчная проверка, забота валидатора.
 */
export interface Label {
  readonly id: Uuid;
  readonly normalizedName: string;
  readonly displayName: string;
  readonly colorToken: string | null;
  readonly rank: Rank;
  readonly deletedAt: Temporal.Instant | null;
  readonly clocks: FieldClocks;
}
