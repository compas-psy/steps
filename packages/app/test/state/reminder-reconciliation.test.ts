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
  updateTaskCommand,
  type CreateTaskInput,
  type Reminder,
  type Task,
  type Uuid,
} from '@shagi/core';
import { makeOutboxEntry } from '@shagi/storage/contract';
import type {
  NotificationPrecision,
  NotificationSchedulerPort,
  ScheduledNotificationSnapshot,
} from '@shagi/platform';
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

/**
 * Фейковый `NotificationSchedulerPort` — платформа целиком в памяти,
 * `listScheduled()` возвращает актуальный снимок содержимого (Task A6:
 * раньше отдавал только id, задавал бриф Task A3; теперь несёт
 * `title`/`scheduledAt`, ровно то, что теперь сравнивает
 * `applyReconciliation`).
 *
 * Три добавки к фейку Task A3, нужные ИМЕННО для десяти сценариев Task A6
 * (см. describe-блок ниже):
 *  - `seed()` кладёт снимок В ОБХОД `schedule()` — единственный способ
 *    представить "платформа уже содержит нечто, возможно устаревшее"
 *    (реальный `schedule()` всегда пишет АКТУАЛЬНОЕ желаемое содержимое,
 *    им нельзя изобразить рассинхронизацию).
 *  - `failFor` — id, для которых `schedule()` бросает один раз (сам себя
 *    удаляет из множества при срабатывании — "once", не постоянный сбой),
 *    не обновляя карту: симулирует сбой платформы (сценарий 7), карта
 *    остаётся честно устаревшей для следующего прогона.
 *  - `schedule()` вычисляет `scheduledAt` тем же способом, что настоящий
 *    веб-адаптер (`apps/web/src/platform.ts`) — `PlainDate.toZonedDateTime(
 *    ...).toInstant()` — не самодельной копией расчёта.
 */
function fakeScheduler(): NotificationSchedulerPort & {
  calls: { scheduled: string[]; cancelled: string[] };
  seed(snapshot: ScheduledNotificationSnapshot): void;
  failFor: Set<string>;
} {
  const scheduled = new Map<string, ScheduledNotificationSnapshot>();
  const calls = { scheduled: [] as string[], cancelled: [] as string[] };
  const failFor = new Set<string>();
  return {
    calls,
    failFor,
    seed(snapshot) {
      scheduled.set(snapshot.reminderId, snapshot);
    },
    async schedule(id, title, date, time, timezone, precision) {
      if (failFor.has(id)) {
        failFor.delete(id); // once — следующий прогон обязан пройти успешно (самоисцеление, сценарий 7)
        throw new Error(`fakeScheduler: симулированный сбой schedule() для ${id}`);
      }
      const target =
        time === null
          ? date.toZonedDateTime(timezone)
          : date.toZonedDateTime({ timeZone: timezone, plainTime: time });
      const snapshot: ScheduledNotificationSnapshot =
        precision === undefined
          ? { reminderId: id, title, scheduledAt: target.toInstant() }
          : { reminderId: id, title, scheduledAt: target.toInstant(), precision };
      scheduled.set(id, snapshot);
      calls.scheduled.push(id);
    },
    async cancel(id) {
      scheduled.delete(id);
      calls.cancelled.push(id);
    },
    async listScheduled() {
      return Array.from(scheduled.values());
    },
    async getSchedulingCapability(): Promise<NotificationPrecision> {
      return 'exact';
    },
  };
}

/** Тот же расчёт "разрешённый Instant в заданной таймзоне", что делает
 * `resolveDesiredInstant` в `@shagi/app` (`reminder-reconciliation.ts`) и
 * веб-адаптер (`apps/web/src/platform.ts`) — нужен тестам этого файла,
 * чтобы строить `seed()`-снимки с ЗАВЕДОМО известным ожидаемым моментом
 * (сценарии 2/3/5/9 ниже). */
function resolveInstant(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime | null,
  timezone: string,
): Temporal.Instant {
  const target =
    time === null
      ? date.toZonedDateTime(timezone)
      : date.toZonedDateTime({ timeZone: timezone, plainTime: time });
  return target.toInstant();
}

