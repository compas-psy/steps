import { describe, expect, it } from 'vitest';

import { parseQuickAdd } from '../src/parse.js';
import { chipOf, categoriesOf } from './assertions.js';
import { MONDAY } from './helpers.js';

describe('категория Project (#имя)', () => {
  it('простое имя', () => {
    const r = parseQuickAdd({ text: 'Купить корм #дом', now: MONDAY });
    expect(chipOf(r, 'project').value.name).toBe('дом');
    expect(r.title.text).toBe('Купить корм');
  });

  it('имя в начале текста', () => {
    const r = parseQuickAdd({ text: '#работа обновить резюме', now: MONDAY });
    expect(chipOf(r, 'project').value.name).toBe('работа');
    expect(r.title.text).toBe('обновить резюме');
  });

  it('цифры и дефис в имени', () => {
    const r = parseQuickAdd({ text: 'Позвонить клиенту #важные-проекты', now: MONDAY });
    expect(chipOf(r, 'project').value.name).toBe('важные-проекты');
  });

  it('регистр имени сохраняется как набрал пользователь', () => {
    const r = parseQuickAdd({ text: 'Ответить #Работа', now: MONDAY });
    expect(chipOf(r, 'project').value.name).toBe('Работа');
  });

  it('смешанное имя латиница+кириллица+цифры+подчёркивание', () => {
    const r = parseQuickAdd({ text: 'Составить план #Q3_2026', now: MONDAY });
    expect(chipOf(r, 'project').value.name).toBe('Q3_2026');
  });

  it('только у задачи может быть один проект — второй #tag демотируется как неоднозначность', () => {
    const r = parseQuickAdd({ text: 'Задача #раз #два', now: MONDAY });
    expect(r.chips).toHaveLength(1);
    expect(r.chips[0]?.span?.text).toBe('#раз');
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]).toMatchObject({ category: 'project', reason: 'ambiguousReading' });
  });
});

describe('категория Label (@имя)', () => {
  it('простое имя', () => {
    const r = parseQuickAdd({ text: 'Купить молоко @дом', now: MONDAY });
    expect(chipOf(r, 'label').value.name).toBe('дом');
  });

  it('несколько меток в одном тексте — все приняты (в отличие от Project/Priority)', () => {
    const r = parseQuickAdd({ text: 'Написать статью @работа @идеи', now: MONDAY });
    const labels = r.chips.filter((c) => c.category === 'label');
    expect(labels).toHaveLength(2);
    expect(labels.map((c) => (c.category === 'label' ? c.value.name : null))).toEqual([
      'работа',
      'идеи',
    ]);
    expect(r.title.text).toBe('Написать статью');
  });

  it('email-адрес не читается как метка ("@" после буквы — не граница слова)', () => {
    const r = parseQuickAdd({ text: 'Написать письмо user@example.com себе', now: MONDAY });
    expect(r.chips).toHaveLength(0);
    expect(r.title.text).toBe('Написать письмо user@example.com себе');
  });
});

describe('категория Priority (!1..!4)', () => {
  it.each([1, 2, 3, 4])('!%i распознаётся', (n) => {
    const r = parseQuickAdd({ text: `Сделать отчёт !${n}`, now: MONDAY });
    expect(chipOf(r, 'priority').value.priority).toBe(n);
  });

  it('!5 и другие цифры вне 1..4 не распознаются', () => {
    const r5 = parseQuickAdd({ text: 'Оплатить счёт !5', now: MONDAY });
    const r9 = parseQuickAdd({ text: 'Задача !9', now: MONDAY });
    expect(r5.chips).toHaveLength(0);
    expect(r9.chips).toHaveLength(0);
    expect(r5.title.text).toBe('Оплатить счёт !5');
  });

  it('"срочно"/"важно" — свободные слова, НЕ служебные токены в R1', () => {
    const r = parseQuickAdd({ text: 'Срочная задача !3', now: MONDAY });
    expect(r.title.text).toBe('Срочная задача');
    expect(categoriesOf(r)).toEqual(['priority']);
  });

  it('у задачи один приоритет — второе упоминание демотируется', () => {
    const r = parseQuickAdd({ text: 'Задача !1 и ещё !3', now: MONDAY });
    expect(r.chips).toHaveLength(1);
    expect(r.chips[0]?.span?.text).toBe('!1');
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]).toMatchObject({ category: 'priority', reason: 'ambiguousReading' });
    expect(r.title.text).toBe('Задача и ещё !3');
  });
});

describe('Project + Label + Priority в одном тексте', () => {
  it('все три категории независимы друг от друга', () => {
    const r = parseQuickAdd({ text: 'Купить #now @потом !2', now: MONDAY });
    expect(categoriesOf(r)).toEqual(['label', 'priority', 'project']);
    expect(r.title.text).toBe('Купить');
  });
});
