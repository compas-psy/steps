import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import type { Attachment } from '../../src/entities/attachment.js';
import { asUuid } from '../../src/values.js';

const now = Temporal.Instant.from('2026-08-30T10:00:00Z');

describe('Attachment (§1 «attachments», лимит 10/задачу — §2 п.21, забота валидатора)', () => {
  it('локально ожидающее вложение ещё не имеет object_key', () => {
    const attachment: Attachment = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000070'),
      taskId: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001'),
      displayName: 'план.pdf',
      mime: 'application/pdf',
      size: 1024,
      sha256: 'a'.repeat(64),
      localUri: 'file:///tmp/plan.pdf',
      objectKey: null,
      state: 'local_pending',
      createdAt: now,
      updatedAt: now,
    };
    expect(attachment.state).toBe('local_pending');
  });

  it('синхронизированное вложение несёт object_key', () => {
    const attachment: Attachment = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000071'),
      taskId: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001'),
      displayName: 'план.pdf',
      mime: 'application/pdf',
      size: 1024,
      sha256: 'a'.repeat(64),
      localUri: null,
      objectKey: 'obj/abc',
      state: 'synced',
      createdAt: now,
      updatedAt: now,
    };
    expect(attachment.objectKey).toBe('obj/abc');
  });
});
