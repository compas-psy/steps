import { Temporal } from '@js-temporal/polyfill';
import type { Reminder, Task, Uuid } from '@shagi/core';
import type { NotificationSchedulerPort } from '@shagi/platform';
import type { StoragePort } from '@shagi/storage';

/**
 * Итог одного прогона реконсиляции — материал для M52/reboot-смоуков
 * («scheduler снова пригоден для работы» после wipe: пустой
 * `ReconciliationSummary` после полного стирания хранилища — наблюдаемое
 * доказательство) и для будущего Task A4 (вызывающий код решает, показывать
 * ли что-то пользователю по факту реального `schedule`/`cancel`).
 */
export interface ReconciliationSummary {
  readonly scheduled: readonly string[];
  readonly cancelled: readonly string[];
}

/** Одно желаемое напоминание + заголовок его задачи (`schedule()` требует
 * `title` — напоминание само заголовка не несёт, `entities/reminder.ts`). */
interface DesiredEntry {
  readonly reminder: Reminder;
  readonly title: string;
}

/**
 * Правило "должно быть запланировано" (`01§18` "Complete/delete cancels all
 * pending task notifications" + `01§12` "Archiving... cancels/suppresses all
 * future explicit/deadline notifications belonging to active tasks in that
 * Project"): задача жива (`deletedAt === null`), активна
 * (`status === 'active'`), и если у неё есть проект — тот не архивирован и
 * не удалён.
 *
 * Проверка проекта здесь — это защита в глубину, не единственная линия
 * обороны: `archiveProjectCommand` уже отменяет (`enabled:false`) активные
 * напоминания задач архивируемого проекта в момент архивации
 * (`reminder-cancel.ts`/`project-archive.ts`, Task A2-соседний пакет
 * работ). Но ни `createTaskCommand`, ни `createExplicitReminderCommand` не
 * проверяют `project.archivedAt` — значит, задачу (и напоминание к ней)
 * технически можно создать УЖЕ ВНУТРИ архивного проекта, либо проект может
 * быть архивирован после снимка `enabled`, но раньше следующей
 * реконсиляции. Без этой проверки такое напоминание осталось бы
 * запланированным навсегда — то, что оно "тоже" должно быть отменено, это
 * ответственность реконсиляции, а не только команды архивации.
 */
async function isTaskEligible(storage: StoragePort, task: Task): Promise<boolean> {
  if (task.deletedAt !== null) return false;
  if (task.status !== 'active') return false;
  if (task.projectId !== null) {
    const project = await storage.projects.findById(task.projectId);
    if (project === null || project.archivedAt !== null || project.deletedAt !== null) {
      return false;
    }
  }
  return true;
}

/**
 * Момент срабатывания напоминания из `localRuleJson.firesAt` — единое поле,
 * одинаковое по имени и смыслу во всех трёх видах напоминаний
 * (`reminder-explicit.ts`/`reminder-deadline.ts` `@shagi/core`, комментарий
 * `buildExplicitLocalRuleJson`). `localRuleJson` непрозрачен по контракту
 * `entities/reminder.ts`, поэтому здесь только `typeof`-проверка и
 * `Temporal.PlainDateTime.from` — если поле повреждено или отсутствует,
 * трактуем как "нечего планировать", не бросаем.
 */
function readFiresAt(reminder: Reminder): Temporal.PlainDateTime | null {
  const raw = reminder.localRuleJson['firesAt'];
  if (typeof raw !== 'string') return null;
  try {
    return Temporal.PlainDateTime.from(raw);
  } catch {
    return null;
  }
}

/**
 * Полный список желаемых напоминаний рабочего пространства (полный скан).
 * `ReminderRepository.listAllEnabled()` (Task A3 Шаг 2, `@shagi/storage`)
 * даёт только `enabled=true` строки — дальше N+1 по `findById` задачи/
 * проекта на КАЖДОЕ такое напоминание, не по каждой задаче workspace
 * (`reminder-repository.ts`: у реального репозитория нет "все задачи с их
 * напоминаниями" одним запросом, а включённых напоминаний на порядки
 * меньше, чем задач).
 */
