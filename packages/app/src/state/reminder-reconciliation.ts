import { Temporal } from '@js-temporal/polyfill';
import { toZonedDateTime, type Reminder, type Task, type Uuid } from '@shagi/core';
import type { NotificationSchedulerPort, ScheduledNotificationSnapshot } from '@shagi/platform';
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
 * Сравнение двух `Temporal.Instant` для дименсии 2 (`applyReconciliation`
 * ниже) — округлено до секунды, не точное `Instant.equals()` (Task A6, Шаг
 * 1 брифа — решение зафиксировано здесь, не угадано втихую).
 *
 * Почему не точное равенство: обе стороны сравнения В ЭТОМ пакете работ
 * ДЕЙСТВИТЕЛЬНО совпадают побитово при одинаковых date/time/timezone —
 * `desiredInstant` здесь и `scheduledAt` веб-адаптера
 * (`apps/web/src/platform.ts`) оба получены одним и тем же путём,
 * `PlainDate.toZonedDateTime(...).toInstant()`, целочисленная арифметика
 * Temporal без плавающей точки. Округление тем не менее нужно, потому что
 * этот компаратор не привязан к одному-единственному адаптеру: снимок
 * `listScheduled()` по контракту порта (`packages/platform`) может прийти
 * от ЛЮБОЙ платформы, а Android-адаптер (Task B4, вне этого пакета работ)
 * получит `scheduledAt` из Kotlin/JNI `PendingNotification`, конвертация
 * через который не гарантированно бесшовна с Temporal (лишний проход через
 * `Date`/epoch-millis на границе рантаймов — источник ровно того шума,
 * которого здесь нет сегодня, но который эта функция обязана пережить не
 * ломаясь). Секунда — тот же порядок, что минимальный шаг пользовательского
 * времени в этом продукте (целые минуты, CLAUDE.md, «Время») — 60-кратный
 * запас над реальным шумом округления и всё ещё многократно меньше любого
 * ЗНАЧИМОГО дрейфа (смена таймзоны сдвигает момент на десятки минут-часы,
 * правка времени пользователем — минимум на минуту), так что настоящий
 * дрейф эта функция не замаскирует. Реальная точность Android-адаптера —
 * задача Task B8 (эмпирическая проверка на устройстве), не этой.
 */
function instantsMatch(a: Temporal.Instant, b: Temporal.Instant): boolean {
  return a.round({ smallestUnit: 'second' }).equals(b.round({ smallestUnit: 'second' }));
}

/**
 * Момент срабатывания напоминания, разрешённый в АБСОЛЮТНЫЙ `Instant` в
 * ТЕКУЩЕЙ таймзоне устройства (`01§19`) — дименсия 2 сравнения ниже.
 * `toZonedDateTime` (`@shagi/core`, `temporal/timezone.ts`) — тот же
 * единственный в кодовой базе конвертер `PlainDate+PlainTime|null+IANA →
 * ZonedDateTime`, что уже использует веб-адаптер (`apps/web/src/
 * platform.ts`) для вычисления `delayMs`; переиспользован, не продублирован
 * (Шаг 1 брифа этой задачи).
 */
