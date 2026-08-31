import { describe, expect, it } from 'vitest';

import { findProtectedRanges } from '../src/internal/text.js';
import { parseQuickAdd } from '../src/parse.js';
import { categoriesOf } from './assertions.js';
import { MONDAY } from './helpers.js';

describe('шаг 2: защита quoted-фрагментов', () => {
  it('находит закрытую пару «...»', () => {
    expect(findProtectedRanges('a «bc» d')).toEqual([{ start: 2, end: 6 }]);
  });

  it('находит закрытую пару "..."', () => {
    expect(findProtectedRanges('a "bc" d')).toEqual([{ start: 2, end: 6 }]);
  });

  it('незакрытая кавычка не защищает ничего дальше', () => {
    expect(findProtectedRanges('a «bc d')).toEqual([]);
  });

  it('#-токен внутри «...» не парсится как Project', () => {
    const result = parseQuickAdd({ text: 'Написать «#не_проект» другу', now: MONDAY });
    expect(result.chips).toHaveLength(0);
    expect(result.title.text).toBe('Написать «#не_проект» другу');
  });

  it('дата внутри "..." не парсится как Date', () => {
    const result = parseQuickAdd({
      text: 'Не забыть — «5 сентября» это не дата, а название',
      now: MONDAY,
    });
    expect(result.chips).toHaveLength(0);
  });

  it('дедлайн-фраза внутри "..." не становится Deadline', () => {
    const result = parseQuickAdd({
      text: 'Ответить до "5 сентября" (не по-настоящему)',
      now: MONDAY,
    });
    expect(result.chips).toHaveLength(0);
    expect(result.title.text).toBe('Ответить до "5 сентября" (не по-настоящему)');
  });

  it('частичная защита: одно вхождение в кавычках, другое — нет', () => {
    const result = parseQuickAdd({ text: 'Заметка: «завтра» не значит завтра', now: MONDAY });
    expect(categoriesOf(result)).toEqual(['date']);
    expect(result.chips[0]?.span?.text).toBe('завтра');
    expect(result.chips[0]?.span?.start).toBe(28);
    expect(result.title.text).toBe('Заметка: «завтра» не значит');
  });

  it('незакрытая кавычка не мешает разбору текста после неё', () => {
    const result = parseQuickAdd({
      text: 'Заметка «без закрытия и сегодня будет нормальный день',
      now: MONDAY,
    });
    expect(categoriesOf(result)).toEqual(['date']);
    expect(result.title.text).toBe('Заметка «без закрытия и будет нормальный день');
  });

  it('несколько категорий внутри одной пары кавычек — все защищены', () => {
    const result = parseQuickAdd({
      text: '«Купить #хлеб @молоко !1» — пометка',
      now: MONDAY,
    });
    expect(result.chips).toHaveLength(0);
  });

  it('символ вне кавычек рядом с защищённым диапазоном парсится как обычно', () => {
    const result = parseQuickAdd({ text: 'Купить "хлеб" и #молоко', now: MONDAY });
    expect(categoriesOf(result)).toEqual(['project']);
    expect(result.title.text).toBe('Купить "хлеб" и');
  });
});
