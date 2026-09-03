// apps/mobile/test/notification-bridge.test.ts
import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-notification', () => ({
  cancel: vi.fn(),
  pending: vi.fn().mockResolvedValue([]),
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue('granted'),
}));

import { invoke } from '@tauri-apps/api/core';
import * as plugin from '@tauri-apps/plugin-notification';
import { createNotificationBridge } from '../src/notification-bridge.js';

describe('createNotificationBridge', () => {
  it('schedule запрашивает разрешение just-in-time и планирует через plugin:notification|batch (НЕ sendNotification — 05§ADR-0008: только batch пишет в NotificationStorage)', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([1]); // ответ batch — массив id
    const bridge = createNotificationBridge();
    await bridge.schedule(
      'reminder-1',
      'Напомнить',
      Temporal.PlainDate.from('2099-01-01'),
      Temporal.PlainTime.from('09:00:00'),
      'Europe/Moscow',
    );
    expect(plugin.requestPermission).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith(
      'plugin:notification|batch',
      expect.objectContaining({
        notifications: [expect.objectContaining({ title: 'Напомнить' })],
      }),
    );
  });

  it('cancel вызывает плагин с числовым id, стабильно выведенным из строкового', async () => {
    const bridge = createNotificationBridge();
    await bridge.cancel('reminder-1');
    expect(plugin.cancel).toHaveBeenCalledWith([expect.any(Number)]);
  });

  it('schedule отменяет старый id ПЕРЕД batch — на случай, если это replace (owner-инвариант: два живых alarm недопустимы)', async () => {
    const bridge = createNotificationBridge();
    await bridge.schedule(
      'reminder-1',
      'Напомнить',
      Temporal.PlainDate.from('2099-01-01'),
      null,
      'UTC',
    );
    // cancel ДО batch, тем же nativeId — порядок вызовов проверяем явно,
    // не только факт вызова, иначе тест не поймает "batch затем cancel"
    // (защита от переезда, не от alarm вообще).
    const cancelOrder = vi.mocked(plugin.cancel).mock.invocationCallOrder[0];
    const batchOrder = vi.mocked(invoke).mock.invocationCallOrder[0];
    if (cancelOrder === undefined || batchOrder === undefined) {
      throw new Error('unreachable: оба мока обязаны быть вызваны в этом тесте');
    }
    expect(cancelOrder).toBeLessThan(batchOrder);
  });

  it('listScheduled переводит pending() обратно в исходный snapshot (id → string, схема → Temporal.Instant, title сквозной)', async () => {
    const bridge = createNotificationBridge();
    // расписать сначала, чтобы таблица id была заполнена — реализация
    // обязана помнить обратное отображение int32 → исходный string id.
    // Конкретное числовое значение id — деталь реализации (FNV-1a от
    // 'reminder-1'), поэтому тест ловит его из реального вызова batch, а не
    // подставляет свою константу — иначе тест был бы завязан на алгоритм
    // хэширования, а не на контракт (round-trip id туда-обратно).
    vi.mocked(invoke).mockResolvedValueOnce([1]); // ответ batch — массив id, конкретное значение здесь не используется
    await bridge.schedule(
      'reminder-1',
      'Напомнить',
      Temporal.PlainDate.from('2099-01-01'),
      null,
      'UTC',
    );
    const batchCall = vi
      .mocked(invoke)
      .mock.calls.find((call) => call[0] === 'plugin:notification|batch');
    if (batchCall === undefined) throw new Error('unreachable: batch обязан быть вызван');
    const notifications = (batchCall[1] as { notifications: readonly { id: number }[] })
      .notifications;
    const first = notifications[0];
    if (first === undefined) throw new Error('unreachable: notifications не пуст');
    const nativeId = first.id;
    expect(nativeId).toEqual(expect.any(Number));
    // `schedule.at` реального `PendingNotification` (`@tauri-apps/plugin-notification`
    // `dist-js/index.d.ts`) — ВЛОЖЕННЫЙ объект `{ date, repeating, allowWhileIdle }`,
    // не голая Date/эпоха (проверено чтением `.d.ts` установленного пакета 2.4.0,
    // Task B4 Шаг 1). Тот же нативный `Schedule.at()` строит именно такую форму,
    // см. `notification-bridge.ts`.
    vi.mocked(plugin.pending).mockResolvedValueOnce([
      {
        id: nativeId,
        title: 'Напомнить',
        schedule: {
          at: { date: new Date('2099-01-01T00:00:00Z'), repeating: false, allowWhileIdle: true },
        },
      } as never,
    ]);
    const snapshots = await bridge.listScheduled();
    expect(snapshots).toEqual([
      expect.objectContaining({
        reminderId: 'reminder-1',
        title: 'Напомнить',
        scheduledAt: expect.any(Temporal.Instant),
      }),
    ]);
  });

  it('getSchedulingCapability спрашивает нативный canScheduleExact', async () => {
    // Реальная сигнатура: `commands::can_schedule_exact` в
    // `tauri-plugin-alarm-capability` (Task B3) возвращает `Result<bool>` —
    // на границе invoke() это ГОЛЫЙ boolean, не `{ value: bool }`.
    // `{ value: bool }` — внутренняя форма ответа Kotlin-плагина
    // (`BoolResponse` в `alarm-capability/src/mobile.rs`), которую
    // Rust-обёртка уже распаковывает ДО того, как значение долетает до TS
    // (`.map(|r| r.value)` в `mobile.rs`). Смотри отчёт по Task B4,
    // раздел «Шаг 1 — уточнение сверх brief».
    vi.mocked(invoke).mockResolvedValueOnce(true);
    const bridge = createNotificationBridge();
    expect(await bridge.getSchedulingCapability()).toBe('exact');
  });

  it('getSchedulingCapability возвращает inexact, если canScheduleExact лжёт false', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(false);
    const bridge = createNotificationBridge();
    expect(await bridge.getSchedulingCapability()).toBe('inexact');
  });
});
