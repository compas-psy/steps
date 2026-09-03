import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { cancelReminderCommand } from '../../src/commands/reminder-cancel.js';
import type {
  CommandReminderDomainMutation,
  CommandReminderStoragePort,
  CommandReminderWriteTransaction,
  ReminderCommandDeps,
} from '../../src/commands/reminder-port.js';
import type { Reminder } from '../../src/entities/reminder.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import type { Uuid } from '../../src/values.js';
import { DEVICE_ID, NOW, uuid } from './fixtures.js';

class InMemoryReminderStoragePort implements CommandReminderStoragePort {
  private readonly byId = new Map<string, Reminder>();
  private readonly outboxLog: SyncOutboxEntry[] = [];

  readonly reminders = {
    countExplicitByTask: (_taskId: Uuid): Promise<number> => Promise.resolve(0),
    // Task B8, Задача 3 — `CommandReminderReader.listByTask`: этому файлу
    // (`cancelReminderCommand` его не читает) реальная фильтрация не
    // нужна, честный вывод из уже существующего `byId` не хуже заглушки.
    listByTask: (taskId: Uuid): Promise<readonly Reminder[]> =>
      Promise.resolve([...this.byId.values()].filter((r) => r.taskId === taskId)),
  };

  // Task A6: `CommandReminderStoragePort.tasks` — этому файлу заголовок
  // задачи не нужен (`cancelReminderCommand` не создаёт отпечаток), но
  // структурная типизация требует поле; честный "нет такой задачи".
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

const NOW_LOCAL = Temporal.PlainDateTime.from('2026-08-31T09:00:00');

function deps(storage: CommandReminderStoragePort): ReminderCommandDeps {
  return { storage, now: NOW, nowLocal: NOW_LOCAL, deviceId: DEVICE_ID };
}

function enabledReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: uuid('3'),
    taskId: uuid('4'),
    kind: 'explicit',
    localRuleJson: {
      kind: 'explicit',
      date: '2026-09-05',
      time: null,
      firesAt: '2026-09-05T00:00:00',
    },
    enabled: true,
    scheduledFingerprint: '',
    ...overrides,
  };
}

describe('cancelReminderCommand', () => {
  it('отменяет активное напоминание: пишет ту же запись с enabled=false', async () => {
    const storage = new InMemoryReminderStoragePort();
    const reminder = enabledReminder();

    const result = await cancelReminderCommand({ reminder }, deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.reminder.enabled).toBe(false);
    expect(result.reminder.id).toBe(reminder.id);

    expect(storage.allReminders()).toHaveLength(1);
    expect(storage.allReminders()[0]?.enabled).toBe(false);
    expect(storage.outboxEntries()).toHaveLength(1);
    expect(storage.outboxEntries()[0]?.entityType).toBe('reminder');
  });

  it('повторная отмена уже отменённого напоминания — already_cancelled, без записи', async () => {
    const storage = new InMemoryReminderStoragePort();
    const reminder = enabledReminder({ enabled: false });

    const result = await cancelReminderCommand({ reminder }, deps(storage));

    expect(result).toEqual({ status: 'already_cancelled' });
    expect(storage.outboxEntries()).toHaveLength(0);
  });
});
