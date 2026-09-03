import { Temporal } from '@js-temporal/polyfill';
import {
  archiveProjectCommand,
  asUuid,
  cancelReminderCommand,
  completeTaskCommand,
  createDeadlineApproachingReminderCommand,
  createExplicitReminderCommand,
  createProjectCommand,
  createTaskCommand,
  deleteTaskCommand,
  type CreateTaskInput,
  type Reminder,
  type Task,
  type Uuid,
} from '@shagi/core';
import type { NotificationPrecision, NotificationSchedulerPort } from '@shagi/platform';
import { createInMemoryStorage, type StoragePort } from '@shagi/storage';
import { describe, expect, it } from 'vitest';

import {
  reconcileReminderSchedule,
  reconcileReminderScheduleForTask,
} from '../../src/state/reminder-reconciliation.js';

const OWNER_SCOPE = asUuid('00000000-0000-0000-0000-0000000000f0');
const DEVICE_ID = asUuid('00000000-0000-0000-0000-0000000000d1');
const NOW = Temporal.Instant.from('2026-09-03T09:00:00Z');
const NOW_LOCAL = Temporal.PlainDateTime.from('2026-09-03T09:00:00');
const TIMEZONE = 'Europe/Moscow';

/** Единая форма зависимостей — суперсет того, что требуют разные команды
 * `@shagi/core` (`TaskCommandDeps`/`ReminderCommandDeps`/`ArchiveProjectDeps`
 * не различают "нужно по факту" и "нужно по контракту типа", см. комментарий
 * `reminder-port.ts`); структурная типизация принимает более широкий объект
 * там, где ожидается более узкий. */
function deps(storage: StoragePort) {
  return {
    storage,
    sections: storage.sections,
    tasks: storage.tasks,
    reminders: storage.reminders,
    reminderStorage: storage,
    now: NOW,
    nowLocal: NOW_LOCAL,
    deviceId: DEVICE_ID,
  };
}

async function seedTask(
  storage: StoragePort,
  overrides: Partial<CreateTaskInput> = {},
): Promise<Task> {
  const result = await createTaskCommand(
    {
      ownerScope: OWNER_SCOPE,
      title: 'Задача',
      captureState: 'processed',
      source: 'user',
      rank: { placement: 'empty-list' },
      ...overrides,
    },
    deps(storage),
  );
  if (result.status !== 'ok') throw new Error('setup: createTaskCommand не удался');
  return result.task;
}

async function seedExplicitReminder(
  storage: StoragePort,
  taskId: Uuid,
  date: Temporal.PlainDate,
): Promise<Reminder> {
  const result = await createExplicitReminderCommand(
    { taskId, date, time: null, deadlineDate: null, deadlineTime: null },
    deps(storage),
  );
  if (result.status !== 'ok') throw new Error('setup: createExplicitReminderCommand не удался');
  return result.reminder;
}

/** Фейковый `NotificationSchedulerPort` — та же реализация, что задаёт бриф
 * Task A3: платформа целиком в памяти, `listScheduled()` — актуальный снимок. */
function fakeScheduler(): NotificationSchedulerPort & {
  calls: { scheduled: string[]; cancelled: string[] };
} {
  const scheduled = new Set<string>();
  const calls = { scheduled: [] as string[], cancelled: [] as string[] };
  return {
    calls,
    async schedule(id) {
      scheduled.add(id);
      calls.scheduled.push(id);
    },
    async cancel(id) {
      scheduled.delete(id);
      calls.cancelled.push(id);
    },
    async listScheduled() {
      return Array.from(scheduled);
    },
    async getSchedulingCapability(): Promise<NotificationPrecision> {
      return 'exact';
    },
  };
}