/** Мутирует `Reminder.scheduledFingerprint` НАПРЯМУЮ в хранилище, в обход
 * всех команд `@shagi/core` — единственный способ поставить сценарий 9
 * (прямая порча персистентного поля), которого ни один нормальный путь
 * командного слоя произвести не может (поле пишется только один раз, при
 * создании). Тот же приём записи "мимо команд", что уже использует
 * `seedReminder`/`seedTasks` в других тестах `packages/app` (`Today.test.tsx`
 * и соседи) — `runTransaction`+`applyMutation` напрямую. */
async function mutateScheduledFingerprint(
  storage: StoragePort,
  reminder: Reminder,
  wrongValue: string,
): Promise<void> {
  const corrupted: Reminder = { ...reminder, scheduledFingerprint: wrongValue };
  await storage.runTransaction(async (tx) => {
    await tx.applyMutation({
      writes: [{ entity: 'reminder', value: corrupted }],
      outbox: [makeOutboxEntry('reminder', reminder.id)],
    });
  });
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
    // Task A6: `listScheduled()` теперь несёт снимки, не голые id —
    // сравниваем по `reminderId`.
    expect((await scheduler.listScheduled()).map((s) => s.reminderId)).toEqual(
      expect.arrayContaining([reminderB.id]),
    );
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

/**
 * Task A6 — десять обязательных сценариев брифа (`task-A6-brief.md`, Шаг 2),
 * каждый отдельным `it`, с проверкой по счётчику вызовов
 * (`scheduler.calls.*`), не только по итоговому состоянию — та же
 * дисциплина, что уже применяют тесты Task A3 выше в этом файле.
 *
 * Общая ось всех сценариев — `applyReconciliation` теперь сравнивает ДВЕ
 * НЕЗАВИСИМЫЕ дименсии живого желаемого с живым фактическим (не читая
 * `Reminder.scheduledFingerprint` НИКОГДА): payload (`title`) и разрешённый
 * момент (`scheduledAt`). Устарело → `schedule()` (замена), если id вообще
 * отсутствует в `actual` ИЛИ различается хотя бы одна дименсия.
 */
describe('applyReconciliation — content-aware дименсии (Task A6)', () => {
  const OTHER_TIMEZONE = 'Asia/Yekaterinburg'; // UTC+5, отличается от TIMEZONE (Europe/Moscow, UTC+3) на 2 часа — сценарий 5

  it('Сценарий 1: напоминание отсутствует в actual целиком → schedule() вызван', async () => {
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const task = await seedTask(storage, { title: 'Первый прогон' });
    const reminder = await seedExplicitReminder(
      storage,
      task.id,
      Temporal.PlainDate.from('2026-09-04'),
    );

    const summary = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    expect(summary.scheduled).toEqual([reminder.id]);
    expect(summary.cancelled).toEqual([]);
    expect(scheduler.calls.scheduled).toEqual([reminder.id]);
    expect(scheduler.calls.cancelled).toEqual([]);
  });

  it('Сценарий 2: actual полностью совпадает с desired (title + instant) → настоящий no-op', async () => {
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const task = await seedTask(storage, { title: 'Уже согласовано' });
    const date = Temporal.PlainDate.from('2026-09-04');
    const reminder = await seedExplicitReminder(storage, task.id, date);
    scheduler.seed({
      reminderId: reminder.id,
      title: task.title,
      scheduledAt: resolveInstant(date, null, TIMEZONE),
    });

    const summary = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    expect(summary.scheduled).toEqual([]);
    expect(summary.cancelled).toEqual([]);
    expect(scheduler.calls.scheduled).toEqual([]);
    expect(scheduler.calls.cancelled).toEqual([]);
  });

  it('Сценарий 3: actual.title отличается от желаемого (задача переименована) → schedule() вызван повторно (замена)', async () => {
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const task = await seedTask(storage, { title: 'Старое имя задачи' });
    const date = Temporal.PlainDate.from('2026-09-04');
    const reminder = await seedExplicitReminder(storage, task.id, date);
    // Напоминание было изначально запланировано ПОД СТАРЫМ заголовком —
    // тот же instant, что и желаемый (дименсия 2 совпадает), различается
    // ТОЛЬКО заголовок, чтобы результат теста нельзя было объяснить
    // дименсией 2, только дименсией 1.
    scheduler.seed({
      reminderId: reminder.id,
      title: task.title,
      scheduledAt: resolveInstant(date, null, TIMEZONE),
    });

    // Реальная команда переименования (Шаг 1 брифа: "найти настоящую
    // команду переименования задачи"), не выдуманный сценарий — ровно то,
    // что делает `TaskDetail.tsx` при сохранении заголовка.
    const renamed = await updateTaskCommand(
      { id: task.id, patch: { title: 'Новое имя задачи' } },
      deps(storage),
    );
    expect(renamed.status).toBe('ok');

    const summary = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    expect(summary.scheduled).toEqual([reminder.id]);
    expect(summary.cancelled).toEqual([]);
    expect(scheduler.calls.scheduled).toEqual([reminder.id]);
  });

  it('Сценарий 4: actual.scheduledAt отличается от желаемого при НЕИЗМЕННОЙ таймзоне (правка времени = cancel+recreate, новый id) — чистый schedule() для нового id, не "устаревшая замена" старого', async () => {
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const task = await seedTask(storage, { title: 'Правка времени напоминания' });
    const oldDate = Temporal.PlainDate.from('2026-09-04');
    const oldReminder = await seedExplicitReminder(storage, task.id, oldDate);
    scheduler.seed({
      reminderId: oldReminder.id,
      title: task.title,
      scheduledAt: resolveInstant(oldDate, null, TIMEZONE),
    });

    // "Редактирование" в этом командном слое — ВСЕГДА cancel старой строки +
    // новая команда с НОВЫМ id (`TaskDetail.tsx` `handleSubmitReminder`),
    // никогда мутация `firesAt` на месте того же id.
    const cancelled = await cancelReminderCommand({ reminder: oldReminder }, deps(storage));
    expect(cancelled.status).toBe('ok');
    // `deadline_approaching`, не `explicit` — тот же задокументированный шов,
    // что уже обходит тест "пересобирает расписание при 'редактировании'"
    // выше в файле: реальный `countExplicitByTask` считает по
    // `kind='explicit'` БЕЗ фильтра `enabled`, отменённая-но-не-стёртая
    // строка продолжает "занимать" лимит правила 19. Для reconciliation
    // разница в `kind` не важна, читается только `firesAt`.
    const newReminderResult = await createDeadlineApproachingReminderCommand(
      { taskId: task.id, deadlineDate: Temporal.PlainDate.from('2026-09-10'), deadlineTime: null },
      deps(storage),
    );
    if (newReminderResult.status !== 'ok')
      throw new Error('setup: createDeadlineApproachingReminderCommand');
    const newReminder = newReminderResult.reminder;

    const summary = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    // Старый id отсутствует в desired целиком (отменённая строка не
    // enabled) → cancel, НЕ "устаревшая замена" — это разные механизмы,
    // хотя итоговый вызов `scheduler.cancel(oldReminder.id)` тот же самый.
    expect(summary.cancelled).toEqual([oldReminder.id]);
    // Новый id отсутствует в actual целиком → чистый schedule(), не
    // "замена по дименсии 2" старого содержимого (у нового id вообще нет
    // предыдущего actual-снимка, сравнивать не с чем).
    expect(summary.scheduled).toEqual([newReminder.id]);
  });

  it('Сценарий 5: текущая таймзона отличается от той, в которой был разрешён actual.scheduledAt, тот же firesAt, тот же id → schedule() вызван повторно', async () => {
    // Ровно тот сценарий, который Task A5 (пересчёт при смене таймзоны на
    // старте) не могла закрыть в одиночку — там нет второй дименсии
    // сравнения, только пересчёт `nowLocal`/списка candidate-напоминаний.
    // Это её сквозное закрытие: смена таймзоны устройства меняет разрешённый
    // Instant того же самого `firesAt`, дименсия 2 это ловит без единой
    // мутации `Reminder`/`Task`.
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const task = await seedTask(storage, { title: 'Напоминание через смену пояса' });
    const date = Temporal.PlainDate.from('2026-09-04');
    const reminder = await seedExplicitReminder(storage, task.id, date);
    // actual «застыл» под СТАРОЙ таймзоной устройства (OTHER_TIMEZONE) — тот
    // же wall-clock firesAt, другой абсолютный момент.
    scheduler.seed({
      reminderId: reminder.id,
      title: task.title,
      scheduledAt: resolveInstant(date, null, OTHER_TIMEZONE),
    });

    // Реконсиляция запускается уже под НОВОЙ (текущей) таймзоной устройства.
    const summary = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    expect(summary.scheduled).toEqual([reminder.id]);
    expect(scheduler.calls.scheduled).toEqual([reminder.id]);
  });

  it('Сценарий 6: повторный прогон сразу после исправления (сценарий 5) — настоящий no-op, дрейф действительно сходится', async () => {
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const task = await seedTask(storage, { title: 'Сходимость после смены пояса' });
    const date = Temporal.PlainDate.from('2026-09-04');
    const reminder = await seedExplicitReminder(storage, task.id, date);
    scheduler.seed({
      reminderId: reminder.id,
      title: task.title,
      scheduledAt: resolveInstant(date, null, OTHER_TIMEZONE),
    });

    const firstPass = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);
    expect(firstPass.scheduled).toEqual([reminder.id]); // тот же факт, что сценарий 5 — фиксируем как посылку

    const secondPass = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    expect(secondPass.scheduled).toEqual([]);
    expect(secondPass.cancelled).toEqual([]);
    // Всего ОДИН вызов schedule() за оба прогона вместе — не «два прогона,
    // каждый увидел рассинхронизацию», а «первый прогон исправил, второй
    // подтвердил исправленное».
    expect(scheduler.calls.scheduled).toEqual([reminder.id]);
  });

  it('Сценарий 7: scheduler.schedule() бросает для одной записи → её actual остаётся устаревшим, следующий прогон досоздаёт сам собой (самоисцеление, без специального кода восстановления)', async () => {
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const task = await seedTask(storage, { title: 'Сбой платформы при планировании' });
    const reminder = await seedExplicitReminder(
      storage,
      task.id,
      Temporal.PlainDate.from('2026-09-04'),
    );
    scheduler.failFor.add(reminder.id);

    // `applyReconciliation` не оборачивает `scheduler.schedule()` в try/catch
    // (`reminder-reconciliation.ts`, комментарий у функции) — сбой платформы
    // честно всплывает вызывающему коду, не проглатывается молча.
    await expect(
      reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE),
    ).rejects.toThrow();
    // Карта планировщика НЕ обновилась — actual для этого id всё ещё пуст.
    expect(await scheduler.listScheduled()).toEqual([]);

    // Никакого специального кода восстановления — просто следующий прогон.
    const retry = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    expect(retry.scheduled).toEqual([reminder.id]);
    expect(scheduler.calls.scheduled).toEqual([reminder.id]); // один успешный вызов на два прогона — первый бросил ДО push в calls.scheduled
  });

  it('Сценарий 8: id присутствует в actual без соответствующей записи в desired вовсе → cancel() вызван', async () => {
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    // Полностью посторонний id — ни задачи, ни напоминания под ним нет в
    // хранилище вообще (не «стала неактивна», а «никогда не существовала
    // с точки зрения этого workspace») — минимальная форма сценария,
    // отделённая от бизнес-причин отмены (завершение/удаление/архивация),
    // которые уже проверяют более ранние тесты этого файла (Task A3).
    const orphanId = asUuid('00000000-0000-0000-0000-0000000000ee');
    scheduler.seed({
      reminderId: orphanId,
      title: 'Заголовок с устройства, которого больше нет в domain-состоянии',
      scheduledAt: NOW,
    });

    const summary = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    expect(summary.cancelled).toEqual([orphanId]);
    expect(summary.scheduled).toEqual([]);
    expect(scheduler.calls.cancelled).toEqual([orphanId]);
  });

  it('Сценарий 9: испорченный Reminder.scheduledFingerprint в хранилище не влияет на решение реконсиляции', async () => {
    // Самый важный тест всего пакета работ — прямое опровержение
    // отклонённого дизайна (см. `commands/reminder-fingerprint.ts`):
    // если бы сравнение читало `scheduledFingerprint`, порча этого поля
    // изменила бы исход. Не меняет — потому что сравнение его не читает
    // НИКОГДА, обе стороны пересчитываются живьём на каждый прогон.
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const task = await seedTask(storage, { title: 'Неприкосновенный отпечаток' });
    const date = Temporal.PlainDate.from('2026-09-04');
    const reminder = await seedExplicitReminder(storage, task.id, date);
    // actual заведомо СОВПАДАЕТ с желаемым — настоящий no-op, если бы не
    // порча ниже.
    scheduler.seed({
      reminderId: reminder.id,
      title: task.title,
      scheduledAt: resolveInstant(date, null, TIMEZONE),
    });

    await mutateScheduledFingerprint(storage, reminder, 'ЗАВЕДОМО-НЕВЕРНОЕ-ЗНАЧЕНИЕ-ОТПЕЧАТКА');

    const summary = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    // Поведение НЕ ИЗМЕНИЛОСЬ — по-прежнему честный no-op, несмотря на
    // порченное синхронизируемое поле в хранилище.
    expect(summary.scheduled).toEqual([]);
    expect(summary.cancelled).toEqual([]);
    expect(scheduler.calls.scheduled).toEqual([]);
    expect(scheduler.calls.cancelled).toEqual([]);
  });

  it('Сценарий 10: просроченное напоминание — ни новый schedule(), ни отмена уже запланированного; регресс Task A3 не появился от двух дименсий сравнения', async () => {
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    const overdueDate = Temporal.PlainDate.from('2026-09-02'); // раньше NOW_LOCAL (2026-09-03T09:00)

    // 10a — просроченное, ЕЩЁ НЕ запланированное нигде: без replay storm
    // (`01§18` line 489, Testing Acceptance #34) — та же гарантия, что уже
    // проверяет тест Task A3 выше в этом файле, здесь как явный сценарий
    // конкретно Task A6 (не должна была появиться новая причина реплеить
    // просроченное из-за двух дименсий).
    const taskNotYetScheduled = await seedTask(storage, { title: 'Просрочено, ещё не в actual' });
    const reminderNotYetScheduled = await seedExplicitReminder(
      storage,
      taskNotYetScheduled.id,
      overdueDate,
    );

    // 10b — просроченное, УЖЕ запланированное (симулирует напоминание,
    // созданное заранее, чей момент наступил и прошёл, пока устройство было
    // offline) — раз оно уже в actual, ни `schedule()` (не реплей), ни
    // `cancel()` (оно всё ещё `enabled`/desired, дименсии тут ни при чём —
    // ветка "просрочено" даже не доходит до их сравнения) вызваны быть не
    // должны.
    const taskAlreadyScheduled = await seedTask(storage, { title: 'Просрочено, уже в actual' });
    const reminderAlreadyScheduled = await seedExplicitReminder(
      storage,
      taskAlreadyScheduled.id,
      overdueDate,
    );
    scheduler.seed({
      reminderId: reminderAlreadyScheduled.id,
      title: taskAlreadyScheduled.title,
      scheduledAt: resolveInstant(overdueDate, null, TIMEZONE),
    });

    const summary = await reconcileReminderSchedule(storage, scheduler, NOW_LOCAL, TIMEZONE);

    expect(summary.scheduled).not.toContain(reminderNotYetScheduled.id);
    expect(summary.cancelled).not.toContain(reminderAlreadyScheduled.id);
    expect(summary.scheduled).not.toContain(reminderAlreadyScheduled.id);
    expect(scheduler.calls.scheduled).toEqual([]);
    expect(scheduler.calls.cancelled).toEqual([]);
  });
});
