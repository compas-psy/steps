import { describe, expect, it } from 'vitest';

import { initialRank, isRank, rankAfter, rankBefore, rankBetween } from '../../src/order/rank.js';
import type { Rank } from '../../src/values.js';

/**
 * Генеративные тесты рангов — решение `?21`: "комбинаторику вставок руками
 * не перечислить", библиотека не нужна, достаточно детерминированного ГПСЧ
 * с фиксированным зерном (воспроизводимость падения). `mulberry32` — малый,
 * быстрый, известный алгоритм; зерно фиксировано в каждом вызове ниже, так
 * что при падении конкретная последовательность операций воспроизводима
 * один в один по номеру seed, напечатанному в сообщении об ошибке.
 */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Scenario = 'random' | 'always-first' | 'always-last' | 'always-second';

interface SequenceResult {
  readonly maxRankLength: number;
  readonly finalListLength: number;
}

/**
 * Прогоняет одну случайную последовательность вставок в изначально пустой
 * список и на каждом шаге проверяет: (1) вставленное значение — валидный
 * ранг (формат + инвариант); (2) список остаётся строго возрастающим по
 * обычному сравнению строк `<` после каждой вставки — то самое свойство
 * `a < c < b`, которое нужно доказать, а не заявить.
 */
function runSequence(seed: number, opsCount: number, scenario: Scenario): SequenceResult {
  const rng = mulberry32(seed);
  const list: Rank[] = [];
  let maxRankLength = 0;

  for (let op = 0; op < opsCount; op++) {
    let inserted: Rank;
    let insertAt: number;

    if (list.length === 0) {
      inserted = initialRank();
      insertAt = 0;
    } else if (scenario === 'always-first') {
      inserted = rankBefore(list[0]!);
      insertAt = 0;
    } else if (scenario === 'always-last') {
      inserted = rankAfter(list[list.length - 1]!);
      insertAt = list.length;
    } else if (scenario === 'always-second') {
      // Классический "плохой" случай: каждый раз вставляем сразу после
      // первого элемента — интервал между первым и его текущим соседом
      // сжимается на каждой вставке.
      if (list.length === 1) {
        inserted = rankAfter(list[0]!);
        insertAt = 1;
      } else {
        inserted = rankBetween(list[0]!, list[1]!);
        insertAt = 1;
      }
    } else {
      const position = Math.floor(rng() * (list.length + 1));
      if (position === 0) {
        inserted = rankBefore(list[0]!);
      } else if (position === list.length) {
        inserted = rankAfter(list[list.length - 1]!);
      } else {
        inserted = rankBetween(list[position - 1]!, list[position]!);
      }
      insertAt = position;
    }

    if (!isRank(inserted)) {
      throw new Error(
        `seed=${seed} scenario=${scenario} op=${op}: сгенерированное значение не проходит isRank: ${JSON.stringify(inserted)}`,
      );
    }
    list.splice(insertAt, 0, inserted);
    maxRankLength = Math.max(maxRankLength, inserted.length);

    for (let i = 1; i < list.length; i++) {
      if (!(list[i - 1]! < list[i]!)) {
        throw new Error(
          `seed=${seed} scenario=${scenario} op=${op}: нарушение порядка на позиции ${i}: ` +
            `${JSON.stringify(list[i - 1])} >= ${JSON.stringify(list[i])}`,
        );
      }
    }
  }

  return { maxRankLength, finalListLength: list.length };
}

const SEQUENCES_PER_SCENARIO = 2000;
const OPS_PER_SEQUENCE = 300;
const SEED_BASE = 7919; // произвольное простое число, только чтобы разнести seed'ы по сценариям
const SCENARIOS: readonly Scenario[] = ['random', 'always-first', 'always-last', 'always-second'];

describe('rank — генеративные тесты (решение ?21)', () => {
  it.each(SCENARIOS)(
    `%s: ${SEQUENCES_PER_SCENARIO} последовательностей × ${OPS_PER_SEQUENCE} вставок сохраняют строгий порядок`,
    (scenario) => {
      let globalMaxRankLength = 0;

      for (let seedIndex = 1; seedIndex <= SEQUENCES_PER_SCENARIO; seedIndex++) {
        const seed = seedIndex * SEED_BASE + 13;
        const result = runSequence(seed, OPS_PER_SEQUENCE, scenario);
        globalMaxRankLength = Math.max(globalMaxRankLength, result.maxRankLength);
      }

      // eslint-disable-next-line no-console -- диагностика прогона генеративного теста, требуется в отчёте (test/, не продакшн-путь)
      console.log(
        `[rank property] scenario=${scenario} sequences=${SEQUENCES_PER_SCENARIO} ` +
          `opsPerSequence=${OPS_PER_SEQUENCE} seedBase=${SEED_BASE} maxRankLength=${globalMaxRankLength}`,
      );

      // Длина не обязана быть маленькой (см. rank.ts про линейный рост при
      // вставке в один и тот же край), но обязана оставаться разумной и не
      // взрывной — если бы алгоритм был сломан, здесь давно случился бы
      // экспоненциальный рост или падение assertRank/RangeError выше.
      expect(globalMaxRankLength).toBeLessThan(200);
    },
  );

  it('порог ренормализации (64) действительно достижим при затяжной вставке в один край — не гипотетическое число', () => {
    // Не через runSequence: здесь важна ИМЕННО точка достижения порога,
    // а не максимум за фиксированное число операций.
    let rank = initialRank();
    let appends = 0;
    while (rank.length < 64 && appends < 100_000) {
      rank = rankAfter(rank);
      appends++;
    }
    expect(rank.length).toBeGreaterThanOrEqual(64);
    // eslint-disable-next-line no-console -- диагностика прогона, число нужно в отчёте
    console.log(
      `[rank property] длина 64 достигнута после ${appends} последовательных rankAfter()`,
    );
  });
});
