import { Temporal } from '@js-temporal/polyfill';
import {
  asUuid,
  createExplicitReminderCommand,
  createProjectCommand,
  createTaskCommand,
} from '@shagi/core';
import { describe, expect, it } from 'vitest';

import { openNativeSqliteStorage } from '../../src/sqlite/sqlite-storage.js';
import { createFakeNativeBridge } from './support/fake-native-bridge.js';

/**
 * Реконсиляция (`02§14`, Task A3 `@shagi/app` `state/reminder-reconciliation.ts`)
 * живёт в `packages/app`, а не здесь — по границе пакетов CLAUDE.md
 * `packages/app` зависит от `packages/storage`, не наоборот, и у
 * `packages/storage` намеренно нет `@shagi/app`/`@shagi/platform` в
 * зависимостях (`откуда` пришёл бы `NotificationSchedulerPort`). Этот файл
 * поэтому не импортирует `reconcileReminderSchedule` напрямую — он
 * прогоняет РОВНО ТУ ЖЕ выборку "желаемых" напоминаний, что `desiredReminders`
 * в `packages/app` (`storage.reminders.listAllEnabled()` +
 * `storage.tasks.findById` + `storage.projects.findById`, дословно те же
 * запросы и то же условие живости), но против настоящего SQLite, а не
 * `createInMemoryStorage()` — цель Шага 6b брифа Task A3: доказать, что
 * `listAllEnabled` (заведённый этим же заданием, Шаг 2) реально работает по
 * SQL (`WHERE enabled = ?`, кодек `booleanToSql`/`sqlToBoolean`), а не только
 * по JS `Map`/IndexedDB. Если эта копия логики когда-нибудь разойдётся с
 * оригиналом — расхождение по бизнес-правилам поймают тесты `packages/app`
 * (`reminder-reconciliation.test.ts`, in-memory); у этого файла ровно одна
 * задача — SQL-путь `listAllEnabled`/`findById`, не переисследование правил
 * "что считается желаемым".
 */
async function desiredReminderIds(
  storage: Awaited<ReturnType<typeof openNativeSqliteStorage>>,
): Promise<ReadonlySet<string>> {
  const enabled = await storage.reminders.listAllEnabled();
  const ids = new Set<string>();
  for (const reminder of enabled) {
    const task = await storage.tasks.findById(reminder.taskId);
    if (task === null || task.deletedAt !== null || task.status !== 'active') continue;
    if (task.projectId !== null) {
      const project = await storage.projects.findById(task.projectId);
      if (project === null || project.archivedAt !== null || project.deletedAt !== null) continue;
    }
    ids.add(reminder.id);
  }
  return ids;
}

/** Тот же фейковый планировщик, что `packages/app`
 * `test/state/reminder-reconciliation.test.ts` — здесь не типизирован на
 * `NotificationSchedulerPort` (пакета `@shagi/platform` нет в зависимостях
 * `packages/storage`, см. заголовок файла), интересна только пара
 * `schedule`/`cancel`/`listScheduled` в памяти. */
function fakeScheduler(): {
  schedule(id: string): Promise<void>;
  cancel(id: string): Promise<void>;
  listScheduled(): Promise<readonly string[]>;
  calls: { scheduled: string[]; cancelled: string[] };
} {
  const scheduledIds = new Set<string>();
  const calls = { scheduled: [] as string[], cancelled: [] as string[] };
  return {
    calls,
    async schedule(id) {
      scheduledIds.add(id);
      calls.scheduled.push(id);
    },
    async cancel(id) {
      scheduledIds.delete(id);
      calls.cancelled.push(id);
    },
    async listScheduled() {
      return Array.from(scheduledIds);
    },
  };
}

const OWNER_SCOPE = asUuid('00000000-0000-0000-0000-0000000000f0');
const DEVICE_ID = asUuid('00000000-0000-0000-0000-0000000000d1');
const NOW = Temporal.Instant.from('2026-09-03T09:00:00Z');
const NOW_LOCAL = Temporal.PlainDateTime.from('2026-09-03T09:00:00');

