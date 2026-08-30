import { describe, expect, it } from 'vitest';

import { contrastRatio, WCAG_AA_NORMAL_TEXT } from '../../src/tokens/contrast.js';
import { extractBlockAfter, parseDeclarations, readTokenFile, resolveValue } from './cssHelpers.js';

/**
 * Контраст WCAG 2.2 AA для основных пар «текст на фоне» (SPEC §15 —
 * блокирующий релиз гейт, не пожелание). Коэффициент считается сам,
 * без внешней библиотеки (`src/tokens/contrast.ts`), формула — WCAG
 * relative luminance.
 *
 * Область теста — семантические ролевые пары «поверхность / текст на
 * ней» (background/foreground, card/card-foreground, ...), это и есть
 * SPEC §4's полный список тематизируемых ролей. Статусные soft/500-пары
 * (blue/violet/orange/red/success/amber) сюда намеренно НЕ включены:
 * по SPEC §4.1 "State meaning is never color-only" эти цвета в продукте
 * используются как акцент дота/иконки/бордера чипа, а не как цвет текста
 * абзаца — сам текст статуса рендерится обычным foreground/muted-foreground
 * (уже покрыт ниже). Замер контраста «500 текст на soft фоне» посчитан
 * при проектировании токенов и зафиксирован в отчёте пакета работ
 * отдельно от блокирующего AA-гейта, т.к. не является WCAG-текстовой
 * парой в её точном смысле.
 */

const colorsCss = readTokenFile('colors.css');
const lightDict = parseDeclarations(extractBlockAfter(colorsCss, ':root {'));
const darkOverrides = parseDeclarations(extractBlockAfter(colorsCss, ":root[data-theme='dark']"));
const darkDict: Record<string, string> = { ...lightDict, ...darkOverrides };

function resolvedContrast(
  dict: Readonly<Record<string, string>>,
  bgName: string,
  fgName: string,
): number {
  const bgRaw = dict[bgName];
  const fgRaw = dict[fgName];
  if (bgRaw === undefined || fgRaw === undefined) {
    throw new Error(`Missing token: ${bgName} or ${fgName}`);
  }
  const bgHex = resolveValue(bgRaw, dict);
  const fgHex = resolveValue(fgRaw, dict);
  return contrastRatio(bgHex, fgHex);
}

const PAIRS = [
  ['background', 'foreground'],
  ['card', 'card-foreground'],
  ['popover', 'popover-foreground'],
  ['muted', 'muted-foreground'],
  ['secondary', 'secondary-foreground'],
  ['accent', 'accent-foreground'],
  ['destructive', 'destructive-foreground'],
] as const;

describe('контраст AA — light', () => {
  it.each(PAIRS)('%s / %s >= 4.5:1', (bg, fg) => {
    expect(resolvedContrast(lightDict, bg, fg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});

describe('контраст AA — dark', () => {
  // primary/primary-foreground проверяется отдельно ниже в отдельном describe-блоке.
  it.each(PAIRS)('%s / %s >= 4.5:1', (bg, fg) => {
    expect(resolvedContrast(darkDict, bg, fg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});

describe('контраст AA — sidebar (инвариантен к теме)', () => {
  it('sidebar / sidebar-foreground >= 4.5:1', () => {
    expect(resolvedContrast(lightDict, 'sidebar', 'sidebar-foreground')).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT,
    );
  });
});

describe('контраст AA — primary/primary-foreground', () => {
  it('light: primary / primary-foreground >= 4.5:1', () => {
    expect(resolvedContrast(lightDict, 'primary', 'primary-foreground')).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT,
    );
  });

  /**
   * `--primary-foreground` в тёмной теме было отклонение от SPEC §4
   * (WCAG AA разрыв: 4.33:1 вместо 4.5:1), исправлено решением
   * владельца продукта (см. ADR-0002): затемнение текста с #0E1E16
   * на #0A1610, сохраняя фирменный зелёный фон #3B8F5A нетронутым.
   * Коэффициент контрастности теперь >= 4.5:1 и соответствует AA.
   */
  it('dark: primary / primary-foreground >= 4.5:1', () => {
    expect(resolvedContrast(darkDict, 'primary', 'primary-foreground')).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT,
    );
  });
});
