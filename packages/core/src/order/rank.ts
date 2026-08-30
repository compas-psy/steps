import type { Rank } from '../values.js';

import { digitChar, digitValue, MAX_DIGIT, MID_DIGIT, MIN_DIGIT } from './internal/alphabet.js';

/**
 * Fractional rank (`02§5`, решение `?2`): строка над base62, задающая
 * порядок обычным лексикографическим сравнением строк (JS `<`) — отдельная
 * функция сравнения не нужна (см. `internal/alphabet.ts`).
 *
 * Инвариант, на котором держится весь алгоритм ниже: **ни один валидный
 * ранг не заканчивается минимальной цифрой алфавита `'0'`**. Без него для
 * пары рангов `A` и `A+"0"` не нашлось бы вообще никакого ранга между ними:
 * цифры меньше `'0'` не существует, а более короткая строка не может быть
 * меньше более длинной с тем же префиксом — только больше (правило общего
 * префикса: `A < A+"0"` уже само по себе истинно для ЛЮБОГО символа после
 * `A`, включая `'0'`). Инвариант гарантирует, что перед первым различающимся
 * разрядом верхней границы всегда остаётся запас минимум в одну цифру.
 * Каждая функция ниже, что производит новый ранг, соблюдает инвариант сама
 * по себе — он проверен экспериментально в property-тестах на тысячах
 * последовательностей вставок (`test/order/rank.property.test.ts`), не
 * только логическим выводом здесь.
 */

function isValidRankString(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  for (const char of value) {
    if (digitValue(char) === -1) {
      return false;
    }
  }
  return digitValue(value[value.length - 1] as string) !== MIN_DIGIT;
}

/** Формат и инвариант ранга — для валидации на границе (например, ранг из
 * входящего sync-патча, ещё не проверенный этим пакетом). */
export function isRank(value: string): value is Rank {
  return isValidRankString(value);
}

function assertRank(value: string, context: string): asserts value is Rank {
  if (!isValidRankString(value)) {
    throw new RangeError(`${context}: некорректный rank ${JSON.stringify(value)}`);
  }
}

/**
 * "Преемник" — кратчайшая строка строго больше `x`, без верхней границы.
 * Увеличивает последнюю цифру на месте, пока это возможно: до ~60 вызовов
 * подряд на одной и той же позиции без роста длины строки. Растёт на один
 * разряд, только когда последняя цифра уже максимальна.
 *
 * Осознанный компромисс: при МНОГОКРАТНОЙ последовательной вставке в один
 * и тот же край (всегда в конец списка / всегда в начало) рост длины ранга
 * линеен от числа вставок (~1 символ на каждые ~60 вставок), а не
 * логарифмичен — это свойство унаследовано от самой схемы LexoRank-подобных
 * рангов (решение `?2`), а не баг: именно для этого случая ТЗ (`02§5`) и
 * предусматривает пороговую ренормализацию (`./renormalize.ts`), а не
 * требует держать рост константным вечно. Экспериментально: ~3800
 * последовательных вставок в конец или ~2000 в начало до достижения порога
 * в 64 символа — см. `test/order/rank.property.test.ts`.
 */
function afterTail(x: string): string {
  if (x === '') {
    return digitChar(MID_DIGIT);
  }
  const lastIndex = x.length - 1;
  const lastDigit = digitValue(x[lastIndex] as string);
  if (lastDigit < MAX_DIGIT) {
    return x.slice(0, lastIndex) + digitChar(lastDigit + 1);
  }
  // Новый разряд стартует с 1, а не с 0: 0 нельзя оставить финальной цифрой
  // (инвариант), а старт с 1 даёт ему все 60 последующих инкрементов вместо
  // меньшего запаса, если бы разряд стартовал с середины алфавита.
  return x + digitChar(1);
}

/**
 * "Предшественник" — кратчайшая строка строго меньше `x`, без нижней
 * границы. Рекурсивный разбор слева направо: если текущая цифра `x` не
 * минимальна, можно поставить цифру меньше и остановиться на этом разряде;
 * если цифра уже `'0'`, меньше неё на этой позиции ничего нет — приходится
 * повторить `'0'` и рекурсивно искать меньшее значение в оставшихся
 * разрядах `x`. Рекурсия ограничена длиной `x` и не выходит за пределы
 * фактических цифр входной строки — переполнение стека не грозит при любой
 * длине рангов, встречающихся в этом пакете (порог ренормализации — 64).
 */