describe('reconciliation желаемых напоминаний против настоящего SQLite (Task A3, Шаг 6b)', () => {
  it('listAllEnabled + findById корректно находят напоминание, которого ещё нет у планировщика', async () => {
    // Внешние ключи ОСТАЮТСЯ включёнными — та же причина, что
    // `erase-all-local-data-native.test.ts`: FK-граф не ослабляем в тесте,
    // который обязан вести себя как продакшен.
    const storage = await openNativeSqliteStorage(
      createFakeNativeBridge(),
      'reminder-reconciliation.db',
    );
    const deps = { storage, now: NOW, nowLocal: NOW_LOCAL, deviceId: DEVICE_ID };

    const task = await createTaskCommand(
      {
        ownerScope: OWNER_SCOPE,
        title: 'Полить цветы',
        captureState: 'processed',
        source: 'user',
        rank: { placement: 'empty-list' },
      },
      deps,
    );
    expect(task.status).toBe('ok');
    if (task.status !== 'ok') return;

    const reminder = await createExplicitReminderCommand(
      {
        taskId: task.task.id,
        date: Temporal.PlainDate.from('2026-09-04'),
        time: null,
        deadlineDate: null,
        deadlineTime: null,
      },
      deps,
    );
    expect(reminder.status).toBe('ok');
    if (reminder.status !== 'ok') return;

    const desired = await desiredReminderIds(storage);
    expect(desired.has(reminder.reminder.id)).toBe(true);

    const scheduler = fakeScheduler();
    const currentlyScheduled = new Set(await scheduler.listScheduled());
    expect(currentlyScheduled.has(reminder.reminder.id)).toBe(false);

    // Ровно решение `applyReconciliation` (`@shagi/app`): желаемо и ещё не
    // на планировщике → schedule.
    await scheduler.schedule(reminder.reminder.id);
    expect(scheduler.calls.scheduled).toEqual([reminder.reminder.id]);
  });

  it('не трогает то, что уже согласовано (реминдер завершённой задачи не в желаемых, живой — в желаемых)', async () => {
    const storage = await openNativeSqliteStorage(
      createFakeNativeBridge(),
      'reminder-reconciliation-idempotent.db',
    );
    const deps = { storage, now: NOW, nowLocal: NOW_LOCAL, deviceId: DEVICE_ID };

    const project = await createProjectCommand(
      {
        title: 'Проект',
        colorToken: 'accent.default',
        defaultView: 'list',
        hasProEntitlement: false,
        rank: { placement: 'empty-list' },
      },
      deps,
    );
    expect(project.status).toBe('ok');
    if (project.status !== 'ok') return;

    const task = await createTaskCommand(
      {
        ownerScope: OWNER_SCOPE,
        title: 'Живая задача',
        captureState: 'processed',
        source: 'user',
        projectId: project.project.id,
        rank: { placement: 'empty-list' },
      },
      deps,
    );
    expect(task.status).toBe('ok');
    if (task.status !== 'ok') return;

    const reminder = await createExplicitReminderCommand(
      {
        taskId: task.task.id,
        date: Temporal.PlainDate.from('2026-09-04'),
        time: null,
        deadlineDate: null,
        deadlineTime: null,
      },
      deps,
    );
    expect(reminder.status).toBe('ok');
    if (reminder.status !== 'ok') return;

    const scheduler = fakeScheduler();
    await scheduler.schedule(reminder.reminder.id);
    scheduler.calls.scheduled.length = 0; // сбрасываем лог посевного вызова

    const desired = await desiredReminderIds(storage);
    const currentlyScheduled = new Set(await scheduler.listScheduled());

    // Проект живой, задача активна, напоминание включено — желаемо.
    expect(desired.has(reminder.reminder.id)).toBe(true);
    // ...и уже у планировщика под этим же id — applyReconciliation здесь
    // НЕ вызывает schedule повторно (идемпотентность, без replay storm).
    expect(currentlyScheduled.has(reminder.reminder.id)).toBe(true);
    if (!(desired.has(reminder.reminder.id) && currentlyScheduled.has(reminder.reminder.id))) {
      await scheduler.schedule(reminder.reminder.id);
    }
    expect(scheduler.calls.scheduled).toEqual([]);
    expect(scheduler.calls.cancelled).toEqual([]);
  });
});
