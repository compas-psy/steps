/**
 * Реестр возможностей десктопа: честность (Unavailable с причиной там, где
 * возможности реально нет) и то, что реализованные порты вызывают именно
 * те функции плагина, которые заявлены в комментарии `platform.ts` — не
 * настоящий Tauri IPC (его здесь нет и не может быть без webview), а
 * подмена модулей плагинов.
 */
import { isAvailable } from '@shagi/platform';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const register = vi.fn(async () => undefined);
const unregister = vi.fn(async () => undefined);
vi.mock('@tauri-apps/plugin-global-shortcut', () => ({ register, unregister }));

const onOpenUrl = vi.fn(async () => () => undefined);
vi.mock('@tauri-apps/plugin-deep-link', () => ({ onOpenUrl }));

const writeText = vi.fn(async () => undefined);
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText }));

const { createDesktopPlatform } = await import('../src/platform.js');

describe('createDesktopPlatform', () => {
  beforeEach(() => {
    register.mockClear();
    unregister.mockClear();
    onOpenUrl.mockClear();
    writeText.mockClear();
  });

  it('капабилити, которых у десктопа честно нет в этом пакете работ, помечены Unavailable с причиной', () => {
    const platform = createDesktopPlatform();
    const expectedUnavailable = [
      'localDb',
      'fileStore',
      'secureCredentials',
      'notificationScheduler',
      'haptics',
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

  it('globalShortcut.register вызывает tauri-plugin-global-shortcut', () => {
    const platform = createDesktopPlatform();
    expect(isAvailable(platform.globalShortcut)).toBe(true);
    if (!isAvailable(platform.globalShortcut)) throw new Error('unreachable');

    const unsubscribe = platform.globalShortcut.register(
      'CommandOrControl+Shift+Space',
      () => undefined,
    );
    expect(register).toHaveBeenCalledWith('CommandOrControl+Shift+Space', expect.any(Function));
    unsubscribe();
    expect(unregister).toHaveBeenCalledWith('CommandOrControl+Shift+Space');
  });

  it('share() копирует в буфер обмена и возвращает "copied" (SPEC §4: Windows = clipboard)', async () => {
    const platform = createDesktopPlatform();
    expect(isAvailable(platform.share)).toBe(true);
    if (!isAvailable(platform.share)) throw new Error('unreachable');

    const result = await platform.share.share({ text: 'пример' });
    expect(writeText).toHaveBeenCalledWith('пример');
    expect(result).toBe('copied');
  });

  it('deepLink.onLink подписывается через tauri-plugin-deep-link', () => {
    const platform = createDesktopPlatform();
    expect(isAvailable(platform.deepLink)).toBe(true);
    if (!isAvailable(platform.deepLink)) throw new Error('unreachable');

    const unsubscribe = platform.deepLink.onLink(() => undefined);
    expect(onOpenUrl).toHaveBeenCalled();
    expect(typeof unsubscribe).toBe('function');
  });

  it('networkStatus читает navigator.onLine', () => {
    const platform = createDesktopPlatform();
    expect(isAvailable(platform.networkStatus)).toBe(true);
    if (!isAvailable(platform.networkStatus)) throw new Error('unreachable');
    expect(platform.networkStatus.isOnline()).toBe(navigator.onLine);
  });
});
