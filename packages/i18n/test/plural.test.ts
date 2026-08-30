import { describe, expect, it } from 'vitest';

import { t } from '../src/index.js';

/**
 * Русский плюрал — три формы (`one`/`few`/`many`), не английские две.
 * Числа подобраны так, чтобы формы реально различались: 1 и 21 — `one`,
 * 2/22 — `few`, 5/25/0 — `many`, 11/111 — `many` (классическое исключение
 * "-надцать", которое ломает наивное `n % 10`).
 */
describe('плюрал ru-RU (три формы, Intl.PluralRules)', () => {
  const expected: ReadonlyArray<readonly [number, string]> = [
    [0, '0 задач'],
    [1, '1 задача'],
    [2, '2 задачи'],
    [5, '5 задач'],
    [11, '11 задач'],
    [21, '21 задача'],
    [22, '22 задачи'],
    [25, '25 задач'],
    [111, '111 задач'],
  ];

  it.each(expected)('tasks.count(%i) → "%s"', (count, text) => {
    expect(t('tasks', 'count', { count })).toBe(text);
  });

  it('плюрал работает одинаково на другом существительном другого рода (мужской род "день")', () => {
    expect(t('time', 'daysLeft', { count: 1 })).toBe('1 день');
    expect(t('time', 'daysLeft', { count: 2 })).toBe('2 дня');
    expect(t('time', 'daysLeft', { count: 5 })).toBe('5 дней');
    expect(t('time', 'daysLeft', { count: 11 })).toBe('11 дней');
    expect(t('time', 'daysLeft', { count: 21 })).toBe('21 день');
  });

  it('текст вокруг плюрала сохраняется (не только числительное)', () => {
    expect(t('tasks', 'remaining', { count: 1 })).toBe('Осталась 1 задача');
    expect(t('tasks', 'remaining', { count: 5 })).toBe('Осталось 5 задач');
    expect(t('tasks', 'remaining', { count: 0 })).toBe('Осталось 0 задач');
  });
});
