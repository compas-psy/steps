import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  createExplicitReminderCommand,
  type CreateExplicitReminderInput,
} from '../../src/commands/reminder-explicit.js';
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

const NOW_LOCAL = Temporal.PlainDateTime.from('2026-08-31T09:00:00');

/**
 * Минимальная тестовая реализация `CommandReminderStoragePort` — по образцу
 * `InMemoryCommandStoragePort` (`in-memory-storage-port.ts`), но своя: тот
 * класс реализует `CommandStoragePort` (только `tasks`), сюда не подходит.
 */
class InMemoryReminderStoragePort implements CommandReminderStoragePort {
  private readonly byId = new Map<string, Reminder>();
  private readonly outboxLog: SyncOutboxEntry[] = [];
  private explicitCount = 0;

  readonly reminders = {
    countExplicitByTask: (_taskId: Uuid): Promise<number> => {
      return Promise.resolve(this.explicitCount);
    },
    // Task B8, Задача 3 — `CommandReminderReader.listByTask`: этому файлу
    // (`createExplicitReminderCommand`, не `replaceExplicitReminderCommand`)
    // не нужен, честный вывод из уже существующего `byId`.
    listByTask: (taskId: Uuid): Promise<readonly Reminder[]> =>
      Promise.resolve([...this.byId.values()].filter((r) => r.taskId === taskId)),
  };

  // Task A6: `CommandReminderStoragePort.tasks` — этому файлу заголовок
  // задачи не важен (проверяется отдельно `reminder-fingerprint.test.ts`),
  // честное "нет такой задачи" вместо выдумки.
  readonly tasks = {
    findById: (_id: Uuid): Promise<null> => Promise.resolve(null),
  };

  async runTransaction<T>(run: (tx: CommandReminderWriteTransaction) => Promise<T>): Promise<T> {
    const tx: CommandReminderWriteTransaction = {
      applyMutation: (mutation: CommandReminderDomainMutation): Promise<void> => {
        for (const write of mutation.writes) {
          this.byId.set(write.value.id, write.value);
          if (write.value.kind === 'explicit') {
            this.explicitCount++;
          }
        }
        this.outboxLog.push(...mutation.outbox);
        return Promise.resolve();
      },
    };
    return run(tx);
  }

  setExplicitCount(count: number): void {
    this.explicitCount = count;
  }

  allReminders(): readonly Reminder[] {
    return [...this.byId.values()];
  }

  outboxEntries(): readonly SyncOutboxEntry[] {
    return [...this.outboxLog];
  }
}

function deps(
  storage: InMemoryReminderStoragePort,
  overrides: Partial<ReminderCommandDeps> = {},
): ReminderCommandDeps {
  return { storage, now: NOW, nowLocal: NOW_LOCAL, deviceId: DEVICE_ID, ...overrides };
}

const TASK_ID = uuid('1');

function baseInput(
  overrides: Partial<CreateExplicitReminderInput> = {},
): CreateExplicitReminderInput {
  return {
    taskId: TASK_ID,
    date: d('2026-09-05'),
    time: t('14:30'),
    deadlineDate: null,
    deadlineTime: null,
    ...overrides,
  };
}

describe('createExplicitReminderCommand', () => {
  it('создаёт explicit-напоминание и пишет сущность + outbox одной транзакцией', async () => {
    const storage = new InMemoryReminderStoragePort();

    const result = await createExplicitReminderCommand(baseInput(), deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.reminder.kind).toBe('explicit');
    expect(result.reminder.taskId).toBe(TASK_ID);
    expect(result.reminder.enabled).toBe(true);

    expect(storage.allReminders()).toHaveLength(1);
    expect(storage.outboxEntries()).toHaveLength(1);
    expect(storage.outboxEntries()[0]?.entityType).toBe('reminder');
    expect(storage.outboxEntries()[0]?.entityId).toBe(result.reminder.id);
  });
});
