// @vitest-environment happy-dom
/**
 * Реестр возможностей веб-платформы: главное, что здесь проверяется, —
 * честность (SPEC §11.1, `packages/platform/src/index.ts`): недоступная
 * возможность обязана быть `Unavailable`, а не заглушкой, притворяющейся
 * успехом, и `notificationScheduler` обязан ВСЕГДА признавать
 * `'no-guarantee'` — веб не может обещать доставку при закрытом браузере.
 */
import { Temporal } from '@js-temporal/polyfill';
import { isAvailable } from '@shagi/platform';
import { describe, expect, it } from 'vitest';

import { createWebPlatform } from '../src/platform.js';

describe('createWebPlatform', () => {
  it('notificationScheduler всегда честно отдаёт no-guarantee', async () => {
    const platform = createWebPlatform();
    expect(isAvailable(platform.notificationScheduler)).toBe(true);
    if (!isAvailable(platform.notificationScheduler)) throw new Error('unreachable');
    const capability = await platform.notificationScheduler.getSchedulingCapability();
    expect(capability).toBe('no-guarantee');
  });

  it('networkStatus реально читает navigator.onLine', () => {
    const platform = createWebPlatform();
    expect(isAvailable(platform.networkStatus)).toBe(true);
    if (!isAvailable(platform.networkStatus)) throw new Error('unreachable');
    expect(platform.networkStatus.isOnline()).toBe(navigator.onLine);
  });

  it('deepLink подписывается и отписывается без ошибок', () => {
    const platform = createWebPlatform();
    expect(isAvailable(platform.deepLink)).toBe(true);
    if (!isAvailable(platform.deepLink)) throw new Error('unreachable');
    const unsubscribe = platform.deepLink.onLink(() => undefined);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('localDb доступен (E04) и initialize()/close() не бросают', async () => {
    const platform = createWebPlatform();
    expect(isAvailable(platform.localDb)).toBe(true);
    if (!isAvailable(platform.localDb)) throw new Error('unreachable');
    await expect(platform.localDb.initialize()).resolves.toBeUndefined();
    await expect(platform.localDb.close()).resolves.toBeUndefined();
  });

  it('капабилити, которых у веба на этом этапе честно нет, помечены Unavailable с причиной', () => {
    const platform = createWebPlatform();
    const expectedUnavailable = [
      'fileStore',
      'secureCredentials',
      'globalShortcut',
      'haptics',
      'widget',
      'billing',
      'pushHint',
      'calendarProvider',
      'audioCapture',
    ] as const;

    for (const key of expectedUnavailable) {
      const capability = platform[key];
      expect(isAvailable(capability), `${key} должен быть Unavailable`).toBe(false);
      if (isAvailable(capability)) continue;
      expect(capability.reason, `${key}: нет объяснения недоступности`).toBeTruthy();
    }
  });

  it('schedule() принимает Temporal.PlainDate/PlainTime, не Date', async () => {
    const platform = createWebPlatform();
    if (!isAvailable(platform.notificationScheduler)) throw new Error('unreachable');
    // Дата в прошлом — schedule должен тихо не планировать таймер (просрочено),
    // а не бросать исключение: проверяем только, что сигнатура верна.
    await expect(
      platform.notificationScheduler.schedule(
        'test-1',
        'заголовок',
        Temporal.PlainDate.from('2020-01-01'),
        Temporal.PlainTime.from('09:00'),
        'Europe/Moscow',
      ),
    ).resolves.toBeUndefined();
    await platform.notificationScheduler.cancel('test-1');
  });

  it('listScheduled возвращает id всех запланированных, не отменённых уведомлений', async () => {
    const platform = createWebPlatform();
    if (!isAvailable(platform.notificationScheduler)) throw new Error('unreachable');
    // Дата — недалёкое будущее (дни, не десятилетия): `setTimeout` в Node
    // хранит задержку в 32-битном signed int, а дата из исходного плана
    // (2099-01-01, ~73 года вперёд) в неё не помещается — задержка
    // переполняется, Node тут же исполняет колбэк (TimeoutOverflowWarning),
    // а колбэк трогает глобальный `Notification`, которого нет в happy-dom.
    // Тест падает не из-за listScheduled, а из-за этого побочного эффекта,
    // не относящегося к проверке. Здесь важно только, что таймер стоит.
    const now = Temporal.Now.plainDateISO('UTC');
    await platform.notificationScheduler.schedule(
      'r1',
      'Заголовок',
      now.add({ days: 5 }),
      null,
      'UTC',
    );
    await platform.notificationScheduler.schedule(
      'r2',
      'Заголовок 2',
      now.add({ days: 6 }),
      null,
      'UTC',
    );
    await platform.notificationScheduler.cancel('r1');
    expect(await platform.notificationScheduler.listScheduled()).toEqual(['r2']);
  });
});
