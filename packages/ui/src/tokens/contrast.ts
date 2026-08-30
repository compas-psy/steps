/**
 * Расчёт коэффициента контрастности WCAG 2.2 (относительная яркость по
 * формуле из спецификации WCAG, без сторонних библиотек — задание пакета
 * работ явно просит посчитать самостоятельно, «если библиотека тянет
 * лишнее»).
 *
 * Используется `test/tokens/contrast.test.ts` для проверки пар
 * «текст на фоне» на AA (SPEC §15 «Accessibility» — блокирующий релиз
 * гейт, не пожелание).
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX_COLOR_RE = /^#?([0-9a-fA-F]{6})$/;

/** Парсит 6-значный hex-цвет (с `#` или без) в компоненты 0..255. */
export function hexToRgb(hex: string): Rgb {
  const match = HEX_COLOR_RE.exec(hex.trim());
  if (!match) {
    throw new Error(`Not a 6-digit hex color: ${hex}`);
  }
  const digits = match[1] as string;
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  };
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

/** Относительная яркость (WCAG), 0..1. */
export function relativeLuminance(color: Rgb): number {
  const r = channelToLinear(color.r);
  const g = channelToLinear(color.g);
  const b = channelToLinear(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Коэффициент контрастности WCAG между двумя цветами, 1..21. */
export function contrastRatio(colorA: string, colorB: string): number {
  const lumA = relativeLuminance(hexToRgb(colorA));
  const lumB = relativeLuminance(hexToRgb(colorB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Порог AA для обычного текста (< 18pt / < 14pt bold). */
export const WCAG_AA_NORMAL_TEXT = 4.5;

/** Порог AA для крупного текста (>= 18pt, или >= 14pt bold). */
export const WCAG_AA_LARGE_TEXT = 3.0;