function resolveDesiredInstant(target: Temporal.PlainDateTime, timezone: string): Temporal.Instant {
  return toZonedDateTime(target.toPlainDate(), target.toPlainTime(), timezone).toInstant();
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
 * Идемпотентность БЕЗ персистентного состояния (Task A6 — третья и
 * финальная редакция дизайна, заменяет PRE-FLIGHT RULING брифа Task A3):
 * желаемое напоминание, чей `id` уже есть в `listScheduled()` И чьи
 * содержимое (`title`) и разрешённый момент (`scheduledAt`) СОВПАДАЮТ с
 * заново вычисленным желаемым состоянием — настоящий no-op, платформа не
 * дёргается. Функция сознательно не читает и не пишет
 * `Reminder.scheduledFingerprint` (подробный разбор — `commands/
 * reminder-fingerprint.ts` в `@shagi/core`): персистентный снимок желаемого
 * сам может устареть (переименование задачи ничего в нём не пересчитывает
 * задним числом) точно так же, как устаревало старое чистое id-присутствие
 * — единственный надёжный источник "актуально ли содержимое" это ЖИВОЙ
 * пересчёт обеих сторон на каждый прогон, `applyReconciliation` ниже.
 *
 * Раньше (Task A3) "редактирование" (`TaskDetail.tsx`
 * `handleSubmitReminder`: `cancelReminderCommand` + свежий
 * `createExplicitReminderCommand` с НОВЫМ `id`) было ЕДИНСТВЕННЫМ способом
 * увидеть смену `firesAt` у reconciliation — само по себе чистое
 * id-присутствие не заметило бы мутацию на месте того же id. Это
 * допущение реконсиляции больше не требуется для корректности (дименсия 2
 * ловит и такую мутацию тоже), но остаётся верным описанием реального
 * командного слоя сегодня — эта функция не проверяет мутацию `firesAt` на
 * месте отдельно, потому что её сегодня ничто не производит.
 */
export async function reconcileReminderSchedule(
  storage: StoragePort,
  scheduler: NotificationSchedulerPort,
  nowLocal: Temporal.PlainDateTime,
  timezone: string,
): Promise<ReconciliationSummary> {
  const desired = await desiredReminders(storage);
  // RECONCILE_DESIRED_LOADED — временная диагностика P0 CONFIRMED (Task B8,
  // владелец): только количество, ни одного заголовка/содержимого задачи.
  // Удалить после диагностики A6 вместе с BOOT_RECONCILE_*/RECONCILE_PENDING_*
  // (`App.tsx`/`notification-bridge.ts`).
  // eslint-disable-next-line no-console -- временная диагностика P0-эксперимента (Task B8, владелец), только count
  console.log('RECONCILE_DESIRED_LOADED', desired.length);
  const actual = await scheduler.listScheduled();
  return applyReconciliation(scheduler, desired, actual, nowLocal, timezone);
}

/**
 * Та же логика, только для ОДНОЙ задачи — дешёвый путь, вызываемый сразу
 * после команд, меняющих расписание (Task A4, следующий пакет работ), без
 * полного скана хранилища (`desiredRemindersForTask`, не `listAllEnabled`).
 *
 * `actual` здесь — НЕ строки хранилища этой задачи (черновик брифа Task A3
 * предлагал именно так, но это ошибочно: свежесозданное, ещё ни разу не
 * запланированное напоминание тоже лежит в `listByTask`, и тогда
 * `applyReconciliation` решил бы, что оно "уже согласовано", и НИКОГДА не
 * вызвал бы `schedule` — см. отчёт Task A3). Правильный источник истины тот
 * же, что у полного скана — реальный `scheduler.listScheduled()` — просто
 * отфильтрованный по id напоминаний ЭТОЙ задачи, чтобы не отменить чужие
 * (иначе `applyReconciliation` отменил бы любой чужой снимок платформы,
 * которого нет среди `desired` этой единственной задачи).
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
  const actualAll = await scheduler.listScheduled();
  const actual = actualAll.filter((snapshot) => taskReminderIds.has(snapshot.reminderId));
  return applyReconciliation(scheduler, desired, actual, nowLocal, timezone);
}

/**
 * Общее ядро обоих путей выше: отменить лишнее (запланировано, но больше не
 * желаемо), доспланировать недостающее ИЛИ УСТАРЕВШЕЕ (желаемо, но либо ещё
 * не на платформе, либо на платформе под другим содержимым — не просрочено).
 * Последовательно (`for`, не `Promise.all`) — тот же компромисс, что уже
 * документирует `archiveProjectCommand` (`project-archive.ts`,
 * `@shagi/core`): нет batch-примитива у `NotificationSchedulerPort`, а
 * реминдеров на реконсиляцию мало.
 *
 * Две независимые дименсии свежести (Task A6, владелец, финальная редакция
 * — заголовок брифа этой задачи буквально называет их "two independent
 * dimensions"):
 *   1. payload — `actual.title` (реально осевший в системном уведомлении)
 *      против `entry.title` (ЖИВОЙ заголовок задачи, тот же `findById`, что
 *      уже сделан ради проверки её активности выше по стеку,
 *      `desiredReminders`/`desiredRemindersForTask`).
 *   2. разрешённый момент — `actual.scheduledAt` против `desiredInstant`,
 *      вычисленного ЖИВЬЁМ из `firesAt` в ТЕКУЩЕЙ `timezone` этого прогона
 *      (`resolveDesiredInstant`) — ловит дрейф после смены часового пояса
 *      устройства без единой мутации `Reminder`/`Task` (`01§19`).
 * Устарело (→ `schedule()`, замена), если id вообще отсутствует в `actual`
 * ИЛИ различается ХОТЯ БЫ одна дименсия. Обе совпадают → настоящий no-op.
 * `precision` снимка сюда намеренно НЕ входит третьей дименсией — заголовок
 * задачи этой задачи говорит буквально о ДВУХ дименсиях, а не о трёх;
 * поле в `ScheduledNotificationSnapshot` существует ради честного будущего
 * применения (Android/Task B4), не декорация, но эта функция его не читает.
 */
async function applyReconciliation(
  scheduler: NotificationSchedulerPort,
  desired: readonly DesiredEntry[],
  actual: readonly ScheduledNotificationSnapshot[],
  nowLocal: Temporal.PlainDateTime,
  timezone: string,
): Promise<ReconciliationSummary> {
  const scheduled: string[] = [];
  const cancelled: string[] = [];
  const desiredIds = new Set<string>(desired.map((entry) => entry.reminder.id));
  const actualById = new Map<string, ScheduledNotificationSnapshot>(
    actual.map((snapshot) => [snapshot.reminderId, snapshot]),
  );

  for (const snapshot of actualById.values()) {
    if (!desiredIds.has(snapshot.reminderId)) {
      // eslint-disable-next-line no-await-in-loop -- см. комментарий выше функции
      await scheduler.cancel(snapshot.reminderId);
      cancelled.push(snapshot.reminderId);
    }
  }

  for (const entry of desired) {
    const target = readFiresAt(entry.reminder);
    if (target === null) continue;
    if (Temporal.PlainDateTime.compare(target, nowLocal) <= 0) continue; // не реплеим просроченное

    const existing = actualById.get(entry.reminder.id);
    if (existing !== undefined) {
      const desiredInstant = resolveDesiredInstant(target, timezone);
      const titleMatches = existing.title === entry.title;
      const instantMatches = instantsMatch(desiredInstant, existing.scheduledAt);
      if (titleMatches && instantMatches) continue; // обе дименсии совпадают — настоящий no-op, платформу не дёргаем
    }

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
