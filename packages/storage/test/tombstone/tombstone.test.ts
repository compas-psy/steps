import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  isTombstoneExpired,
  selectExpiredTombstones,
  tombstoneExpiresAt,
  TOMBSTONE_RETENTION_DAYS,
} from '../../src/tombstone/tombstone.js';

const deletedAt = Temporal.Instant.fromEpochMilliseconds(1_700_000_000_000);

describe('tombstone-политика (02§9, задание E02.1 п.5)', () => {
  it('TOMBSTONE_RETENTION_DAYS === 90', () => {
    expect(TOMBSTONE_RETENTION_DAYS).toBe(90);
  });

  it('не просрочен ни на секунду раньше границы 90×24 часов', () => {
    const justBefore = deletedAt.add({ hours: 90 * 24 }).subtract({ milliseconds: 1 });
    expect(isTombstoneExpired(deletedAt, justBefore)).toBe(false);
  });

  it('просрочен ровно на границе 90×24 часов и позже', () => {
    const exactBoundary = deletedAt.add({ hours: 90 * 24 });
    expect(isTombstoneExpired(deletedAt, exactBoundary)).toBe(true);
    expect(isTombstoneExpired(deletedAt, exactBoundary.add({ hours: 1 }))).toBe(true);
  });

  it('tombstoneExpiresAt согласован с isTombstoneExpired', () => {
    const cutoff = tombstoneExpiresAt(deletedAt);
    expect(isTombstoneExpired(deletedAt, cutoff)).toBe(true);
    expect(isTombstoneExpired(deletedAt, cutoff.subtract({ milliseconds: 1 }))).toBe(false);
  });

  it('selectExpiredTombstones отбирает только просроченные и живые (deletedAt=null) не трогает', () => {
    const now = deletedAt.add({ hours: 90 * 24 + 1 });
    const expired = { id: 'a', deletedAt };
    const fresh = { id: 'b', deletedAt: deletedAt.add({ hours: 10 }) };
    const alive = { id: 'c', deletedAt: null };

    const result = selectExpiredTombstones([expired, fresh, alive], now);
    expect(result).toEqual([expired]);
  });
});
