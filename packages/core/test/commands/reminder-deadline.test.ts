import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  createDeadlineApproachingReminderCommand,
  createDeadlineMissedReminderCommand,
  type CreateDeadlineApproachingReminderInput,
  type CreateDeadlineMissedReminderInput,
} from '../../src/commands/reminder-deadline.js';
import type {
  CommandReminderDomainMutation,
  CommandReminderStoragePort,
  CommandReminderWriteTransaction,
  ReminderCommandDeps,
} from '../../src/commands/reminder-port.js';
import type { Reminder } from '../../src/entities/reminder.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import type { Uuid } from '../../src/values.js';
import { DEVICE_ID, NOW, d, t, uuid } from './fixtures.js';

/** Та же минимальная тестовая реализация порта, что в `reminder-explicit.test.ts`
 * (не общий файл — вне территории этого пакета работ заводить новый
 * не-тестовый файл только ради переиспользования тестового дубля). */
class InMemoryReminderStoragePort implements CommandReminderStoragePort {
  private readonly byId = new Map<string, Reminder>();
  private readonly outboxLog: SyncOutboxEntry[] = [];

  readonly reminders = {
    countExplicitByTask: (_taskId: Uuid): Promise<number> => Promise.resolve(0),
  };

  // Task A6: `CommandReminderStoragePort.tasks` — см. тот же комментарий в
  // `reminder-explicit.test.ts`.
  readonly tasks = {
    findById: (_id: Uuid): Promise<null> => Promise.resolve(null),
  };

  async runTransaction<T>(run: (tx: CommandReminderWriteTransaction) => Promise<T>): Promise<T> {
    const tx: CommandReminderWriteTransaction = {
      applyMutation: (mutation: CommandReminderDomainMutation): Promise<void> => {
        for (const write of mutation.writes) {
          this.byId.set(write.value.id, write.value);
        }
        this.outboxLog.push(...mutation.outbox);
        return Promise.resolve();
      },
    };
    return run(tx);
  }

  allReminders(): readonly Reminder[] {
    return [...this.byId.values()];
  }

  outboxEntries(): readonly SyncOutboxEntry[] {
    return [...this.outboxLog];
  }
}

const TASK_ID = uuid('2');

function deps(nowLocal: Temporal.PlainDateTime, storage = new InMemoryReminderStoragePort()) {
  const value: ReminderCommandDeps = { storage, now: NOW, nowLocal, deviceId: DEVICE_ID };
  return { storage, deps: value };
}

