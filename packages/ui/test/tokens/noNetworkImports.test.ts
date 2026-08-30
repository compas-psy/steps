import { describe, expect, it } from 'vitest';

import { extractUrls, readBundledCss, readTokenFile } from './cssHelpers.js';

/**
 * Нет сетевых зависимостей (SPEC §2: «Runtime Google Fonts network
 * dependency prohibited»). Проверяемая формулировка запрета:
 * - ни одного `@import` с внешним URL (http/https) в CSS пакета;
 * - ни одной ссылки на `fonts.googleapis.com` / `fonts.gstatic.com`
 *   где бы то ни было в CSS-тексте;
 * - все `url(...)` в `@font-face` — относительные локальные пути,
 *   ни один не начинается с `http`.
 *
 * Поставленный `docs/spec/DESIGN/design-system/tokens/fonts.css`
 * нарушает это дословно (`@import url("https://fonts.googleapis.com/...")`)
 * — этот тест проверяет, что наш `src/tokens/fonts.css` этого не
 * повторяет.
 */

const bundledCss = readBundledCss();
const fontsCss = readTokenFile('fonts.css');

describe('нет сетевых зависимостей в CSS токенов', () => {
  it('в собранном CSS нет @import с http(s) URL', () => {
    const networkImportRe = /@import\s+(?:url\(\s*)?['"]?https?:\/\//i;
    expect(networkImportRe.test(bundledCss)).toBe(false);
  });

  it('нигде нет ссылки на fonts.googleapis.com', () => {
    expect(bundledCss).not.toContain('fonts.googleapis.com');
  });

  it('нигде нет ссылки на fonts.gstatic.com', () => {
    expect(bundledCss).not.toContain('fonts.gstatic.com');
  });

  it('ни один @font-face url() не указывает на внешний адрес', () => {
    const urls = extractUrls(fontsCss);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith('http://') || url.startsWith('https://'), url).toBe(false);
      expect(url.startsWith('//'), url).toBe(false);
    }
  });

  it('все @font-face url() указывают на локальные .woff2 внутри пакета', () => {
    const urls = extractUrls(fontsCss);
    for (const url of urls) {
      expect(url.endsWith('.woff2'), url).toBe(true);
      expect(url.startsWith('../fonts/'), url).toBe(true);
    }
  });
});
