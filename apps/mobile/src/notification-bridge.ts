/**
 * Реализация `NotificationSchedulerPort` (`@shagi/platform`) поверх
 * `tauri-plugin-notification` (доставка/AlarmManager/boot-restore, ADR-0008)
 * и локального `tauri-plugin-alarm-capability` (единственное, чего нет в
 * официальном плагине — capability-проверка ДО планирования, `05§3.1`).
 *
 * Здесь НЕТ ни одного знания о задачах/метках/domain — только перевод
 * между `NotificationSchedulerPort`'s строковыми id/Temporal-значениями и
 * тем, что ждут два нативных моста (SPEC/00 §3 — в apps/* нет
 * бизнес-логики).
 */
import { invoke } from '@tauri-apps/api/core';
import {
  cancel as pluginCancel,
  isPermissionGranted,
  pending as pluginPending,
  requestPermission,
} from '@tauri-apps/plugin-notification';
import type {
  NotificationPrecision,
  NotificationSchedulerPort,
  ScheduledNotificationSnapshot,
} from '@shagi/platform';
import { Temporal } from '@js-temporal/polyfill';

/**
 * `tauri-plugin-notification` требует 32-битный id, `Reminder.id` — UUID.
 * Хэш детерминированный и однонаправленный: reconciliation (`02§14`)
 * сравнивает id туда-обратно только в пределах одного запуска процесса —
 * таблица `idByReminderId` ниже держит связь, а `reminderIdById` даёт
 * обратный путь для `listScheduled()`. FNV-1a (32-бит, простая, без
 * зависимостей) обрезается до 31 бита (`& 0x7fffffff`), чтобы гарантированно
 * остаться положительным — `tauri-plugin-notification` трактует id как Int.
 */
function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & 0x7fffffff;
}

