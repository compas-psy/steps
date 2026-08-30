import type { Rank } from '../values.js';

import { digitChar, MID_DIGIT, RANK_BASE } from './internal/alphabet.js';
import { isRank } from './rank.js';

/**
 * Порог длины ранга, при достижении которого нужна ренормализация (решение
 * `?2`: 64 символа). Сама транзакция и её место в потоке (перенос из
 * очереди в план на "перетаскивание", batch sync) — забота эпика E02;
 * здесь только чистая проверка порога и чистая функция генерации нового
 * набора рангов (`02§5`: "Renormalize only when rank length threshold
 * exceeded, transactionally, with batch sync. Do not update every sibling
 * on each drag").
 */
export const RANK_RENORMALIZE_THRESHOLD_LENGTH = 64;

/** Требует ли этот конкретный ранг ренормализации всего списка. */
export function needsRenormalization(rank: Rank): boolean {
  return rank.length >= RANK_RENORMALIZE_THRESHOLD_LENGTH;
}

/** Требует ли ренормализации хотя бы один ранг в списке. */
export function anyNeedsRenormalization(ranks: readonly Rank[]): boolean {
  return ranks.some((rank) => needsRenormalization(rank));
}

/**
 * Пересчитывает ранги всего упорядоченного списка заново — не "чинит"
 * старые строки, а раздаёт свежие короткие, равномерно распределённые по
 * пространству base62, сохраняя тот же относительный порядок и ту же длину
 * списка. Старые значения рангов не используются (кроме их числа и
 * порядка) — вызывающий передаёт список именно в желаемом итоговом порядке.
 *
 * Не построена через цепочку `rankAfter` (соседняя вставка за вставкой):
 * `rankAfter`, вызванный по цепочке, растёт с той же линейной скоростью,
 * что и обычные последовательные вставки в конец списка (см. `rank.ts`) —
 * для списка в тысячи элементов результат сам почти сразу упёрся бы в
 * порог, а ренормализация обязана эту проблему решать, а не воспроизводить.
 * Вместо этого позиция `i` кодируется напрямую как N-значное число base62,
 * равномерно распределённое по `[1, base^L)` — это даёт логарифмический (не
 * линейный) рост длины от количества элементов: 10 000 элементов после
 * ренормализации умещаются в 4 символа + фиксированный неноль-разряд
 * (см. `test/order/renormalize.test.ts`).
 */
export function renormalizeRanks(orderedRanks: readonly Rank[]): Rank[] {
  assertSortedRanks(orderedRanks);
  return generateEvenlySpread(orderedRanks.length);
}

function assertSortedRanks(ranks: readonly Rank[]): void {
  for (let i = 0; i < ranks.length; i++) {
    const rank = ranks[i] as Rank;
    if (!isRank(rank)) {
      throw new RangeError(
        `renormalizeRanks: элемент ${i} — некорректный rank ${JSON.stringify(rank)}`,
      );
    }
    if (i > 0 && !((ranks[i - 1] as Rank) < rank)) {
      throw new RangeError(
        `renormalizeRanks: список обязан быть строго упорядочен по возрастанию — нарушение на позиции ${i}`,
      );
    }
  }
}

function generateEvenlySpread(count: number): Rank[] {
  if (count === 0) {
    return [];
  }
  if (count === 1) {
    return [digitChar(MID_DIGIT) as Rank];
  }

  const base = BigInt(RANK_BASE);
  // Минимальная длина L такая, что base^L >= 2*(count+1) — двукратный запас
  // гарантирует, что округление вниз при равномерном распределении не даёт
  // двух совпадающих соседних значений.
  let length = 1n;
  const target = BigInt(2 * (count + 1));
  while (base ** length < target) {
    length++;
  }
  const space = base ** length;
  const denominator = BigInt(count + 1);

  const result: Rank[] = [];
  for (let i = 0; i < count; i++) {
    const value = (BigInt(i + 1) * space) / denominator;
    // Фиксированный ненулевой разряд в конце — гарантирует инвариант "не
    // оканчивается на минимальную цифру" для всех элементов сразу, не
    // требуя проверки конкретного значения каждого закодированного числа:
    // относительный порядок уже полностью определён первыми L цифрами
    // (они строго возрастают), одинаковый хвост его не меняет.
    result.push((encodeFixedLength(value, length) + digitChar(MID_DIGIT)) as Rank);
  }
  return result;
}

function encodeFixedLength(value: bigint, length: bigint): string {
  const base = BigInt(RANK_BASE);
  let out = '';
  let remaining = value;
  for (let i = 0n; i < length; i++) {
    out = digitChar(Number(remaining % base)) + out;
    remaining /= base;
  }
  return out;
}
