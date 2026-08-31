import { describe, expect, it } from 'vitest';

import { parseQuickAdd } from '../src/parse.js';
import { chipOf, dateIso } from './assertions.js';
import { MONDAY, now } from './helpers.js';

describe('правило "Time-only без даты" (`01§4`)', () => {
  it('время ещё не наступило (< текущей минуты) → Сегодня заменяется Завтра', () => {
    const r = parseQuickAdd({ text: 'Позвонить в 9:30', now: MONDAY }); // now=10:00
    const date = chipOf(r, 'date');
    expect(dateIso(date.value.date)).toBe('2026-09-01');
    expect(date.origin).toBe('implied');
    expect(date.span).toBeNull();
  });

  it('время ещё впереди (> текущей минуты) → Сегодня', () => {
    const r = parseQuickAdd({ text: 'Позвонить в 15:00', now: MONDAY });
    const date = chipOf(r, 'date');
    expect(dateIso(date.value.date)).toBe('2026-08-31');
    expect(date.origin).toBe('implied');
  });

  it('граница: время РОВНО текущей минуте — считается ещё не прошедшим (Сегодня)', () => {
    const r = parseQuickAdd({ text: 'Встреча в 10:00', now: MONDAY });
    expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-08-31');
  });

  it('граница: на минуту раньше текущей — уже прошло (Завтра)', () => {
    const r = parseQuickAdd({ text: 'Обед в 9:59', now: MONDAY });
    expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-01');
  });

  it('граница: на минуту позже текущей — ещё впереди (Сегодня)', () => {
    const r = parseQuickAdd({ text: 'Обед в 10:01', now: MONDAY });
    expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-08-31');
  });

  it('итоговый Date-чип показан явно даже когда дата не была написана', () => {
    const r = parseQuickAdd({ text: 'Позвонить в 9:30', now: MONDAY });
    expect(r.chips.some((c) => c.category === 'date')).toBe(true);
  });

  it('унаследованная дата — явное время присоединяется к ней, даже если время уже прошло', () => {
    const r = parseQuickAdd({
      text: 'Позвонить в 9:30',
      now: MONDAY,
      inherited: { date: now('2026-09-05', '10:00').date },
    });
    const date = chipOf(r, 'date');
    expect(dateIso(date.value.date)).toBe('2026-09-05');
    expect(date.origin).toBe('inherited');
  });

  it('унаследованная дата побеждает даже когда время ещё впереди', () => {
    const r = parseQuickAdd({
      text: 'Позвонить в 15:00',
      now: MONDAY,
      inherited: { date: now('2026-09-05', '10:00').date },
    });
    expect(dateIso(chipOf(r, 'date').value.date)).toBe('2026-09-05');
  });

  it('явно написанная дата побеждает унаследованный контекст', () => {
    const r = parseQuickAdd({
      text: 'Позвонить завтра в 9:30',
      now: MONDAY,
      inherited: { date: now('2026-09-05', '10:00').date },
    });
    const date = chipOf(r, 'date');
    expect(dateIso(date.value.date)).toBe('2026-09-01');
    expect(date.origin).toBe('explicit');
  });

  it('унаследованная дата БЕЗ времени в тексте не порождает никакого чипа', () => {
    // NLP не дублирует то, что Composer и так уже знает вне текста —
    // синтез Date-чипа привязан именно к присутствию Time-чипа (см. отчёт
    // пакета работ, решение по неоднозначности спецификации).
    const r = parseQuickAdd({
      text: 'Купить корм',
      now: MONDAY,
      inherited: { date: now('2026-09-05', '10:00').date },
    });
    expect(r.chips).toHaveLength(0);
  });

  it('без времени и без даты вообще — валидная комбинация, чипов нет', () => {
    const r = parseQuickAdd({ text: 'Купить хлеб', now: MONDAY });
    expect(r.chips).toHaveLength(0);
    expect(r.title.text).toBe('Купить хлеб');
  });

  it('период суток (утром/днём/вечером) подчиняется тому же правилу', () => {
    const passed = parseQuickAdd({ text: 'Позвонить утром', now: MONDAY }); // 09:00 < 10:00
    const ahead = parseQuickAdd({ text: 'Позвонить вечером', now: MONDAY }); // 19:00 > 10:00
    expect(dateIso(chipOf(passed, 'date').value.date)).toBe('2026-09-01');
    expect(dateIso(chipOf(ahead, 'date').value.date)).toBe('2026-08-31');
  });
});

describe('правило Today/Tomorrow для Time-only Deadline — тот же механизм', () => {
  it('deadline без даты подчиняется тому же правилу, но не создаёт отдельного Date-чипа задачи', () => {
    const r = parseQuickAdd({ text: 'Отчёт до 9', now: MONDAY });
    expect(r.chips.some((c) => c.category === 'date')).toBe(false);
    expect(r.chips).toHaveLength(1);
    expect(r.chips[0]).toMatchObject({ category: 'deadline' });
  });
});
