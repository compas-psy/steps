import { describe, expect, it } from 'vitest';

import {
  PACKAGE_NAME,
  createUnavailablePlatform,
  isAvailable,
  type PlatformCapabilitiesRegistry,
} from '../src/index.js';

/**
 * Проверка типизации: правильный код, который проверяет доступность.
 * Эта функция должна скомпилироваться без ошибок.
 */
function testCorrectUsageWithTypeGuard(platform: PlatformCapabilitiesRegistry) {
  const reminder = platform.notificationScheduler;

  // ✅ Правильно: используем type guard для проверки
  if (isAvailable(reminder)) {
    // Теперь TypeScript знает, что reminder это NotificationSchedulerPort
    void reminder.schedule('id', 'title', undefined as any, null, 'UTC');
  }
}

/**
 * Проверка типизации: неправильный код без разбора.
 * Эта функция НЕ должна скомпилироваться — вызов должен быть под @ts-expect-error.
 */
function testIncorrectUsageWithoutCheck(platform: PlatformCapabilitiesRegistry) {
  const reminder = platform.notificationScheduler;

  // ❌ Ошибка типа: пытаемся использовать порт без проверки доступности
  // @ts-expect-error: reminder может быть Unavailable
  void reminder.schedule('id', 'title', undefined as any, null, 'UTC');
}

describe('@shagi/platform', () => {
  it('экспортирует собственное имя пакета — подтверждает, что резолвинг модулей, tsconfig и vitest настроены сквозь весь тулчейн', () => {
    expect(PACKAGE_NAME).toBe('@shagi/platform');
  });

  describe('isAvailable()', () => {
    it('возвращает false для Unavailable', () => {
      const platform = createUnavailablePlatform();
      const localDb = platform.localDb;
      expect(isAvailable(localDb)).toBe(false);
    });

    it('может быть использована как type guard', () => {
      const platform = createUnavailablePlatform();
      const reminder = platform.notificationScheduler;

      if (isAvailable(reminder)) {
        expect.fail('Unavailable не должна пройти isAvailable');
      }

      expect(!isAvailable(reminder)).toBe(true);
    });
  });

  describe('Unavailable', () => {
    it('маркер недоступности имеет kind = "unavailable"', () => {
      const platform = createUnavailablePlatform();
      const localDb = platform.localDb;
      expect('kind' in localDb && localDb.kind === 'unavailable').toBe(true);
    });

    it('может содержать необязательное объяснение причины', () => {
      const platform = createUnavailablePlatform();
      const localDb = platform.localDb;
      if ('reason' in localDb) {
        expect(typeof localDb.reason).toBe('string');
      }
    });
  });

  describe('createUnavailablePlatform()', () => {
    it('возвращает реестр со всеми возможностями помеченными как недоступные', () => {
      const platform = createUnavailablePlatform();

      const capabilities = [
        'localDb',
        'fileStore',
        'secureCredentials',
        'notificationScheduler',
        'deepLink',
        'share',
        'globalShortcut',
        'haptics',
        'widget',
        'updater',
        'billing',
        'pushHint',
        'networkStatus',
        'calendarProvider',
        'audioCapture',
      ] as const;

      for (const capability of capabilities) {
        const port = platform[capability];
        const isUnavailable = 'kind' in port && port.kind === 'unavailable';
        expect(
          isUnavailable,
          `${capability} должен быть Unavailable, но получен: ${JSON.stringify(port)}`,
        ).toBe(true);
      }
    });

    it('каждая недоступная возможность помечена с одинаковым сообщением', () => {
      const platform = createUnavailablePlatform();

      const localDb = platform.localDb;
      const notificationScheduler = platform.notificationScheduler;

      if ('reason' in localDb && 'reason' in notificationScheduler) {
        expect(localDb.reason).toBe(notificationScheduler.reason);
      }
    });
  });

  describe('Типизация: невозможно использовать возможность без проверки', () => {
    it('компилятор требует разбора Unavailable перед использованием порта', () => {
      expect(typeof testCorrectUsageWithTypeGuard).toBe('function');
    });

    it('компилятор запретит использование порта без разбора (проверяется @ts-expect-error)', () => {
      expect(typeof testIncorrectUsageWithoutCheck).toBe('function');
    });
  });

  describe('PlatformCapabilitiesRegistry', () => {
    it('содержит ровно 15 портов', () => {
      const platform = createUnavailablePlatform();
      const keys = Object.keys(platform);
      expect(keys).toHaveLength(15);
    });

    it('содержит все требуемые в ТЗ порты', () => {
      const platform = createUnavailablePlatform();

      const requiredCapabilities = [
        'localDb',
        'fileStore',
        'secureCredentials',
        'notificationScheduler',
        'deepLink',
        'share',
        'globalShortcut',
        'haptics',
        'widget',
        'updater',
        'billing',
        'pushHint',
        'networkStatus',
        'calendarProvider',
        'audioCapture',
      ] as const;

      for (const cap of requiredCapabilities) {
        expect(cap in platform, `${cap} должен быть в реестре`).toBe(true);
      }
    });
  });

  describe('Нулевая платформа для тестов', () => {
    it('безопасна для использования в тестовых окружениях', () => {
      const platform = createUnavailablePlatform();

      const capabilities = [
        'localDb',
        'fileStore',
        'secureCredentials',
        'notificationScheduler',
        'deepLink',
        'share',
        'globalShortcut',
        'haptics',
        'widget',
        'updater',
        'billing',
        'pushHint',
        'networkStatus',
        'calendarProvider',
        'audioCapture',
      ] as const;

      for (const cap of capabilities) {
        const port = platform[cap];
        expect(port).toBeDefined();
        expect('kind' in port).toBe(true);
      }
    });
  });
});
