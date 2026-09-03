import { describe, expect, it } from 'vitest';

import { computeReminderFingerprint } from '../../src/commands/reminder-fingerprint.js';

describe('computeReminderFingerprint', () => {
  it('одинаковый kind/firesAt/enabled даёт одинаковый отпечаток', () => {
    const a = computeReminderFingerprint({
      kind: 'explicit',
      localRuleJson: { firesAt: '2026-09-10T09:00:00' },
      enabled: true,
    });
    const b = computeReminderFingerprint({
      kind: 'explicit',
      localRuleJson: { firesAt: '2026-09-10T09:00:00' },
      enabled: true,
    });
    expect(a).toBe(b);
  });

  it('другое firesAt даёт другой отпечаток', () => {
    const a = computeReminderFingerprint({
      kind: 'explicit',
      localRuleJson: { firesAt: '2026-09-10T09:00:00' },
      enabled: true,
    });
    const b = computeReminderFingerprint({
      kind: 'explicit',
      localRuleJson: { firesAt: '2026-09-10T10:00:00' },
      enabled: true,
    });
    expect(a).not.toBe(b);
  });

  it('enabled:false даёт другой отпечаток, чем enabled:true при прочих равных', () => {
    const enabled = computeReminderFingerprint({
      kind: 'explicit',
      localRuleJson: { firesAt: '2026-09-10T09:00:00' },
      enabled: true,
    });
    const disabled = computeReminderFingerprint({
      kind: 'explicit',
      localRuleJson: { firesAt: '2026-09-10T09:00:00' },
      enabled: false,
    });
    expect(enabled).not.toBe(disabled);
  });

  it('разный kind при одинаковом firesAt даёт разный отпечаток', () => {
    const explicit = computeReminderFingerprint({
      kind: 'explicit',
      localRuleJson: { firesAt: '2026-09-10T09:00:00' },
      enabled: true,
    });
    const missed = computeReminderFingerprint({
      kind: 'deadline_missed',
      localRuleJson: { firesAt: '2026-09-10T09:00:00' },
      enabled: true,
    });
    expect(explicit).not.toBe(missed);
  });

  it('отсутствующий firesAt не бросает — отпечаток всё равно детерминирован', () => {
    expect(() =>
      computeReminderFingerprint({ kind: 'explicit', localRuleJson: {}, enabled: true }),
    ).not.toThrow();
  });
});