describe('reconcileReminderSchedule', () => {
  it('планирует напоминание активной задачи, которого ещё нет в listScheduled', async () => {
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const task = await seedTask(storage);
    const reminder = await seedExplicitReminder(
      storage,
      task.id,
      Temporal.PlainDate.from('2026-09-04'),
    );

    const summary = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    expect(summary.scheduled).toEqual([reminder.id]);
    expect(summary.cancelled).toEqual([]);
    expect(scheduler.calls.scheduled).toEqual([reminder.id]);
  });

  it('отменяет напоминание, чья задача завершена, удалена, или чей проект архивирован', async () => {
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const future = Temporal.PlainDate.from('2026-09-04');

    // --- задача завершена (правило §18 "Complete cancels all pending") ---
    const completedTask = await seedTask(storage, { title: 'Будет завершена' });
    const completedReminder = await seedExplicitReminder(storage, completedTask.id, future);
    await scheduler.schedule(completedReminder.id, completedTask.title, future, null, TIMEZONE);
    const completed = await completeTaskCommand({ id: completedTask.id }, deps(storage));
    expect(completed.status).toBe('ok');

    // --- задача удалена (tombstone) ---
    const deletedTask = await seedTask(storage, { title: 'Будет удалена' });
    const deletedReminder = await seedExplicitReminder(storage, deletedTask.id, future);
    await scheduler.schedule(deletedReminder.id, deletedTask.title, future, null, TIMEZONE);
    const deleted = await deleteTaskCommand({ id: deletedTask.id }, deps(storage));
    expect(deleted.status).toBe('ok');

    // --- проект архивирован ДО того, как в нём завелась задача с
    // напоминанием: архивируем ПУСТОЙ проект (0 активных задач), поэтому
    // `archiveProjectCommand` не гасит ничего сама
    // (`cancelledReminderCount===0` ниже) — ветку "включённое напоминание
    // при архивном проекте" целиком закрывает только `isTaskEligible` этой
    // реконсиляции, не побочный эффект архивации.
    const projectResult = await createProjectCommand(
      {
        title: 'Проект',
        colorToken: 'accent.default',
        defaultView: 'list',
        hasProEntitlement: false,
        rank: { placement: 'empty-list' },
      },
      deps(storage),
    );
    if (projectResult.status !== 'ok') throw new Error('setup: createProjectCommand не удался');
    const project = projectResult.project;

    const archived = await archiveProjectCommand({ id: project.id }, deps(storage));
    expect(archived.status).toBe('ok');
    if (archived.status === 'ok') {
      expect(archived.hadActiveTasks).toBe(false);
      expect(archived.cancelledReminderCount).toBe(0);
    }

    // Ни `createTaskCommand`, ни `createExplicitReminderCommand` не
    // проверяют `project.archivedAt` (Шаг 1 находка) — задачу и включённое
    // напоминание можно технически завести уже ВНУТРИ архивного проекта.
    const taskInProject = await seedTask(storage, {
      title: 'В архивном проекте',
      projectId: project.id,
    });
    const reminderInProject = await seedExplicitReminder(storage, taskInProject.id, future);
    await scheduler.schedule(reminderInProject.id, taskInProject.title, future, null, TIMEZONE);

    const summary = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    expect(summary.scheduled).toEqual([]);
    expect(new Set(summary.cancelled)).toEqual(
      new Set([completedReminder.id, deletedReminder.id, reminderInProject.id]),
    );
  });

  it('не планирует просроченное напоминание — без replay storm для прошлого firesAt (01§18 line 489, TA#34)', async () => {
    // Регресс на находку ревью Task A3: строка 218 `applyReconciliation`
    // (`Temporal.PlainDateTime.compare(target, nowLocal) <= 0`) не имела
    // покрытия — ни один существующий тест этого файла или
    // `packages/storage/test/sqlite/reminder-reconciliation-native.test.ts`
    // не сеял `firesAt` раньше `NOW_LOCAL` (`2026-09-03T09:00`). Без этой
    // ветки при перезапуске приложения/после потери OS alarm реконсиляция
    // передала бы в `scheduler.schedule()` уже прошедший момент — реальный
    // replay storm просроченных напоминаний, который правило 34 запрещает.
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const task = await seedTask(storage);
    // Тот же посевной путь, что и у положительных тестов выше (активная
    // задача, не удалена, без проекта, `enabled:true` по умолчанию
    // `createExplicitReminderCommand`) — единственное отличие: дата раньше
    // `NOW_LOCAL`, а не `2026-09-04`.
    const overdueReminder = await seedExplicitReminder(
      storage,
      task.id,
      Temporal.PlainDate.from('2026-09-02'),
    );

    const summary = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    expect(summary.scheduled).toEqual([]);
    expect(summary.cancelled).toEqual([]);
    expect(scheduler.calls.scheduled).not.toContain(overdueReminder.id);
    expect(await scheduler.listScheduled()).toEqual([]);
  });

  it('не трогает то, что уже согласовано (уже запланировано под этим id) — без replay storm', async () => {
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const task = await seedTask(storage);
    const reminder = await seedExplicitReminder(
      storage,
      task.id,
      Temporal.PlainDate.from('2026-09-04'),
    );
    await scheduler.schedule(
      reminder.id,
      task.title,
      Temporal.PlainDate.from('2026-09-04'),
      null,
      TIMEZONE,
    );
    scheduler.calls.scheduled.length = 0; // сбрасываем лог посевного вызова — интересен только вызов из reconcile

    const summary = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    expect(summary.scheduled).toEqual([]);
    expect(summary.cancelled).toEqual([]);
    expect(scheduler.calls.scheduled).toEqual([]);
    expect(scheduler.calls.cancelled).toEqual([]);
  });

  it('пересобирает расписание при "редактировании": отменяет старую запись, планирует новую', async () => {
    // PRE-FLIGHT RULING (см. бриф Task A3): reconciliation не читает
    // `scheduledFingerprint`, поэтому "редактирование" не мутирует
    // `firesAt` на месте — оно всегда cancelReminderCommand (гасит СТАРУЮ
    // строку) + свежий createExplicitReminderCommand (НОВЫЙ id), тот же
    // паттерн, что `TaskDetail.tsx` `handleSubmitReminder`. Новую запись той
    // же задаче нельзя завести через createExplicitReminderCommand ПОВТОРНО
    // (задокументированный шов `reminder-cancel.ts`: countExplicitByTask
    // считает по kind='explicit' без фильтра по enabled, отменённая, но не
    // стёртая строка продолжает "занимать" лимит правила 19) — поэтому
    // вторая запись здесь `deadline_approaching`, не `explicit`; для
    // reconciliation разница в `kind` не важна, читается только `firesAt`.
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const task = await seedTask(storage);
    const oldReminder = await seedExplicitReminder(
      storage,
      task.id,
      Temporal.PlainDate.from('2026-09-04'),
    );
    await scheduler.schedule(
      oldReminder.id,
      task.title,
      Temporal.PlainDate.from('2026-09-04'),
      null,
      TIMEZONE,
    );

    const cancelled = await cancelReminderCommand({ reminder: oldReminder }, deps(storage));
    expect(cancelled.status).toBe('ok');

    const newReminderResult = await createDeadlineApproachingReminderCommand(
      { taskId: task.id, deadlineDate: Temporal.PlainDate.from('2026-09-10'), deadlineTime: null },
      deps(storage),
    );
    if (newReminderResult.status !== 'ok')
      throw new Error('setup: createDeadlineApproachingReminderCommand');
    const newReminder = newReminderResult.reminder;

    const summary = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    expect(summary.cancelled).toEqual([oldReminder.id]);
    expect(summary.scheduled).toEqual([newReminder.id]);
  });
});

