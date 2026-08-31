import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { parseQuickAdd } from '../src/parse.js';
import { GOLDEN_CORPUS } from '../src/corpus/golden-corpus.js';
import type { AnyAcceptedChip, ChipCategory } from '../src/types.js';

/**
 * Раннер golden-корпуса (`01§4`, `06_TESTING_ACCEPTANCE.md`). Ничего не
 * знает про содержимое конкретных кейсов — расширение корпуса до 800+ в
 * следующем пакете работ не трогает этот файл, только
 * `src/corpus/golden-corpus.ts`.
 */

function serializeChipValue(chip: AnyAcceptedChip): string {
  switch (chip.category) {
    case 'date':
    case 'weekday':
      return chip.value.date.toString();
    case 'time':
      return chip.value.time.toString({ smallestUnit: 'minute' });
    case 'deadline':
      return (
        chip.value.date.toString() +
        (chip.value.time === null ? '' : ` ${chip.value.time.toString({ smallestUnit: 'minute' })}`)
      );
    case 'duration':
      return String(chip.value.minutes);
    case 'recurrence':
      return JSON.stringify(chip.value);
    case 'project':
    case 'label':
      return chip.value.name;
    case 'priority':
      return String(chip.value.priority);
  }
}

describe(`golden-корпус (${GOLDEN_CORPUS.length} примеров, задел на расширение до 800+ по 01§4)`, () => {
  it('минимальный размер пакета работ E05.1 — не менее 250 примеров', () => {
    expect(GOLDEN_CORPUS.length).toBeGreaterThanOrEqual(250);
  });

  it('id кейсов уникальны — расширение корпуса не может тихо задвоить существующий кейс', () => {
    const ids = GOLDEN_CORPUS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('у каждого кейса заполнено человекочитаемое обоснование (note)', () => {
    for (const testCase of GOLDEN_CORPUS) {
      expect(testCase.note.length, testCase.id).toBeGreaterThan(0);
    }
  });

  describe.each(GOLDEN_CORPUS.map((c) => [c.id, c] as const))('%s', (_id, testCase) => {
    it(testCase.note, () => {
      const now = {
        date: Temporal.PlainDate.from(testCase.now.date),
        time: Temporal.PlainTime.from(testCase.now.time),
        timeZone: 'Europe/Moscow',
      };
      const result =
        testCase.inherited === undefined
          ? parseQuickAdd({ text: testCase.text, now })
          : parseQuickAdd({
              text: testCase.text,
              now,
              inherited: { date: Temporal.PlainDate.from(testCase.inherited.date) },
            });

      const actualCategories: ChipCategory[] = result.chips.map((c) => c.category).toSorted();
      const expectedCategories = testCase.expectedCategories.toSorted();
      expect(actualCategories).toEqual(expectedCategories);

      if (testCase.expectedTitle !== undefined) {
        expect(result.title.text).toBe(testCase.expectedTitle);
      }
      if (testCase.expectedReadable !== undefined) {
        expect(result.title.readable).toBe(testCase.expectedReadable);
      }
      if (testCase.expectedValues !== undefined) {
        for (const expectedValue of testCase.expectedValues) {
          const chip = result.chips.find((c) => c.category === expectedValue.category);
          expect(chip, `ожидался чип категории "${expectedValue.category}"`).toBeDefined();
          expect(serializeChipValue(chip!)).toBe(expectedValue.value);
        }
      }
    });
  });
});
