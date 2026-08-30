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
  // primary/primary-foreground разбирается отдельно ниже — это единственная
  // пара с известным, не устранимым в этом пакете работ разрывом AA.
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

describe('контраст AA — primary/primary-foreground (light проходит, dark — нет)', () => {
  it('light: primary / primary-foreground >= 4.5:1', () => {
    expect(resolvedContrast(lightDict, 'primary', 'primary-foreground')).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT,
    );
  });

  /**
   * ИЗВЕСТНЫЙ, НЕ ИСПРАВЛЯЕМЫЙ разрыв AA — задокументирован по прямому
   * указанию задания пакета работ («не подгоняй порог: зафиксируй факт,
   * тест оставь падающим или помеченным»).
   *
   * `--primary:#3B8F5A` и `--primary-foreground:#0E1E16` в тёмной теме —
   * оба значения зафиксированы дословно в SPEC §4 «Dark theme exact
   * baseline» и не подлежат изменению в этом пакете работ (замороженный
   * контракт, `docs/spec/` не редактируется, а изобретать новый hex для
   * этой роли значило бы нарушить §4 побайтово).
   *
   * Фактический коэффициент — 4.33:1, нужно 4.5:1 для обычного текста
   * (не хватает 0.17). Для крупного/жирного текста (>=19px bold или
   * >=24px normal) порог AA-large — 3:1, и 4.33 его комфортно проходит:
   * если эта роль используется только для лейблов крупных/жирных кнопок,
   * разрыв не блокирует конкретные экраны — но как токен общего
   * назначения "primary/primary-foreground" не гарантирует AA для
   * произвольного текста нормального размера в тёмной теме.
   *
   * `it.fails` держит сьют зелёным, документируя это как ОЖИДАЕМЫЙ
   * результат: если контраст этой пары когда-нибудь случайно поднимется
   * выше 4.5 (например, при пересчёте палитры в будущем пакете работ),
   * тест сам укажет на расхождение и потребует пересмотра.
   */
  it.fails(
    'dark: primary / primary-foreground НЕ достигает 4.5:1 (факт: ~4.33:1, заморожено §4)',
    () => {
      expect(resolvedContrast(darkDict, 'primary', 'primary-foreground')).toBeGreaterThanOrEqual(
        WCAG_AA_NORMAL_TEXT,
      );
    },
  );

  it('dark: primary / primary-foreground проходит хотя бы AA-large (3:1)', () => {
    expect(resolvedContrast(darkDict, 'primary', 'primary-foreground')).toBeGreaterThanOrEqual(3);
  });
});
