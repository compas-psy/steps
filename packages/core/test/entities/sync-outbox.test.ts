import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import { asUuid } from '../../src/values.js';

const now = Temporal.Instant.from('2026-08-30T10:00:00Z');

describe('SyncOutboxEntry (§1 «sync_outbox», `00§7.1` transaction invariant: entity+outbox атомарно)', () => {
  it('свежая запись outbox ещё не имеет попыток отправки', () => {
    const entry: SyncOutboxEntry = {
      opId: asUuid('018f4f2e-6e3b-7f3a-8f1a-0000000000a1'),
      deviceId: asUuid('018f4f2e-6e3b-7f3a-8f1a-0000000000a2'),
      entityType: 'task',
      entityId: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001'),
      patchJson: { title: 'Новое имя' },
      fieldClocksJson: {},
      baseRevision: 3n,
      createdAt: now,
      retryCount: 0,
    };
    expect(entry.retryCount).toBe(0);
  });
});
