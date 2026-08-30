import { afterEach, describe, expect, it, vi } from 'vitest';

import { t } from '../src/index.js';
import { MissingTranslationError, resolveMode } from '../src/missing-key.js';

/**
 * SPEC/00 §13.1: «Missing Russian key/fallback-to-key in production build
 * is a CI failure.» Основной гейт — статический (`scripts/check-i18n-
 * catalog.mjs`), но рантайм тоже обязан вести себя правильно на случай
 * динамического ключа, который статика не увидела: production — исключение,
 * никогда не тихая подстановка имени ключа.
 */
describe('отсутствующий ключ: рантайм-поведение', () => {
  const originalMode = process.env.SHAGI_I18N_MODE;

  afterEach(() => {
    if (originalMode === undefined) delete process.env.SHAGI_I18N_MODE;
    else process.env.SHAGI_I18N_MODE = originalMode;
  });

  it('production: бросает MissingTranslationError, а не подставляет имя ключа', () => {
    process.env.SHAGI_I18N_MODE = 'production';
    expect(resolveMode()).toBe('production');
    // @ts-expect-error — намеренно несуществующий ключ, проверяем рантайм-путь
    expect(() => t('common', 'no.such.key')).toThrow(MissingTranslationError);
    // @ts-expect-error — намеренно несуществующий ключ, проверяем рантайм-путь
    expect(() => t('common', 'no.such.key')).toThrow(/no\.such\.key/);
  });

  it('development: не роняет вызов, но заметно предупреждает и не отдаёт голое имя ключа', () => {
    process.env.SHAGI_I18N_MODE = 'development';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    // @ts-expect-error — намеренно несуществующий ключ, проверяем рантайм-путь
    const result = t('common', 'no.such.key');
    expect(result).not.toBe('no.such.key');
    expect(result).toContain('no.such.key');
    expect(result).toMatch(/^⟦missing:/);
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('неизвестное окружение (NODE_ENV не задан/не development) трактуется как production — fail-closed', () => {
    delete process.env.SHAGI_I18N_MODE;
    const originalNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      expect(resolveMode()).toBe('production');
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
