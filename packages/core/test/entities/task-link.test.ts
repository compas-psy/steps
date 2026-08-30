import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import type { TaskLink } from '../../src/entities/task-link.js';
import { asUuid } from '../../src/values.js';

const now = Temporal.Instant.from('2026-08-30T10:00:00Z');

describe('TaskLink (§1 «task_links»; лимит 20/задачу — §2 п.20; разрешённые схемы — §01.25, забота валидатора)', () => {
  it('ссылка без display_label валидна', () => {
    const link: TaskLink = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000080'),
      taskId: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001'),
      url: 'https://example.com',
      displayLabel: null,
      createdAt: now,
      updatedAt: now,
    };
    expect(link.displayLabel).toBeNull();
  });
});
