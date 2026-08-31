import { describe, expect, it } from 'vitest';

import { parseQuickAdd } from '../src/parse.js';
import { chipOf, dateIso, timeIso } from './assertions.js';
import { MONDAY, now } from './helpers.js';

describe('категория Deadline — маркер "до <дата/время>" (единственный синтаксис R1)', () => {
  it('до <дата словом>', () => {
    const r = parseQuickAdd({ text: 'Сдать отчёт до 5 сентября', now: MONDAY });
    const d = chipOf(r, 'deadline');
    expect(dateIso(d.value.date)).toBe('2026-09-05');
    expect(d.value.time).toBeNull();
    expect(r.title.text).toBe('Сдать отчёт');
  });

  it('до <дата-шорткат>', () => {
    const r = parseQuickAdd({ text: 'Оплатить до завтра', now: MONDAY });
    const d = chipOf(r, 'deadline');
    expect(dateIso(d.value.date)).toBe('2026-09-01');
    expect(r.title.text).toBe('Оплатить');
  });

  it('до <числовая дата>', () => {
    const r = parseQuickAdd({ text: 'Заплатить до 05.09.2026', now: MONDAY });
    expect(dateIso(chipOf(r, 'deadline').value.date)).toBe('2026-09-05');
  });

  it('до <дата> <время> — оба атрибута в одном чипе', () => {
    const r = parseQuickAdd({ text: 'Закончить проект до 5 сентября 18:00', now: MONDAY });
    const d = chipOf(r, 'deadline');
    expect(dateIso(d.value.date)).toBe('2026-09-05');
    expect(d.value.time && timeIso(d.value.time)).toBe('18:00');
    expect(r.title.text).toBe('Закончить проект');
  });

  it('до выходных', () => {
    const r = parseQuickAdd({ text: 'Прочитать книгу до выходных', now: MONDAY });
    expect(dateIso(chipOf(r, 'deadline').value.date)).toBe('2026-09-05');
  });

  it('"до свидания" — не дедлайн', () => {
    const r = parseQuickAdd({ text: 'Сходить до свидания с другом', now: MONDAY });
    expect(r.chips).toHaveLength(0);
    expect(r.title.text).toBe('Сходить до свидания с другом');
  });

  it('"до конца улицы" — не дедлайн', () => {
    const r = parseQuickAdd({ text: 'Идти до конца улицы', now: MONDAY });
    expect(r.chips).toHaveLength(0);
  });

  it('невалидная дата внутри дедлайна отклоняет весь чип, ровно одна причина', () => {
    const r = parseQuickAdd({ text: 'Ответить клиенту до 30 февраля', now: MONDAY });
    expect(r.chips).toHaveLength(0);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]).toMatchObject({ category: 'deadline', reason: 'invalidDate' });
    expect(r.rejected[0]?.span.text).toBe('до 30 февраля');
  });

  describe('Time-only Deadline подчиняется правилу Today/Tomorrow при отсутствии контекста даты', () => {
    it('время ещё не наступило — переносится на завтра', () => {
      const r = parseQuickAdd({ text: 'Прислать до 9', now: MONDAY }); // now=10:00
      expect(dateIso(chipOf(r, 'deadline').value.date)).toBe('2026-09-01');
      expect(r.title.text).toBe('Прислать');
    });

    it('время ещё впереди — сегодня', () => {
      const r = parseQuickAdd({ text: 'Сдать до 11', now: MONDAY }); // now=10:00
      expect(dateIso(chipOf(r, 'deadline').value.date)).toBe('2026-08-31');
      expect(r.title.text).toBe('Сдать');
    });

    it('унаследованная дата — время присоединяется к ней, даже если время уже прошло', () => {
      const r = parseQuickAdd({
        text: 'Прислать до 9',
        now: MONDAY, // 10:00 — время 9 уже прошло
        inherited: { date: now('2026-09-10', '10:00').date },
      });
      const d = chipOf(r, 'deadline');
      expect(dateIso(d.value.date)).toBe('2026-09-10');
      expect(d.value.dateOrigin).toBe('inherited');
    });
  });

  describe('известные ограничения грамматики R1 (документированное решение пакета работ)', () => {
    it('родительный падеж дня недели после "до" не поддерживается', () => {
      const r = parseQuickAdd({ text: 'Согласовать до вторника', now: MONDAY });
      expect(r.chips).toHaveLength(0);
    });

    it('родительный падеж времени суток после "до" не поддерживается', () => {
      const r = parseQuickAdd({ text: 'Написать письмо до вечера', now: MONDAY });
      expect(r.chips).toHaveLength(0);
    });
  });
});
