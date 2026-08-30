import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import type { SyncConflict } from '../../src/entities/sync-conflict.js';
import type { Hlc } from '../../src/hlc.js';
import { asUuid } from '../../src/values.js';

function hlc(iso: string): Hlc {
  return { physical: Temporal.Instant.from(iso), logical: 0, deviceId: null };
}

describe('SyncConflict (§1 «sync_conflicts», `02§8` merge — surfaced conflict)', () => {
  it('неразрешённый конфликт не имеет resolvedAt', () => {
    const conflict: SyncConflict = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-0000000000b1'),
      entityType: 'task',
      entityId: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001'),
      field: 'title',
      localValue: 'Локальный заголовок',
      remoteValue: 'Удалённый заголовок',
      winnerValue: 'Удалённый заголовок',
      localClock: hlc('2026-08-30T10:00:00Z'),
      remoteClock: hlc('2026-08-30T10:00:05Z'),
      resolvedAt: null,
    };
    expect(conflict.resolvedAt).toBeNull();
  });
});