function beforeTail(x: string): string {
  const firstDigit = digitValue(x[0] as string);
  if (firstDigit >= 2) {
    return digitChar(firstDigit - 1);
  }
  if (firstDigit === 1) {
    // Единственная цифра меньше 1 — это 0, но заканчивать на ней нельзя
    // (инвариант): добавляем ещё одну ненулевую цифру после неё.
    return digitChar(MIN_DIGIT) + digitChar(MID_DIGIT);
  }
  // firstDigit === MIN_DIGIT: меньше нуля на этой позиции ничего нет —
  // сохраняем '0' и рекурсивно ищем меньшее значение глубже в x.
  if (x.length === 1) {
    // x === "0" целиком — валидный ранг сюда попасть не может (инвариант
    // запрещает оканчиваться на минимальную цифру, а x длины 1 с цифрой 0
    // как раз ей и оканчивается). Не должно быть достижимо из rankBefore
    // (там вход провалидирован assertRank) — явный throw вместо тихого
    // некорректного результата.
    throw new RangeError(
      `beforeTail: "${x}" нарушает инвариант rank (оканчивается на минимальную цифру)`,
    );
  }
  return digitChar(MIN_DIGIT) + beforeTail(x.slice(1));
}

/**
 * Общий между двумя реальными границами `lower < upper` (обе — хвосты после
 * снятия общего префикса, `upper` всегда непусто — иначе `lower` не был бы
 * меньше `upper`). Если между первыми различающимися цифрами есть зазор
 * ≥2 — просто берётся цифра посередине (без роста длины на этом шаге).
 * Если зазор ровно 1 (цифры соседние, "нет места в одном разряде") —
 * приходится спуститься на разряд глубже вдоль той границы, у которой есть
 * что раскрыть дальше.
 */
function betweenTail(lowerTail: string, upperTail: string): string {
  const lowerDigit = lowerTail.length > 0 ? digitValue(lowerTail[0] as string) : -1; // -1 = "ничего", меньше любой реальной цифры
  const upperDigit = digitValue(upperTail[0] as string);
  const gap = upperDigit - lowerDigit;

  if (gap >= 2) {
    const mid = lowerDigit + Math.floor(gap / 2);
    if (mid === MIN_DIGIT) {
      // Середина случайно попала на 0 — не может быть финальной цифрой
      // (инвариант): ставим 0 и добиваем ненулевой цифрой без верхней
      // границы (0 < upperDigit уже гарантирует c < upper независимо от
      // хвоста).
      return digitChar(MIN_DIGIT) + afterTail('');
    }
    return digitChar(mid);
  }

  // gap === 1: соседние цифры, самостоятельного разряда между ними нет.
  if (lowerDigit !== -1) {
    // У lower есть цифра здесь — повторяем её и ищем что-то строго больше
    // остатка lower (без верхней границы: цифра уже меньше upperDigit,
    // так что любое продолжение сохраняет c < upper).
    return digitChar(lowerDigit) + afterTail(lowerTail.slice(1));
  }
  // lowerDigit === -1 при gap === 1 означает upperDigit === 0: повторяем
  // цифру upper и ищем что-то строго меньше его остатка (без нижней
  // границы).
  return digitChar(upperDigit) + beforeTail(upperTail.slice(1));
}

function between(lower: string, upper: string): string {
  let commonPrefixLength = 0;
  while (
    commonPrefixLength < lower.length &&
    commonPrefixLength < upper.length &&
    lower[commonPrefixLength] === upper[commonPrefixLength]
  ) {
    commonPrefixLength++;
  }
  const prefix = upper.slice(0, commonPrefixLength);
  return prefix + betweenTail(lower.slice(commonPrefixLength), upper.slice(commonPrefixLength));
}

/** Начальный ранг для пустого списка. */
export function initialRank(): Rank {
  return afterTail('') as Rank;
}

/** Ранг, сортирующийся сразу после `last` (вставка в конец списка). */
export function rankAfter(last: Rank): Rank {
  assertRank(last, 'rankAfter');
  return afterTail(last) as Rank;
}

/** Ранг, сортирующийся сразу перед `first` (вставка в начало списка). */
export function rankBefore(first: Rank): Rank {
  assertRank(first, 'rankBefore');
  return beforeTail(first) as Rank;
}

/** Ранг строго между соседями `a < b`. */
export function rankBetween(a: Rank, b: Rank): Rank {
  assertRank(a, 'rankBetween');
  assertRank(b, 'rankBetween');
  if (!(a < b)) {
    throw new RangeError(
      `rankBetween: ожидался a < b, получено a=${JSON.stringify(a)}, b=${JSON.stringify(b)}`,
    );
  }
  return between(a, b) as Rank;
}
