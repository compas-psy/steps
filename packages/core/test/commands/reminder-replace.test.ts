import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  replaceExplicitReminderCommand,
  type ReplaceExplicitReminderInput,
} from '../../src/commands/reminder-replace.js';
import type {
  CommandReminderDomainMutation,
  CommandReminderStoragePort,
  CommandReminderWriteTransaction,
  ReminderCommandDeps,
} from '../../src/commands/reminder-port.js';
import type { Reminder } from '../../src/entities/reminder.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import type { Task } from '../../src/entities/task.js';
import type { Uuid } from '../../src/values.js';
import { DEVICE_ID, NOW, d, existingTask, t, uuid } from './fixtures.js';

const NOW_LOCAL = Temporal.PlainDateTime.from('2026-08-31T09:00:00');

/**
 * Тот же дубль, что `reminder-explicit.test.ts`, но с РЕАЛЬНОЙ фильтрацией
 * `listByTask`/`countExplicitByTask` (не заглушка) — `replaceExplicitReminderCommand`
 * реально читает `listByTask`, чтобы исключить `old.id` из проверки правила
 * 19 (см. её же комментарий), заглушка `Promise.resolve(0)` этого файла не
 * годится, тест был бы бессодержателен.
 *
 * `applyMutationOverride` — единственный способ по-настоящему проверить
 * атомарность (Задача 3.2, владелец: "Имитируй падение applyMutation") без
 * повторной проверки уже доказанной контрактным тестом
 * (`storage-contract.ts`, "откатывает целиком, если колбэк бросил после
 * applyMutation") реальной транзакционности бэкендов — здесь проверяется
 * ДРУГОЕ: что `replaceExplicitReminderCommand` реально отправляет обе
 * записи ОДНИМ вызовом `applyMutation`, а не двумя раздельными.
 */
class InMemoryReminderStoragePort implements CommandReminderStoragePort {
  private readonly byId = new Map<string, Reminder>();
  private readonly outboxLog: SyncOutboxEntry[] = [];
  private readonly tasksById = new Map<string, Task>();
  applyMutationOverride: ((mutation: CommandReminderDomainMutation) => void) | null = null;

  readonly reminders = {
    countExplicitByTask: (taskId: Uuid): Promise<number> => {
      return Promise.resolve(
        [...this.byId.values()].filter(
          (r) => r.taskId === taskId && r.kind === 'explicit' && r.enabled,
        ).length,
      );
    },
    listByTask: (taskId: Uuid): Promise<readonly Reminder[]> =>
      Promise.resolve([...this.byId.values()].filter((r) => r.taskId === taskId)),
  };

  readonly tasks = {
    findById: (id: Uuid): Promise<Task | null> => Promise.resolve(this.tasksById.get(id) ?? null),
  };

  async runTransaction<T>(run: (tx: CommandReminderWriteTransaction) => Promise<T>): Promise<T> {
    const tx: CommandReminderWriteTransaction = {
      applyMutation: (mutation: CommandReminderDomainMutation): Promise<void> => {
        // Fault injection (Задача 3.2): бросает ДО того, как что-либо
        // реально попадает в `byId`/`outboxLog` — та же гарантия, что
        // настоящий `runTransaction` даёт на уровне бэкенда (черновик
        // отбрасывается целиком при throw колбэка, contract-тест это уже
        // доказывает отдельно), здесь же проверяется, что КОМАНДА не
        // пишет частями сама по себе в обход единой мутации.
        if (this.applyMutationOverride !== null) {
          this.applyMutationOverride(mutation);
          return Promise.resolve();
        }
        for (const write of mutation.writes) {
          this.byId.set(write.value.id, write.value);
        }
        this.outboxLog.push(...mutation.outbox);
        return Promise.resolve();
      },
    };
    return run(tx);
  }

  seedReminder(reminder: Reminder): void {
    this.byId.set(reminder.id, reminder);
  }

  seedTaskTitle(taskId: Uuid, title: string): void {
    this.tasksById.set(taskId, existingTask({ id: taskId, title }));
  }

  reminderById(id: Uuid): Reminder | undefined {
    return this.byId.get(id);
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

function existingExplicitReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: uuid('a'),
    taskId: TASK_ID,
    kind: 'explicit',
    localRuleJson: {
      kind: 'explicit',
      date: '2026-09-01',
      time: null,
      firesAt: '2026-09-01T00:00',
    },
    enabled: true,
    scheduledFingerprint: 'old-fingerprint',
    ...overrides,
  };
}

function baseInput(
  old: Reminder,
  overrides: Partial<ReplaceExplicitReminderInput> = {},
): ReplaceExplicitReminderInput {
  return {
    old,
    taskId: TASK_ID,
    date: d('2026-09-10'),
    time: t('09:00'),
    deadlineDate: null,
    deadlineTime: null,
    ...overrides,
  };
}

