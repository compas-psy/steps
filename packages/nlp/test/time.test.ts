import { describe, expect, it } from 'vitest';

import { parseQuickAdd } from '../src/parse.js';
import { chipOf, timeIso } from './assertions.js';
import { MONDAY, now } from './helpers.js';

describe('категория Time', () => {
  it('"в 11" — час без минут, предлог обязателен', () => {
    const r = parseQuickAdd({ text: 'Стрижка в 20', now: MONDAY });
    expect(timeIso(chipOf(r, 'time').value.time)).toBe('20:00');
    expect(r.title.text).toBe('Стрижка');
  });

  it('"11:00" — с двоеточием, без предлога', () => {
    const r = parseQuickAdd({ text: 'Созвон 15:00', now: MONDAY });
    expect(timeIso(chipOf(r, 'time').value.time)).toBe('15:00');
    expect(r.title.text).toBe('Созвон');
  });

  it('"в 9:30" — с двоеточием и предлогом', () => {
    const r = parseQuickAdd({ text: 'Обед в 9:30', now: MONDAY });
    expect(timeIso(chipOf(r, 'time').value.time)).toBe('09:30');
    expect(r.title.text).toBe('Обед');
  });

  it('утром → 09:00', () => {
    const r = parseQuickAdd({ text: 'Завтрак утром', now: MONDAY });
    expect(timeIso(chipOf(r, 'time').value.time)).toBe('09:00');
  });

  it('днём → 14:00', () => {
    const r = parseQuickAdd({ text: 'Обед днём', now: MONDAY });
    expect(timeIso(chipOf(r, 'time').value.time)).toBe('14:00');
  });

  it('днем (без ё) — та же форма', () => {
    const r = parseQuickAdd({ text: 'Оплата днем', now: MONDAY });
    expect(timeIso(chipOf(r, 'time').value.time)).toBe('14:00');
  });

  it('вечером → 19:00', () => {
    const r = parseQuickAdd({ text: 'Ужин вечером', now: MONDAY });
    expect(timeIso(chipOf(r, 'time').value.time)).toBe('19:00');
  });

  it('час 0 (полночь) — валиден', () => {
    const r = parseQuickAdd({ text: 'Полить цветы в 0', now: MONDAY });
    expect(timeIso(chipOf(r, 'time').value.time)).toBe('00:00');
  });

  it('23:59 — валиден', () => {
    const r = parseQuickAdd({ text: 'Сон в 23:59', now: MONDAY });
    expect(timeIso(chipOf(r, 'time').value.time)).toBe('23:59');
  });

  it('час > 23 — невалиден', () => {
    const r = parseQuickAdd({ text: 'Проверить почту в 25', now: MONDAY });
    expect(r.chips.filter((c) => c.category === 'time')).toHaveLength(0);
    expect(r.rejected).toContainEqual(
      expect.objectContaining({ category: 'time', reason: 'invalidDate' }),
    );
  });

  it('24:00 — невалиден (полночь пишется как 0:00, не 24:00)', () => {
    const r = parseQuickAdd({ text: 'Открыть офис в 24:00', now: MONDAY });
    expect(r.chips.filter((c) => c.category === 'time')).toHaveLength(0);
  });

  it('голое число без "в" и без двоеточия временем не считается', () => {
    const r = parseQuickAdd({ text: 'Купить 5 яблок', now: MONDAY });
    expect(r.chips).toHaveLength(0);
  });

  it('слово "часть" не матчится как единица длительности/времени', () => {
    const r = parseQuickAdd({ text: 'Обсудить часть проекта', now: MONDAY });
    expect(r.chips).toHaveLength(0);
  });

  it('предлог "в" перед часом входит в диапазон чипа — заголовок не оставляет висящий предлог', () => {
    const r = parseQuickAdd({ text: 'Позвонить в 11', now: MONDAY });
    expect(r.title.text).toBe('Позвонить');
  });

  it('"в банк" (не число) не матчится как время', () => {
    const r = parseQuickAdd({ text: 'Позвонить в банк утром !3', now: now('2026-08-31', '10:00') });
    expect(r.title.text).toBe('Позвонить в банк');
  });
});
