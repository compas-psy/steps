/**
 * Числовые брейкпоинты (SPEC/04_UI_DESIGN_SYSTEM.md §8 «Responsive»:
 * mobile <600, tablet 600–1023, desktop >=1024).
 *
 * CSS custom properties (`tokens/breakpoints.css`) не резолвятся внутри
 * `@media (min-width: …)`, поэтому рантайм-код (`matchMedia`,
 * серверный/тестовый расчёт брейкпоинта) читает эти числа напрямую.
 * Значения обязаны совпадать с `tokens/breakpoints.css` —
 * `test/tokens/breakpoints-consistency.test.ts` парсит CSS-файл и
 * сверяет числа с этим модулем, чтобы источники не разошлись.
 *
 * Числа здесь — не строки с `px`, поэтому они не задевают
 * `no-restricted-syntax`-правило адгезии против сырого px в литералах
 * (правило матчит `Literal[value=/\d+px/]`, юнит-less number им не
 * ловится) — то же самое разделение «объявление в CSS / использование в
 * TS», что и в `registry.ts`, просто здесь TS-сторона легальна, потому
 * что несёт число, а не CSS-строку с юнитом.
 */

export const BREAKPOINTS = {
  tabletMin: 600,
  desktopMin: 1024,
} as const satisfies Record<string, number>;

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

/** Определяет именованный брейкпоинт по ширине вьюпорта в логических px. */
export function breakpointForWidth(width: number): Breakpoint {
  if (width >= BREAKPOINTS.desktopMin) return 'desktop';
  if (width >= BREAKPOINTS.tabletMin) return 'tablet';
  return 'mobile';
}
