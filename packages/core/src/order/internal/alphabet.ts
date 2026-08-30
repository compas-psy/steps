/**
 * Алфавит base62 для fractional rank (решение `?2`): цифры → заглавные →
 * строчные буквы. Порядок символов алфавита совпадает с их порядком в
 * ASCII (`'0'..'9' < 'A'..'Z' < 'a'..'z'`), поэтому обычное посимвольное
 * сравнение строк (JS `<`) для двух рангов уже даёт нужный порядок "по
 * значению цифры" — отдельный компаратор не нужен, и на этом совпадении
 * держится вся арифметика в `../rank.ts`.
 */
export const RANK_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const RANK_BASE = RANK_ALPHABET.length; // 62
export const MIN_DIGIT = 0;
export const MAX_DIGIT = RANK_BASE - 1; // 61
export const MID_DIGIT = Math.floor(RANK_BASE / 2); // 31

/** Значение цифры символа алфавита; `-1`, если символ не входит в алфавит. */
export function digitValue(char: string): number {
  return RANK_ALPHABET.indexOf(char);
}

/** Символ алфавита по значению цифры `0..61`. */
export function digitChar(value: number): string {
  const char = RANK_ALPHABET[value];
  if (char === undefined) {
    throw new RangeError(`digit value вне диапазона 0..${MAX_DIGIT}: ${value}`);
  }
  return char;
}