describe('replaceExplicitReminderCommand — Задача 1 (happy path)', () => {
  it('старое становится disabled, новое — enabled с запрошенным triggerAt, ровно 1 active explicit; 2 outbox-записи одной мутацией', async () => {
    const storage = new InMemoryReminderStoragePort();
    const old = existingExplicitReminder();
    storage.seedReminder(old);

    const result = await replaceExplicitReminderCommand(baseInput(old), deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.reminder.kind).toBe('explicit');
    expect(result.reminder.enabled).toBe(true);
    expect(result.reminder.id).not.toBe(old.id);
    expect((result.reminder.localRuleJson as { date?: string }).date).toBe('2026-09-10');

    const storedOld = storage.reminderById(old.id);
    expect(storedOld?.enabled).toBe(false);
    // История не уничтожена произвольно (владелец, Задача 1) — запись
    // физически осталась, тот же upsert-канал, что `cancelReminderCommand`.
    expect(storedOld).toBeDefined();

    const activeExplicit = storage.allReminders().filter((r) => r.kind === 'explicit' && r.enabled);
    expect(activeExplicit).toHaveLength(1);
    expect(activeExplicit[0]?.id).toBe(result.reminder.id);

    // Обе записи — ОДНОЙ мутацией (не два раздельных runTransaction):
    // ровно 2 outbox-записи, обе с entityType 'reminder', разными
    // entityId (старый + новый).
    const outbox = storage.outboxEntries();
    expect(outbox).toHaveLength(2);
    expect(outbox.every((entry) => entry.entityType === 'reminder')).toBe(true);
    expect(outbox.map((entry) => entry.entityId).toSorted()).toEqual(
      [old.id, result.reminder.id].toSorted(),
    );
  });
});

describe('replaceExplicitReminderCommand — Задача 3.2 (atomic rollback, fault injection)', () => {
  it('падение applyMutation НЕ оставляет старое disabled без нового — canonical state остаётся как было ДО вызова', async () => {
    const storage = new InMemoryReminderStoragePort();
    const old = existingExplicitReminder();
    storage.seedReminder(old);

    const captured: { mutation: CommandReminderDomainMutation | null } = { mutation: null };
    storage.applyMutationOverride = (mutation) => {
      captured.mutation = mutation;
      throw new Error('намеренный сбой applyMutation — Задача 3.2');
    };

    await expect(replaceExplicitReminderCommand(baseInput(old), deps(storage))).rejects.toThrow(
      'намеренный сбой applyMutation',
    );

    // Обе записи ДЕЙСТВИТЕЛЬНО были отправлены ОДНИМ вызовом (значит,
    // при реальном бэкенде откатились бы вместе, не по отдельности) —
    // проверяем ПЕРЕД assert'ами состояния, чтобы не полагаться только
    // на побочный эффект (запрет 'partial state below').
    expect(captured.mutation).not.toBeNull();
    expect(captured.mutation?.writes).toHaveLength(2);

    // Запрещённое состояние (владелец, Задача 3.2): old.enabled===false
    // при отсутствующем new — команда обязана была передать обе записи в
    // ОДНОМ applyMutation (проверено выше), а не писать их раздельно.
    const storedOld = storage.reminderById(old.id);
    expect(storedOld?.enabled).toBe(true);
    expect(storage.allReminders()).toHaveLength(1);
  });
});

describe('replaceExplicitReminderCommand — Задача 3.3 (правило 19 не ослаблено)', () => {
  it('замена себя самой разрешена (не считается "ещё одним" reminder)', async () => {
    const storage = new InMemoryReminderStoragePort();
    const old = existingExplicitReminder();
    storage.seedReminder(old);

    const result = await replaceExplicitReminderCommand(baseInput(old), deps(storage));

    expect(result.status).toBe('ok');
  });

  it('конкурентный ДРУГОЙ active explicit reminder на ту же задачу по-прежнему блокирует замену — TASK_REMINDER_LIMIT_EXCEEDED, storage не тронут', async () => {
    const storage = new InMemoryReminderStoragePort();
    const old = existingExplicitReminder();
    const concurrent = existingExplicitReminder({ id: uuid('c') });
    storage.seedReminder(old);
    storage.seedReminder(concurrent);

    const result = await replaceExplicitReminderCommand(baseInput(old), deps(storage));

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.validation.issues).toEqual([
      expect.objectContaining({
        rule: 19,
        code: 'TASK_REMINDER_LIMIT_EXCEEDED',
        severity: 'blocking',
      }),
    ]);

    // Storage не тронут вовсе — ни old, ни concurrent не изменились, новая
    // запись не создана.
    expect(storage.reminderById(old.id)?.enabled).toBe(true);
    expect(storage.reminderById(concurrent.id)?.enabled).toBe(true);
    expect(storage.allReminders()).toHaveLength(2);
  });
});

describe('replaceExplicitReminderCommand — Задача 3.4 (валидация правила 34 сохранена)', () => {
  it('замена на дату после дедлайна задачи — тот же warning, что у createExplicitReminderCommand, valid=true (сохранение разрешено)', async () => {
    const storage = new InMemoryReminderStoragePort();
    const old = existingExplicitReminder();
    storage.seedReminder(old);

    const result = await replaceExplicitReminderCommand(
      baseInput(old, {
        date: d('2026-09-05'),
        time: t('09:00'),
        deadlineDate: d('2026-09-01'),
        deadlineTime: t('18:00'),
      }),
      deps(storage),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.validation.valid).toBe(true);
    expect(result.validation.issues).toEqual([
      { rule: 34, code: 'TEMPORAL_CONFLICT', severity: 'warning', field: 'date' },
    ]);
  });

  it('заголовок задачи попадает в scheduledFingerprint нового напоминания (Task A6, тот же приём, что createExplicitReminderCommand)', async () => {
    const storage = new InMemoryReminderStoragePort();
    const old = existingExplicitReminder();
    storage.seedReminder(old);
    storage.seedTaskTitle(TASK_ID, 'Заголовок задачи');

    const result = await replaceExplicitReminderCommand(baseInput(old), deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.reminder.scheduledFingerprint).not.toBe('');
  });
});
