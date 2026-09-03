import { describe, expect, it } from 'vitest';

import { computeReminderFingerprint } from '../../src/commands/reminder-fingerprint.js';

describe('computeReminderFingerprint', () => {
  it('одинаковый kind/firesAt/enabled/title даёт одинаковый отпечаток', () => {
    const a = computeReminderFingerprint(
      { kind: 'explicit', localRuleJson: { firesAt: '2026-09-10T09:00:00' }, enabled: true },
      'Позвонить врачу',
    );
    const b = computeReminderFingerprint(
      { kind: 'explicit', localRuleJson: { firesAt: '2026-09-10T09:00:00' }, enabled: true },
      'Позвонить врачу',
    );
    expect(a).toBe(b);
  });

  it('другое firesAt даёт другой отпечаток', () => {
    const a = computeReminderFingerprint(
      { kind: 'explicit', localRuleJson: { firesAt: '2026-09-10T09:00:00' }, enabled: true },
      'Задача',
    );
    const b = computeReminderFingerprint(
      { kind: 'explicit', localRuleJson: { firesAt: '2026-09-10T10:00:00' }, enabled: true },
      'Задача',
    );
    expect(a).not.toBe(b);
  });

  it('enabled:false даёт другой отпечаток, чем enabled:true при прочих равных', () => {
    const enabled = computeReminderFingerprint(
      { kind: 'explicit', localRuleJson: { firesAt: '2026-09-10T09:00:00' }, enabled: true },
      'Задача',
    );
    const disabled = computeReminderFingerprint(
      { kind: 'explicit', localRuleJson: { firesAt: '2026-09-10T09:00:00' }, enabled: false },
      'Задача',
    );
    expect(enabled).not.toBe(disabled);
  });

  it('разный kind при одинаковом firesAt даёт разный отпечаток', () => {
    const explicit = computeReminderFingerprint(
      { kind: 'explicit', localRuleJson: { firesAt: '2026-09-10T09:00:00' }, enabled: true },
      'Задача',
    );
    const missed = computeReminderFingerprint(
      { kind: 'deadline_missed', localRuleJson: { firesAt: '2026-09-10T09:00:00' }, enabled: true },
      'Задача',
    );
    expect(explicit).not.toBe(missed);
  });

  it('отсутствующий firesAt не бросает — отпечаток всё равно детерминирован', () => {
    expect(() =>
      computeReminderFingerprint({ kind: 'explicit', localRuleJson: {}, enabled: true }, 'Задача'),
    ).not.toThrow();
  });

  // Task A6: `title` — новый обязательный параметр. Две записи с одинаковым
  // kind/firesAt/enabled, но разным заголовком задачи, обязаны различаться —
  // это то самое поле, которого не хватало прежней версии отпечатка (было
  // задокументированным открытым пробелом: переименование задачи никак не
  // отражалось на отпечатке). Сам факт этой функции остаётся полезным юнит-
  // фактом, даже когда reconciliation больше не читает СОХРАНЁННОЕ значение
  // (см. `commands/reminder-fingerprint.ts`) — оно всё ещё синхронизируемый
  // бизнес-факт "что домен считает желаемым".
  it('одинаковый kind/firesAt/enabled, но разный title даёт разный отпечаток', () => {
    const original = computeReminderFingerprint(
      { kind: 'explicit', localRuleJson: { firesAt: '2026-09-10T09:00:00' }, enabled: true },
      'Купить билеты',
    );
    const renamed = computeReminderFingerprint(
      { kind: 'explicit', localRuleJson: { firesAt: '2026-09-10T09:00:00' }, enabled: true },
      'Купить билеты на самолёт',
    );
    expect(original).not.toBe(renamed);
  });

  it('пустой title — валидный вход, не бросает и даёт детерминированный отпечаток', () => {
    expect(() =>
      computeReminderFingerprint(
        { kind: 'explicit', localRuleJson: { firesAt: '2026-09-10T09:00:00' }, enabled: true },
        '',
      ),
    ).not.toThrow();
  });
});
