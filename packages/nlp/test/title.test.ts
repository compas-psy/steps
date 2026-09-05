import { describe, expect, it } from 'vitest';

import { parseQuickAdd } from '../src/parse.js';
import { MONDAY } from './helpers.js';

describe('шаг 9 + решение `?10`: заголовок после разбора', () => {
  it('вычищаются только диапазоны ПРИНЯТЫХ чипов', () => {
    const r = parseQuickAdd({ text: 'Купить #продукты на выходные', now: MONDAY });
    // Оба чипа (проект и дата) приняты, оба диапазона вычищены. Предлог
    // «на» входит в диапазон чипа даты (`matchers/date.ts`), поэтому в
    // заголовке не остаётся: «Купить на» названием задачи не является.
    expect(r.title.text).toBe('Купить');
  });

  it('отклонённый/неопознанный текст остаётся в заголовке как есть', () => {
    const r = parseQuickAdd({ text: 'Задача !1 и ещё !3', now: MONDAY });
    expect(r.title.text).toBe('Задача и ещё !3');
  });

  it('множественные пробелы после вычистки схлопываются в один', () => {
    const r = parseQuickAdd({ text: 'Купить хлеб #дом молоко', now: MONDAY });
    expect(r.title.text).toBe('Купить хлеб молоко');
  });

  it('заголовок целиком из одних служебных токенов — пуст и нечитаем', () => {
    const r = parseQuickAdd({ text: '#дом', now: MONDAY });
    expect(r.title.text).toBe('');
    expect(r.title.readable).toBe(false);
    expect(r.title.length).toBe(0);
  });

  it('несколько служебных токенов без остатка — тоже нечитаем', () => {
    const r = parseQuickAdd({ text: '@важное !2', now: MONDAY });
    expect(r.title.text).toBe('');
    expect(r.title.readable).toBe(false);
  });

  it('только пунктуация без единого служебного токена — тоже нечитаем (правило `?10` не зависит от NLP)', () => {
    const r = parseQuickAdd({ text: '...', now: MONDAY });
    expect(r.chips).toHaveLength(0);
    expect(r.title.text).toBe('...');
    expect(r.title.readable).toBe(false);
  });

  it('свободный текст остаётся читаемым', () => {
    const r = parseQuickAdd({ text: 'Купить хлеб', now: MONDAY });
    expect(r.title.readable).toBe(true);
  });

  it('длина заголовка — в Unicode code points, делегировано `@shagi/core`', () => {
    const r = parseQuickAdd({ text: 'Купить 🎉 хлеб', now: MONDAY });
    expect(r.title.length).toBe([...'Купить 🎉 хлеб'].length);
  });

  it('четыре служебных токена сразу — заголовок пуст, все распознаны', () => {
    const r = parseQuickAdd({ text: '#проект @метка !3 5 сентября', now: MONDAY });
    expect(r.chips.map((c) => c.category).toSorted()).toEqual([
      'date',
      'label',
      'priority',
      'project',
    ]);
    expect(r.title.text).toBe('');
    expect(r.title.readable).toBe(false);
  });
});
