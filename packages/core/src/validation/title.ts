/**
 * Нормализация и читаемость заголовка задачи (§2 п.14, `01§1`, решение
 * `?10`). Вынесено из `task.ts` отдельным модулем — эта логика не зависит от
 * остальной формы `Task` и полезна сама по себе (например, будущему UI для
 * live-подсказки до сохранения, как и предикаты `temporal/predicates.ts`).
 */

/** Любой прогон CR/LF/TAB схлопывается в один обычный пробел (§2 п.14) —
 * именно прогон, а не каждый символ по отдельности, иначе "a\n\n\tb"
 * превратился бы в "a   b" с тремя пробелами вместо одного. */
const CONTROL_WHITESPACE_RUN = /[\r\n\t]+/g;

export function normalizeTitleWhitespace(raw: string): string {
  return raw.replace(CONTROL_WHITESPACE_RUN, ' ').trim();
}

/** Длина в Unicode-символах (кодовых точках), а не в UTF-16 code units —
 * `"🎉".length === 2` в JS (суррогатная пара), но это один символ (§2 п.14:
 * "1..500 Unicode chars"). Итерация строки через `for..of`/spread идёт по
 * кодовым точкам. */
export function unicodeLength(value: string): number {
  return [...value].length;
}

/**
 * Только пробелы (`\p{White_Space}`) и пунктуация (`\p{P}`) — сигнал того,
 * что после отбрасывания принятых NLP service-токенов не осталось
 * человекочитаемого текста (решение `?10`: "если после их удаления не
 * осталось ни одного символа кроме пробелов и пунктуации — сохранение
 * блокируется"). Символы (эмодзи, математические знаки — Unicode-категория
 * `S`) сюда намеренно не входят: решение владельца называет буквально
 * "пробелы и пунктуацию", не "всё нетекстовое".
 */
const ONLY_WHITESPACE_AND_PUNCTUATION = /^[\s\p{P}]*$/u;

export function hasReadableContent(title: string): boolean {
  return !ONLY_WHITESPACE_AND_PUNCTUATION.test(title);
}
