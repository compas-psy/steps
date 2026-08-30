import { describe, expect, it } from 'vitest';

import { BREAKPOINTS, breakpointForWidth } from '../../src/tokens/breakpoints.js';
import { extractBlockAfter, parseDeclarations, readTokenFile } from './cssHelpers.js';

/**
 * Брейкпоинты (SPEC §8): mobile <600, tablet 600–1023, desktop >=1024.
 * CSS custom properties не резолвятся в `@media`, поэтому существует
 * параллельный числовой источник (`src/tokens/breakpoints.ts`) — этот
 * тест не даёт двум источникам разойтись, паря значение из CSS-текста
 * строкой (без хардкода px-числа тут же) и сравнивая с TS-константой.
 */

const breakpointsCss = readTokenFile('breakpoints.css');
const decls = parseDeclarations(extractBlockAfter(breakpointsCss, ':root {'));

function parsePxValue(value: string): number {
  expect(value.endsWith('px'), value).toBe(true);
  return Number.parseFloat(value.slice(0, -2));
}

describe('брейкпоинты: CSS и TS согласованы', () => {
  it('--breakpoint-tablet-min (CSS) равен BREAKPOINTS.tabletMin (TS)', () => {
    expect(parsePxValue(decls['breakpoint-tablet-min'] as string)).toBe(BREAKPOINTS.tabletMin);
  });

  it('--breakpoint-desktop-min (CSS) равен BREAKPOINTS.desktopMin (TS)', () => {
    expect(parsePxValue(decls['breakpoint-desktop-min'] as string)).toBe(BREAKPOINTS.desktopMin);
  });

  it('mobile < tablet < desktop', () => {
    expect(BREAKPOINTS.tabletMin).toBeLessThan(BREAKPOINTS.desktopMin);
  });

  it.each([
    [320, 'mobile'],
    [599, 'mobile'],
    [600, 'tablet'],
    [1023, 'tablet'],
    [1024, 'desktop'],
    [1920, 'desktop'],
  ] as const)('breakpointForWidth(%i) === %s', (width, expected) => {
    expect(breakpointForWidth(width)).toBe(expected);
  });
});