export function createNotificationBridge(): NotificationSchedulerPort {
  const idByReminderId = new Map<string, number>();
  const reminderIdById = new Map<number, string>();

  function nativeId(reminderId: string): number {
    const existing = idByReminderId.get(reminderId);
    if (existing !== undefined) return existing;
    const id = fnv1a32(reminderId);
    idByReminderId.set(reminderId, id);
    reminderIdById.set(id, reminderId);
    return id;
  }

  return {
    async schedule(
      id: string,
      title: string,
      date: Temporal.PlainDate,
      time: Temporal.PlainTime | null,
      _timezone: string,
    ): Promise<void> {
      // ИСПРАВЛЕНО (Task B8, первый живой прогон на эмуляторе — контроллер
      // лично отменил собственное более раннее решение Task B4 по реальным
      // данным устройства, не по теории). Task B4 убрал `isPermissionGranted()`
      // gate, посчитав `requestPermission()` идемпотентным без разбора —
      // предположение не подтвердилось на устройстве. Реальная trace:
      // установленный guest-js `requestPermission()` зовёт
      // `window.Notification.requestPermission()`, который в Tauri —
      // НЕ голый браузерный API, а инжектированный полифилл
      // (`tauri-plugin-notification`'s `init-iife.js`), реально уходящий в
      // нативный `invoke('plugin:notification|request_permission')` →
      // Kotlin `NotificationPlugin.requestPermissions()`. У ЭТОЙ команды на
      // API 33+ (`android/.../NotificationPlugin.kt:250-259`) есть реальный
      // пробел: если разрешение уже выдано (`getPermissionState(...) ===
      // PermissionState.GRANTED`), `invoke.resolve(...)` НЕ вызывается ни в
      // одной ветке — промис остаётся вечно неразрешённым. Живой прогон
      // Task B8 (grant POST_NOTIFICATIONS до первого запуска, эмулируя уже
      // выданное разрешение) поймал это напрямую: `window.Notification.
      // permission` навсегда оставался `'default'`, `schedule()` зависал на
      // `await requestPermission()` и ни один alarm не создавался —
      // `dumpsys alarm` был пуст после каждой попытки. `isPermissionGranted()`
      // не имеет этой проблемы: она использует другой, более простой нативный
      // путь (`checkPermissions`/`getPermissionState()` без параметра →
      // `manager.areNotificationsEnabled()`), который реально резолвится.
      // Gate восстановлен как в исходном брифе: `requestPermission()`
      // вызывается ТОЛЬКО когда разрешения ещё нет — именно это и есть
      // «just-in-time» (SPEC §11.1), а не сам факт вызова на каждый
      // schedule().
      const granted = await isPermissionGranted();
      if (!granted) {
        const state = await requestPermission();
        if (state !== 'granted') return; // ST10 — молча не планировать без разрешения, экран сам сообщает об отказе
      }
      const plainDateTime =
        time === null ? date.toPlainDateTime({ hour: 9, minute: 0 }) : date.toPlainDateTime(time);
      const jsDate = new Date(
        plainDateTime.year,
        plainDateTime.month - 1,
        plainDateTime.day,
        plainDateTime.hour,
        plainDateTime.minute,
        plainDateTime.second,
      );
      // ИНВАРИАНТ (Task A6, owner): cancel ПЕРЕД batch, безусловно, даже
      // если это первое планирование этого id (тогда cancel — безвредный
      // no-op на стороне ОС). batch()'s PendingIntent-replace-по-id не
      // подтверждён на реальном устройстве из этой песочницы (нет
      // эмулятора) — Task B8 Step 3 подтверждает это отдельно; до тех пор
      // здесь не полагаемся на него, чтобы не оставить два живых alarm.
      const id32 = nativeId(id);
      await pluginCancel([id32]);
      // `plugin:notification|batch`, НЕ guest-js `sendNotification()` — ADR-0008
      // (Task B1): только `batch` пишет в `NotificationStorage` на Android
      // (`NotificationPlugin.kt:143-149`), от которой зависят и boot-restore
      // (`LocalNotificationRestoreReceiver`), и `pending()`/`listScheduled()`
      // ниже. `sendNotification()` (Kotlin `show()`) этого не делает —
      // реально запланированный этим путём alarm был бы невидим для обоих.
      // Один элемент в массиве — тот же реальный, зарегистрированный
      // mobile-only команда плагина (`plugins/notification/build.rs`
      // `COMMANDS`), тем же способом, что `get_pending`/`cancel` уже
      // вызываются в этом файле — просто не обёрнута guest-js. Имя команды
      // подтверждено чтением `build.rs` установленного крейта 2.4.0 (Task
      // B4, Шаг 1): `"batch"` есть в списке `COMMANDS` наравне с `cancel`/
      // `get_pending`.
      //
      // Форма `schedule.at` — ВЛОЖЕННЫЙ объект `{ date, repeating,
      // allowWhileIdle }`, не плоские поля рядом с `at`: тот же формат,
      // что строит собственный guest-js `Schedule.at()` установленного
      // пакета (`dist-js/index.js`), и тот же, в котором `get_pending`
      // отдаёт его обратно (`dist-js/index.d.ts`, `PendingNotification.
      // schedule.at`) — см. `listScheduled` ниже.
      await invoke('plugin:notification|batch', {
        notifications: [
          {
            id: id32,
            title,
            schedule: { at: { date: jsDate, repeating: false, allowWhileIdle: true } },
          },
        ],
      });
    },

    async cancel(id: string): Promise<void> {
      await pluginCancel([nativeId(id)]);
    },

    /**
     * Task A6: снимок содержимого, не только id — `pending()`'s реальный
     * `PendingNotification{id,title,body,schedule}` переводится в
     * `ScheduledNotificationSnapshot` (`@shagi/platform`), чтобы
     * `packages/app` могло сравнить title/момент срабатывания с желаемым,
     * не зная ничего о форме DTO конкретного плагина. `schedule.at` —
     * ВЛОЖЕННЫЙ объект `{ date, repeating, allowWhileIdle } | undefined`
     * (`dist-js/index.d.ts` установленного пакета 2.4.0, Task B4 Шаг 1 —
     * не голая Date/эпоха, как можно было бы предположить по названию
     * поля); `.date` — эпоха/`Date` на стороне плагина, конвертация в
     * `Temporal.Instant` происходит ЗДЕСЬ, на границе адаптера (CLAUDE.md:
     * сырые миллисекунды разрешены только в нативном слое, не в
     * `@shagi/app`). `undefined` в принципе возможен только для записей,
     * запланированных через `interval`/`every` — этот мост создаёт только
     * `at`-расписания (см. `schedule` выше), так что для СВОИХ записей
     * `at` всегда присутствует; запись без `at` тем не менее пропускается,
     * а не бросает — `listScheduled()` не обязан падать на чужом
     * расписании, которое этот код не создавал.
     */
    async listScheduled(): Promise<readonly ScheduledNotificationSnapshot[]> {
      // RECONCILE_PENDING_* — временная диагностика P0 CONFIRMED (Task B8,
      // владелец, прогон `33872888416`): `pluginPending()` — сам guest-js
      // `pending()` установленного `tauri-plugin-notification`, тот же
      // вызов, что раньше через сырой CDP-invoke ловил "Uncaught (in
      // promise) Object" в диагностике смоук-теста (до её удаления) — этот
      // маркер проверяет, не бросает ли он то же самое и ВНУТРИ production-
      // моста. Только имена этапов и количество, без содержимого записей.
      // Удалить после диагностики A6.
      // eslint-disable-next-line no-console -- временная диагностика P0-эксперимента (Task B8, владелец), без содержимого
      console.log('RECONCILE_PENDING_REQUESTED');
      const scheduled = await pluginPending();
      // eslint-disable-next-line no-console -- временная диагностика P0-эксперимента (Task B8, владелец), только count
      console.log('RECONCILE_PENDING_RETURNED', scheduled.length);
      const result: ScheduledNotificationSnapshot[] = [];
      for (const entry of scheduled) {
        const reminderId = reminderIdById.get(entry.id);
        if (reminderId === undefined) continue;
        const at = entry.schedule.at;
        if (at === undefined) continue;
        result.push({
          reminderId,
          title: entry.title ?? '',
          scheduledAt: Temporal.Instant.fromEpochMilliseconds(new Date(at.date).getTime()),
        });
      }
      return result;
    },

    /**
     * Имя команды подтверждено чтением `build.rs`
     * `tauri-plugin-alarm-capability` (Task B3, локальный крейт) — плагин
     * зарегистрирован как `Builder::new("alarm-capability")`
     * (`plugins/alarm-capability/src/lib.rs`), команды
     * `can_schedule_exact`/`open_exact_alarm_settings` (`build.rs` COMMANDS)
     * — тот же `plugin:<имя>|<команда>` формат, что `get_pending`/`cancel`
     * у `tauri-plugin-notification`.
     *
     * ВАЖНО, уточнение сверх brief (Task B4, Шаг 1 — проверено чтением
     * установленного крейта, не предположение): Rust-команда
     * `commands::can_schedule_exact` (`plugins/alarm-capability/src/commands.rs`)
     * объявлена как `-> Result<bool>` — на границе `invoke()` это ГОЛЫЙ
     * `boolean`, а не `{ value: boolean }`. `{ value: bool }`
     * (`BoolResponse` в `plugins/alarm-capability/src/mobile.rs`) — это
     * форма ответа именно Kotlin-плагина через `run_mobile_plugin`,
     * которую Rust-обёртка распаковывает (`.map(|r| r.value)`) ДО того, как
     * значение уходит в TS. Обёртка `{ value }` здесь не нужна и не
     * появляется.
     */
    async getSchedulingCapability(): Promise<NotificationPrecision> {
      const canScheduleExact = await invoke<boolean>('plugin:alarm-capability|can_schedule_exact');
      return canScheduleExact ? 'exact' : 'inexact';
    },
  };
}