async function desiredReminders(storage: StoragePort): Promise<readonly DesiredEntry[]> {
  const enabledReminders = await storage.reminders.listAllEnabled();
  const entries: DesiredEntry[] = [];
  for (const reminder of enabledReminders) {
    // eslint-disable-next-line no-await-in-loop -- последовательно: реминдеров немного, см. applyReconciliation
    const task = await storage.tasks.findById(reminder.taskId);
    if (task === null) continue;
    // eslint-disable-next-line no-await-in-loop -- см. выше
    if (!(await isTaskEligible(storage, task))) continue;
    entries.push({ reminder, title: task.title });
  }
  return entries;
}

/**
 * Желаемые напоминания ОДНОЙ задачи — путь `reconcileReminderScheduleForTask`
 * ниже. В отличие от `desiredReminders` не трогает `listAllEnabled()`
 * (полный скан workspace) — только `findById` этой задачи и
 * `listByTask` её напоминаний, O(1) от размера workspace.
 */
async function desiredRemindersForTask(
  storage: StoragePort,
  taskId: Uuid,
): Promise<readonly DesiredEntry[]> {
  const task = await storage.tasks.findById(taskId);
  if (task === null) return [];
  if (!(await isTaskEligible(storage, task))) return [];
  const reminders = await storage.reminders.listByTask(taskId);
  return reminders
    .filter((reminder) => reminder.enabled)
    .map((reminder) => ({ reminder, title: task.title }));
}

/**
 * Реконсиляция желаемого расписания напоминаний с тем, что реально
 * запланировано на платформе (`02§14`). Источник истины — SQLite/
 * IndexedDB (через `storage`), НЕ то, что помнит нативный слой: если ОС
 * потеряла alarm (например, между `RECEIVE_BOOT_COMPLETED` и тем, как этот
 * код успел отреагировать), эта функция обнаружит и пересоздаст.
 *
 * Не создаёт replay storm для просроченных напоминаний (`01§18` line 489,
 * Testing Acceptance #34): если желаемый момент уже в прошлом относительно
 * `nowLocal`, эта функция НЕ вызывает `schedule` для него — платформенный
 * `schedule()` сам обязан быть no-op для прошлого (веб-адаптер уже это
 * делает, `apps/web/src/platform.ts` `delayMs <= 0 return`; Android-адаптер
 * из Phase B обязан вести себя так же — проверяется в Task B-тесте).
 *
 * Идемпотентность (см. PRE-FLIGHT RULING в брифе Task A3): желаемое
 * напоминание, чей `id` уже есть в `listScheduled()`, НЕ перепланируется —
 * функция сознательно не читает и не пишет `Reminder.scheduledFingerprint`.
 * Это безопасно ровно потому, что ни один путь текущего командного слоя не
 * мутирует `localRuleJson`/`enabled` на месте у РАЗРЕШЁННОЙ (тот же id,
 * остаётся `enabled`) строки: `cancelReminderCommand` гасит `enabled` на
 * той же строке (что уводит её из `desired` целиком — не "пропуск", а
 * настоящая отмена ниже), а "редактирование" (`TaskDetail.tsx`
 * `handleSubmitReminder`) — это `cancelReminderCommand` + свежий
 * `createExplicitReminderCommand` с НОВЫМ `generateId()`, то есть новый id.
 * Если будущая команда когда-нибудь начнёт мутировать `firesAt` на месте
 * того же id, это допущение нужно пересмотреть — не переоткрывать молча.
 */
