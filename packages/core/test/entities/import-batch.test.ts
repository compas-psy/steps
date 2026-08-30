import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import type { ImportBatch } from '../../src/entities/import-batch.js';
import { asUuid } from '../../src/values.js';

const now = Temporal.Instant.from('2026-08-30T10:00:00Z');

describe('ImportBatch (§1 «import_batches», `01§26` transaction/rollback)', () => {
  it('батч в процессе ещё не имеет finishedAt', () => {
    const batch: ImportBatch = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000090'),
      source: 'todoist',
      startedAt: now,
      finishedAt: null,
      rollbackDeadline: now.add({ hours: 1 }),
      status: 'running',
      reportJson: {},
    };
    expect(batch.finishedAt).toBeNull();
  });
});
