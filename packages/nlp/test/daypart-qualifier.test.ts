/**
 * Родительный уточнитель части суток после часа: «в 9 утра», «в 7 вечера»,
 * «в 2 ночи», «в 5 дня».
 *
 * Почему это отдельный файл, а не строчка в корпусе: до него грамматика
 * матчила только «в 9», а слово «утра» оставалось в тексте, и золотой
 * корпус ЗАКРЕПЛЯЛ это как ожидаемое поведение
 * (`combined-21`: `expectedTitle: 'Позвонить утра'`). «Позвонить утра» —
 * не название задачи ни на каком языке; тест проверял то, что ему сказали,
 * а сказали ему неверное. Здесь зафиксировано то, что человек реально
 * имеет в виду.
 *
 * Час без уточнителя по-прежнему требует предлога «в» (`time.ts`: голое
 * число слишком многозначно), но С уточнителем предлог необязателен —
 * «позвонить 9 утра» однозначно, слово «утра» само снимает многозначность.
 */
import { describe, expect, it } from 'vitest';

import { parseQuickAdd } from '../src/index.js';
import { MONDAY } from './helpers.js';

function parseTime(text: string): { title: string; time: string | undefined } {
  const result = parseQuickAdd({ text, now: MONDAY });
  const chip = result.chips.find((c) => c.category === 'time');
  return {
    title: result.title.text,
    time:
      chip?.category === 'time' ? chip.value.time.toString({ smallestUnit: 'minute' }) : undefined,
  };
}

describe('уточнитель части суток после часа', () => {
  it.each([
    ['Позвонить в 9 утра', '09:00'],
    ['Позвонить в 7 вечера', '19:00'],
    ['Позвонить в 2 ночи', '02:00'],
    ['Позвонить в 5 дня', '17:00'],
    ['Позвонить в 11 вечера', '23:00'],
    ['Позвонить в 12 ночи', '00:00'],
    ['Позвонить в 12 дня', '12:00'],
    // Предлог необязателен, когда уточнитель есть.
    ['Позвонить 9 утра', '09:00'],
    // С минутами.
    ['Позвонить в 9:30 утра', '09:30'],
    ['Позвонить в 7:15 вечера', '19:15'],
  ])('«%s» → %s, и уточнитель уходит из названия', (text, expected) => {
    const { title, time } = parseTime(text);
    expect(time).toBe(expected);
    expect(title).toBe('Позвонить');
  });

  it('час без уточнителя по-прежнему требует предлога — «Купить 5 яблок» не время', () => {
    const result = parseQuickAdd({ text: 'Купить 5 яблок', now: MONDAY });
    expect(result.chips.find((c) => c.category === 'time')).toBeUndefined();
    expect(result.title.text).toBe('Купить 5 яблок');
  });

  it.each([
    // «дня» — ещё и родительный падеж единицы «день». Без предлога это
    // длительность или количество, а не пять часов вечера.
    'Отпуск 3 дня',
    'Через… 3 дня выйти на связь',
  ])('«%s» — «дня» без предлога не становится временем', (text) => {
    const result = parseQuickAdd({ text, now: MONDAY });
    expect(result.chips.find((c) => c.category === 'time')).toBeUndefined();
  });

  it('«утра» без часа перед ним остаётся текстом — это не самостоятельное время', () => {
    const result = parseQuickAdd({ text: 'Расписание утра', now: MONDAY });
    expect(result.chips.find((c) => c.category === 'time')).toBeUndefined();
    expect(result.title.text).toBe('Расписание утра');
  });
});