export async function reconcileReminderSchedule(
  storage: StoragePort,
  scheduler: NotificationSchedulerPort,
  nowLocal: Temporal.PlainDateTime,
  timezone: string,
): Promise<ReconciliationSummary> {
  const desired = await desiredReminders(storage);
  const currentlyScheduled = new Set(await scheduler.listScheduled());
  return applyReconciliation(scheduler, desired, currentlyScheduled, nowLocal, timezone);
}

/**
 * Та же логика, только для ОДНОЙ задачи — дешёвый путь, вызываемый сразу
 * после команд, меняющих расписание (Task A4, следующий пакет работ), без
 * полного скана хранилища (`desiredRemindersForTask`, не `listAllEnabled`).
 *
 * `currentlyScheduled` здесь — НЕ строки хранилища этой задачи (черновик
 * брифа предлагал именно так, но это ошибочно: свежесозданное, ещё ни разу
 * не запланированное напоминание тоже лежит в `listByTask`, и тогда
 * `applyReconciliation` решил бы, что оно "уже согласовано", и НИКОГДА не
 * вызвал бы `schedule` — см. отчёт Task A3). Правильный источник истины тот
 * же, что у полного скана — реальный `scheduler.listScheduled()` — просто
 * пересечённый с id напоминаний ЭТОЙ задачи, чтобы не отменить чужие
 * (иначе `applyReconciliation` отменил бы любой чужой id платформы, которого
 * нет среди `desired` этой единственной задачи).
 */
export async function reconcileReminderScheduleForTask(
  storage: StoragePort,
  scheduler: NotificationSchedulerPort,
  taskId: Uuid,
  nowLocal: Temporal.PlainDateTime,
  timezone: string,
): Promise<ReconciliationSummary> {
  const desired = await desiredRemindersForTask(storage, taskId);
  const taskReminderIds = new Set<string>(
    (await storage.reminders.listByTask(taskId)).map((r) => r.id),
  );
  const scheduledIds = await scheduler.listScheduled();
  const currentlyScheduled = new Set(scheduledIds.filter((id) => taskReminderIds.has(id)));
  return applyReconciliation(scheduler, desired, currentlyScheduled, nowLocal, timezone);
}

/**
 * Общее ядро обоих путей выше: отменить лишнее (запланировано, но больше не
 * желаемо), доспланировать недостающее (желаемо, но ещё не на платформе и
 * не просрочено). Последовательно (`for`, не `Promise.all`) — тот же
 * компромисс, что уже документирует `archiveProjectCommand`
 * (`project-archive.ts`, `@shagi/core`): нет batch-примитива у
 * `NotificationSchedulerPort`, а реминдеров на реконсиляцию мало.
 */
async function applyReconciliation(
  scheduler: NotificationSchedulerPort,
  desired: readonly DesiredEntry[],
  currentlyScheduled: ReadonlySet<string>,
  nowLocal: Temporal.PlainDateTime,
  timezone: string,
): Promise<ReconciliationSummary> {
  const scheduled: string[] = [];
  const cancelled: string[] = [];
  const desiredIds = new Set<string>(desired.map((entry) => entry.reminder.id));

  for (const id of currentlyScheduled) {
    if (!desiredIds.has(id)) {
      // eslint-disable-next-line no-await-in-loop -- см. комментарий выше функции
      await scheduler.cancel(id);
      cancelled.push(id);
    }
  }

  for (const entry of desired) {
    if (currentlyScheduled.has(entry.reminder.id)) continue; // уже запланировано под этим id — идемпотентность, не дёргаем платформу повторно
    const target = readFiresAt(entry.reminder);
    if (target === null) continue;
    if (Temporal.PlainDateTime.compare(target, nowLocal) <= 0) continue; // не реплеим просроченное
    // eslint-disable-next-line no-await-in-loop -- см. комментарий выше функции
    await scheduler.schedule(
      entry.reminder.id,
      entry.title,
      target.toPlainDate(),
      target.toPlainTime(),
      timezone,
    );
    scheduled.push(entry.reminder.id);
  }

  return { scheduled, cancelled };
}