describe('createDeadlineApproachingReminderCommand', () => {
  const DEADLINE_DATE = d('2026-09-10');
  const DEADLINE_TIME = t('18:00');

  function input(
    overrides: Partial<CreateDeadlineApproachingReminderInput> = {},
  ): CreateDeadlineApproachingReminderInput {
    return {
      taskId: TASK_ID,
      deadlineDate: DEADLINE_DATE,
      deadlineTime: DEADLINE_TIME,
      ...overrides,
    };
  }

  it('timed-дедлайн, ровно 24ч до него → напоминание за 24ч (граница включительно)', async () => {
    // Дедлайн 2026-09-10T18:00, now ровно на 24ч раньше.
    const nowLocal = Temporal.PlainDateTime.from('2026-09-09T18:00:00');
    const { deps: d1 } = deps(nowLocal);

    const result = await createDeadlineApproachingReminderCommand(input(), d1);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const firesAt = result.reminder.localRuleJson['firesAt'];
    expect(firesAt).toBe('2026-09-09T18:00:00');
  });

  it('timed-дедлайн, чуть меньше 24ч (23ч59м) → напоминание за 1ч, не за 24ч', async () => {
    const nowLocal = Temporal.PlainDateTime.from('2026-09-09T18:00:01');
    const { deps: d1 } = deps(nowLocal);

    const result = await createDeadlineApproachingReminderCommand(input(), d1);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.reminder.localRuleJson['firesAt']).toBe('2026-09-10T17:00:00');
  });

  it('timed-дедлайн, ровно 2ч до него → too-close, напоминание НЕ создаётся', async () => {
    const nowLocal = Temporal.PlainDateTime.from('2026-09-10T16:00:00');
    const { deps: d1, storage } = deps(nowLocal);

    const result = await createDeadlineApproachingReminderCommand(input(), d1);

    expect(result).toEqual({ status: 'skipped', reason: 'too_close' });
    expect(storage.allReminders()).toHaveLength(0);
  });

  it('timed-дедлайн, чуть больше 2ч (2ч00м01с) → напоминание за 1ч создаётся', async () => {
    const nowLocal = Temporal.PlainDateTime.from('2026-09-10T15:59:59');
    const { deps: d1 } = deps(nowLocal);

    const result = await createDeadlineApproachingReminderCommand(input(), d1);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.reminder.localRuleJson['firesAt']).toBe('2026-09-10T17:00:00');
  });

  it('date-only дедлайн → 09:00 дня дедлайна, независимо от порогов', async () => {
    const nowLocal = Temporal.PlainDateTime.from('2026-09-01T00:00:00');
    const { deps: d1 } = deps(nowLocal);

    const result = await createDeadlineApproachingReminderCommand(
      input({ deadlineTime: null }),
      d1,
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.reminder.localRuleJson['firesAt']).toBe('2026-09-10T09:00:00');
  });

  it('без дедлайна (deadlineDate=null) → invalid_input, отклонено, нечего вычислять', async () => {
    const nowLocal = Temporal.PlainDateTime.from('2026-09-01T00:00:00');
    const { deps: d1, storage } = deps(nowLocal);

    const result = await createDeadlineApproachingReminderCommand(
      input({ deadlineDate: null, deadlineTime: null }),
      d1,
    );

    expect(result).toEqual({ status: 'invalid_input', reason: 'missing_deadline' });
    expect(storage.allReminders()).toHaveLength(0);
  });

  it('пишет kind=deadline_approaching и entityType=reminder в outbox', async () => {
    const nowLocal = Temporal.PlainDateTime.from('2026-09-01T00:00:00');
    const { deps: d1, storage } = deps(nowLocal);

    const result = await createDeadlineApproachingReminderCommand(input(), d1);
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.reminder.kind).toBe('deadline_approaching');
    expect(storage.outboxEntries()[0]?.entityType).toBe('reminder');
    expect(storage.outboxEntries()[0]?.entityId).toBe(result.reminder.id);
  });
});

describe('createDeadlineMissedReminderCommand', () => {
  function input(
    overrides: Partial<CreateDeadlineMissedReminderInput> = {},
  ): CreateDeadlineMissedReminderInput {
    return {
      taskId: TASK_ID,
      deadlineDate: d('2026-09-10'),
      deadlineTime: t('18:00'),
      ...overrides,
    };
  }

  it('timed-дедлайн → +15 минут после эффективного момента дедлайна', async () => {
    const nowLocal = Temporal.PlainDateTime.from('2026-09-01T00:00:00');
    const { deps: d1 } = deps(nowLocal);

    const result = await createDeadlineMissedReminderCommand(input(), d1);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.reminder.kind).toBe('deadline_missed');
    expect(result.reminder.localRuleJson['firesAt']).toBe('2026-09-10T18:15:00');
  });

  it('date-only дедлайн → 09:00 следующего дня', async () => {
    const nowLocal = Temporal.PlainDateTime.from('2026-09-01T00:00:00');
    const { deps: d1 } = deps(nowLocal);

    const result = await createDeadlineMissedReminderCommand(input({ deadlineTime: null }), d1);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.reminder.localRuleJson['firesAt']).toBe('2026-09-11T09:00:00');
  });

  it('без дедлайна → invalid_input, отклонено', async () => {
    const nowLocal = Temporal.PlainDateTime.from('2026-09-01T00:00:00');
    const { deps: d1, storage } = deps(nowLocal);

    const result = await createDeadlineMissedReminderCommand(
      input({ deadlineDate: null, deadlineTime: null }),
      d1,
    );

    expect(result).toEqual({ status: 'invalid_input', reason: 'missing_deadline' });
    expect(storage.allReminders()).toHaveLength(0);
  });
});
