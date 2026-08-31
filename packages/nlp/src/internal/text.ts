/**
 * Шаги 1-2 конвейера (`01§4`): Unicode NFKC-нормализация и защита
 * quoted-фрагментов от разбора как служебных токенов. Чисто текстовые
 * утилиты без знания о категориях грамматики — используются всеми
 * матчерами одинаково.
 */

export function normalizeNfkc(raw: string): string {
  return raw.normalize('NFKC');
}

/** Диапазон внутри нормализованного текста, накрытый парой кавычек
 * (включая сами символы кавычек) — то, что внутри, никогда не парсится как
 * служебный токен (`01§4` шаг 2). */
export interface ProtectedRange {
  readonly start: number;
  readonly end: number;
}

/**
 * Находит закрытые пары `«...»` и `"..."`. Незакрытая кавычка (нет парной
 * закрывающей до конца строки) не защищает ничего дальше — остаток текста
 * разбирается как обычно, а не блокируется целиком одним случайным
 * символом кавычки.
 */
export function findProtectedRanges(text: string): readonly ProtectedRange[] {
  const ranges: ProtectedRange[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '«') {
      const close = text.indexOf('»', i + 1);
      if (close === -1) {
        i += 1;
        continue;
      }
      ranges.push({ start: i, end: close + 1 });
      i = close + 1;
      continue;
    }
    if (ch === '"') {
      const close = text.indexOf('"', i + 1);
      if (close === -1) {
        i += 1;
        continue;
      }
      ranges.push({ start: i, end: close + 1 });
      i = close + 1;
      continue;
    }
    i += 1;
  }
  return ranges;
}

export function isPositionProtected(pos: number, ranges: readonly ProtectedRange[]): boolean {
  return ranges.some((r) => pos >= r.start && pos < r.end);
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function overlapsAnyProtectedRange(
  start: number,
  end: number,
  ranges: readonly ProtectedRange[],
): boolean {
  return ranges.some((r) => rangesOverlap(start, end, r.start, r.end));
}

/** Символ, из которых состоят "слова" для целей проверки границы — буквы
 * (`\p{L}`, покрывает кириллицу и латиницу без хардкода алфавита), цифры и
 * подчёркивание. Обычный `\b` в JS не годится: он определён через ASCII
 * `\w` и не видит границу вокруг кириллических слов. */
export function isWordChar(ch: string | undefined): boolean {
  if (ch === undefined) {
    return false;
  }
  return /[\p{L}\p{N}_]/u.test(ch);
}

/** Фрагмент regex-паттерна: слева/справа от служебного слова не должно
 * быть другого "буквенного" символа — иначе "послезавтра" ложно засветит
 * "завтра" как отдельное совпадение, а "поставив" — предлог "в". Требует
 * флагов `u` (обязателен для `\p{...}`) и `y` (для точечного anchored-
 * матчинга в `matchAt`). */
export const WORD_BOUNDARY_BEFORE = String.raw`(?<![\p{L}\p{N}_])`;
export const WORD_BOUNDARY_AFTER = String.raw`(?![\p{L}\p{N}_])`;

export function skipSpaces(text: string, pos: number): number {
  let i = pos;
  while (i < text.length && /\s/.test(text[i] as string)) {
    i += 1;
  }
  return i;
}
