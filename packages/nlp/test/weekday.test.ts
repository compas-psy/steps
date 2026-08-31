import { describe, expect, it } from 'vitest';

import { parseQuickAdd } from '../src/parse.js';
import { chipOf, dateIso } from './assertions.js';
import { now } from './helpers.js';

// Понедельник 2026-08-31 .. воскресенье 2026-09-06 — вся неделя, чтобы
// покрыть "сегодня — это и есть искомый день недели" для каждого дня.
const MON = now('2026-08-31', '10:00');
const TUE = now('2026-09-01', '10:00');
const WED = now('2026-09-02', '10:00');
const THU = now('2026-09-03', '10:00');
const FRI = now('2026-09-04', '10:00');
const SAT = now('2026-09-05', '10:00');
const SUN = now('2026-09-06', '10:00');

describe('категория Weekday — "в X" = ближайший X ВКЛЮЧАЯ сегодня', () => {
  it('среда из понедельника — через 2 дня', () => {
    const r = parseQuickAdd({ text: 'Сходить в парикмахерскую в среду', now: MON });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-02');
    expect(r.title.text).toBe('Сходить в парикмахерскую');
  });

  it('пятница из вторника', () => {
    const r = parseQuickAdd({ text: 'Позвонить в пятницу', now: TUE });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-04');
  });

  it('сегодняшний день недели — результат сегодня, а не через неделю', () => {
    const r = parseQuickAdd({ text: 'Собрание в пятницу', now: FRI });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-04');
  });

  it('суббота из субботы — сегодня', () => {
    const r = parseQuickAdd({ text: 'Прогулка в субботу', now: SAT });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-05');
  });

  it('воскресенье из воскресенья — сегодня', () => {
    const r = parseQuickAdd({ text: 'Служба в воскресенье', now: SUN });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-06');
  });

  it('понедельник из понедельника — сегодня', () => {
    const r = parseQuickAdd({ text: 'Совещание в понедельник', now: MON });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-08-31');
  });

  it('четверг из среды', () => {
    const r = parseQuickAdd({ text: 'Курс в четверг', now: WED });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-03');
  });

  it('целевой день уже прошёл на этой неделе — переходит на следующую', () => {
    const r = parseQuickAdd({ text: 'Йога в понедельник', now: THU });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-07');
  });

  it('из субботы понедельник — через 2 дня, следующая календарная неделя', () => {
    const r = parseQuickAdd({ text: 'Магазин в понедельник', now: SAT });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-07');
  });

  it('из воскресенья пятница — далеко вперёд, не "почти прошедшая"', () => {
    const r = parseQuickAdd({ text: 'Стирка в пятницу', now: SUN });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-11');
  });
});

describe('категория Weekday — "в следующую X" = X СЛЕДУЮЩЕЙ календарной недели', () => {
  it('пятница из понедельника — не "через 4 дня", а неделя следующей календарной недели', () => {
    const r = parseQuickAdd({ text: 'Сходить в следующую пятницу', now: MON });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-11');
    expect(r.title.text).toBe('Сходить');
  });

  it('понедельник из вторника — следующий понедельник (через 6 дней)', () => {
    const r = parseQuickAdd({ text: 'Позвонить в следующий понедельник', now: TUE });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-07');
  });

  it('среда из среды — не сегодня, а через полную неделю', () => {
    const r = parseQuickAdd({ text: 'Собрание в следующую среду', now: WED });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-09');
  });

  it('четверг из четверга', () => {
    const r = parseQuickAdd({ text: 'Отчёт в следующий четверг', now: THU });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-10');
  });

  it('суббота из пятницы', () => {
    const r = parseQuickAdd({ text: 'Йога в следующую субботу', now: FRI });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-12');
  });

  it('воскресенье из субботы', () => {
    const r = parseQuickAdd({ text: 'Служба в следующее воскресенье', now: SAT });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-13');
  });

  it('вторник из воскресенья', () => {
    const r = parseQuickAdd({ text: 'Совещание в следующий вторник', now: SUN });
    expect(dateIso(chipOf(r, 'weekday').value.date)).toBe('2026-09-08');
  });
});

describe('"в пятницу" и "в следующую пятницу" из одного и того же "сегодня" — разные значения', () => {
  it('среда: обычная и "следующая" пятница различаются', () => {
    const nearest = parseQuickAdd({ text: 'Сходить в пятницу', now: WED });
    const nextWeek = parseQuickAdd({ text: 'Сходить в следующую пятницу', now: WED });
    expect(dateIso(chipOf(nearest, 'weekday').value.date)).toBe('2026-09-04');
    expect(dateIso(chipOf(nextWeek, 'weekday').value.date)).toBe('2026-09-11');
    expect(dateIso(chipOf(nearest, 'weekday').value.date)).not.toBe(
      dateIso(chipOf(nextWeek, 'weekday').value.date),
    );
  });
});
