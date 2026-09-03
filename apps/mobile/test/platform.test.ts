/**
 * Реестр возможностей мобайла: честность (Unavailable с причиной там, где
 * нативная сторона не подключена в этом пакете работ) и то, что haptics
 * реально дёргает `navigator.vibrate`, а не притворяется.
 */
import { isAvailable } from '@shagi/platform';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const onOpenUrl = vi.fn(async () => () => undefined);
vi.mock('@tauri-apps/plugin-deep-link', () => ({ onOpenUrl }));

const { createMobilePlatform } = await import('../src/platform.js');

describe('createMobilePlatform', () => {
  beforeEach(() => {
    onOpenUrl.mockClear();
  });

  it('капабилити, которых нет в этом пакете работ, помечены Unavailable с причиной', () => {
    const platform = createMobilePlatform();
    const expectedUnavailable = [
      'localDb',
      'fileStore',
      'secureCredentials',
      'share',
      'globalShortcut',
      'widget',
      'updater',
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

  it('haptics.light реально вызывает navigator.vibrate', async () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });

    const platform = createMobilePlatform();
    expect(isAvailable(platform.haptics)).toBe(true);
    if (!isAvailable(platform.haptics)) throw new Error('unreachable');

    await platform.haptics.light();
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it('deepLink.onLink подписывается через tauri-plugin-deep-link', () => {
    const platform = createMobilePlatform();
    expect(isAvailable(platform.deepLink)).toBe(true);
    if (!isAvailable(platform.deepLink)) throw new Error('unreachable');

    const unsubscribe = platform.deepLink.onLink(() => undefined);
    expect(onOpenUrl).toHaveBeenCalled();
    expect(typeof unsubscribe).toBe('function');
  });

  it('notificationScheduler подключён (Task B4: notification-bridge.ts, не Unavailable-заглушка)', () => {
    const platform = createMobilePlatform();
    expect(isAvailable(platform.notificationScheduler)).toBe(true);
  });

  it('networkStatus читает navigator.onLine', () => {
    const platform = createMobilePlatform();
    expect(isAvailable(platform.networkStatus)).toBe(true);
    if (!isAvailable(platform.networkStatus)) throw new Error('unreachable');
    expect(platform.networkStatus.isOnline()).toBe(navigator.onLine);
  });
});