describe('reconcileReminderScheduleForTask', () => {
  it('планирует недостающее напоминание указанной задачи, не трогая чужие', async () => {
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const future = Temporal.PlainDate.from('2026-09-04');

    const taskA = await seedTask(storage, { title: 'A' });
    const reminderA = await seedExplicitReminder(storage, taskA.id, future);

    const taskB = await seedTask(storage, { title: 'B' });
    const reminderB = await seedExplicitReminder(storage, taskB.id, future);
    await scheduler.schedule(reminderB.id, taskB.title, future, null, TIMEZONE);
    scheduler.calls.scheduled.length = 0;

    const summary = await reconcileReminderScheduleForTask(
      storage,
      scheduler,
      taskA.id,
      NOW_LOCAL,
      TIMEZONE,
    );

    expect(summary.scheduled).toEqual([reminderA.id]);
    expect(summary.cancelled).toEqual([]);
    // Чужое напоминание (taskB), уже числящееся у планировщика, не тронуто —
    // ключевое свойство "дешёвого" пути: не отменяет то, что не относится к
    // переданной задаче.
    expect(scheduler.calls.cancelled).toEqual([]);
    expect(await scheduler.listScheduled()).toEqual(expect.arrayContaining([reminderB.id]));
  });

  it('отменяет своё запланированное напоминание, если задача больше не активна', async () => {
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const task = await seedTask(storage);
    const reminder = await seedExplicitReminder(
      storage,
      task.id,
      Temporal.PlainDate.from('2026-09-04'),
    );
    await scheduler.schedule(
      reminder.id,
      task.title,
      Temporal.PlainDate.from('2026-09-04'),
      null,
      TIMEZONE,
    );
    scheduler.calls.scheduled.length = 0;

    const completed = await completeTaskCommand({ id: task.id }, deps(storage));
    expect(completed.status).toBe('ok');

    const summary = await reconcileReminderScheduleForTask(
      storage,
      scheduler,
      task.id,
      NOW_LOCAL,
      TIMEZONE,
    );

    expect(summary.cancelled).toEqual([reminder.id]);
    expect(scheduler.calls.cancelled).toEqual([reminder.id]);
  });
});
