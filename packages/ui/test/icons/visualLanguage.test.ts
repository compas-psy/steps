import { describe, expect, it } from 'vitest';

import {
  ICON_STROKE_LINECAP,
  ICON_STROKE_LINEJOIN,
  ICON_STROKE_WIDTH,
  ICON_VIEW_BOX,
} from '../../src/icons/constants.js';
import { ICON_NAMES } from '../../src/icons/contours.js';
import { renderIconMarkup } from '../../src/icons/render.js';

/**
 * `04_UI_DESIGN_SYSTEM.md` §12: одна line-family — 24 viewBox, 1.75
 * stroke, `currentColor`, круглые concaps/joins, без заливки. Это не
 * пожелание, а гейт: сырой hex в `packages/ui` роняет линт-адгезию
 * (`.oxlintrc.json`), и эти тесты проверяют то же самое на уровне
 * итогового SVG-markup — по каждой иконке реестра, а не выборочно.
 */
describe('визуальный язык набора — константы', () => {
  it('viewBox ровно "0 0 24 24"', () => {
    expect(ICON_VIEW_BOX).toBe('0 0 24 24');
  });

  it('толщина обводки ровно 1.75', () => {
    expect(ICON_STROKE_WIDTH).toBe(1.75);
  });

  it('концы и соединения — round', () => {
    expect(ICON_STROKE_LINECAP).toBe('round');
    expect(ICON_STROKE_LINEJOIN).toBe('round');
  });
});

describe.each(ICON_NAMES)('иконка "%s" — рендер соответствует языку', (name) => {
  const markup = renderIconMarkup(name);

  it('viewBox="0 0 24 24"', () => {
    expect(markup).toContain('viewBox="0 0 24 24"');
  });

  it('stroke-width="1.75"', () => {
    expect(markup).toContain('stroke-width="1.75"');
  });

  it('stroke="currentColor" — ни одного зашитого цвета', () => {
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(markup).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/i);
  });

  it('stroke-linecap="round" и stroke-linejoin="round"', () => {
    expect(markup).toContain('stroke-linecap="round"');
    expect(markup).toContain('stroke-linejoin="round"');
  });

  it('линейное семейство — заливка есть только один раз, на корневом fill="none"', () => {
    const fillOccurrences = markup.match(/\bfill="/g) ?? [];
    expect(fillOccurrences.length).toBe(1);
    expect(markup).toContain('fill="none"');
  });

  it('ровно один корневой <svg>, контур внутри него', () => {
    expect(markup.match(/<svg /g)?.length).toBe(1);
    expect(markup.startsWith('<svg ')).toBe(true);
    expect(markup.endsWith('</svg>')).toBe(true);
  });
});
