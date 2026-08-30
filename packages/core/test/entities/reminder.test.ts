import { describe, expect, it } from 'vitest';

import type { Reminder } from '../../src/entities/reminder.js';
import { asUuid } from '../../src/values.js';

describe('Reminder (§1 «reminders», `01§18`; максимум 1 explicit на задачу — §2 п.19, забота валидатора)', () => {
  it('explicit-напоминание несёт правило и fingerprint для reconciliation (`02§14`)', () => {
    const reminder: Reminder = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000050'),
      taskId: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001'),
      kind: 'explicit',
      localRuleJson: { date: '2026-09-01', time: '09:00' },
      enabled: true,
      scheduledFingerprint: 'fp-1',
    };
    expect(reminder.kind).toBe('explicit');
  });

  it('deadline_missed-напоминание — производный вид, тоже валиден', () => {
    const reminder: Reminder = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000051'),
      taskId: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001'),
      kind: 'deadline_missed',
      localRuleJson: {},
      enabled: true,
      scheduledFingerprint: 'fp-2',
    };
    expect(reminder.kind).toBe('deadline_missed');
  });
});
