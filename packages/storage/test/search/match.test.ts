import { generateUuidV7 } from '@shagi/core';
import { describe, expect, it } from 'vitest';

import { matchCandidate } from '../../src/search/match.js';
import type { SearchableLabel, SearchableProject, SearchableTask } from '../../src/search/types.js';

function task(overrides: Partial<SearchableTask> = {}): SearchableTask {
  return {
    kind: 'task',
    id: generateUuidV7(),
    title: 'Проверочная задача',
    description: '',
    status: 'active',
    projectTitle: null,
    labelDisplayNames: [],
    ...overrides,
  };
}

function project(overrides: Partial<SearchableProject> = {}): SearchableProject {
  return {
    kind: 'project',
    id: generateUuidV7(),
    title: 'Проверочный проект',
    description: '',
    ...overrides,
  };
}

function label(overrides: Partial<SearchableLabel> = {}): SearchableLabel {
  return { kind: 'label', id: generateUuidV7(), title: 'важное', ...overrides };
}

describe('matchCandidate — уровни 1–4 (заголовок)', () => {
  it('уровень 1: точное совпадение заголовка', () => {
    expect(matchCandidate('молоко', task({ title: 'Молоко' }))).toBe(1);
  });

  it('уровень 2: заголовок начинается с запроса, но не равен ему', () => {
    expect(matchCandidate('молоко', task({ title: 'Молоко овсяное' }))).toBe(2);
  });

  it('уровень 3: запрос — начало отдельного токена заголовка (не первого)', () => {
    expect(matchCandidate('молоко', task({ title: 'Купить молоко' }))).toBe(3);
  });

  it('уровень 4: запрос — подстрока заголовка не по границе токена', () => {
    // "Полмолоко" — синтетический заголовок (см. комментарий в
    // `src/search/golden/dataset.ts`): подстрока "молоко" внутри одного
    // токена, но не с его начала, иначе это был бы уровень 3.
    expect(matchCandidate('молоко', task({ title: 'Полмолоко' }))).toBe(4);
  });

  it('без совпадения — null, а не низкий уровень', () => {
    expect(matchCandidate('квантум', task({ title: 'Молоко' }))).toBeNull();
  });

  it('правило применяется одинаково к Project и Label, не только к Task', () => {
    expect(matchCandidate('ремонт', project({ title: 'Ремонт квартиры' }))).toBe(2);
    expect(matchCandidate('важн', label({ title: 'важное' }))).toBe(2);
  });
});

describe('matchCandidate — нормализация внутри классификации', () => {
  it('регистр не влияет на уровень', () => {
    expect(matchCandidate('МОЛОКО', task({ title: 'молоко' }))).toBe(1);
  });

  it('ё=е в любом направлении', () => {
    expect(matchCandidate('отчет', task({ title: 'Отчёт' }))).toBe(1);
    expect(matchCandidate('отчёт', task({ title: 'Отчет' }))).toBe(1);
  });
});

describe('matchCandidate — уровень 5 (проект/метка), только у Task', () => {
  it('совпадение по денормализованному заголовку проекта', () => {
    const candidate = task({ title: 'Забронировать билеты', projectTitle: 'Отпуск' });
    expect(matchCandidate('отпуск', candidate)).toBe(5);
  });

  it('совпадение по одной из меток задачи', () => {
    const candidate = task({ title: 'Сходить к врачу', labelDisplayNames: ['Важное'] });
    expect(matchCandidate('важн', candidate)).toBe(5);
  });

  it('уровень 5 не применяется к Project/Label самим по себе', () => {
    expect(matchCandidate('молоко', project({ title: 'Молоко', description: 'молоко' }))).toBe(1);
  });

  it('уровень 1–4 по заголовку задачи побеждает уровень 5, если оба применимы', () => {
    const candidate = task({ title: 'Отпуск в горах', projectTitle: 'Отпуск' });
    expect(matchCandidate('отпуск', candidate)).toBe(2); // заголовок начинается с "отпуск" — уровень 2, не 5
  });
});

describe('matchCandidate — уровень 6 (описание)', () => {
  it('совпадение только по описанию задачи', () => {
    const candidate = task({ title: 'Проверить почту', description: 'квартальный отчёт' });
    expect(matchCandidate('квартальный', candidate)).toBe(6);
  });

  it('совпадение по описанию проекта (Project тоже имеет description, ../schema/tables.ts)', () => {
    const candidate = project({ title: 'Прочее', description: 'бюджет на квартал' });
    expect(matchCandidate('квартал', candidate)).toBe(6);
  });

  it('у Label нет описания — уровень 6 недостижим', () => {
    expect(matchCandidate('важн', label({ title: 'прочее' }))).toBeNull();
  });

  it('уровень 5 побеждает уровень 6, если оба применимы', () => {
    const candidate = task({
      title: 'Купить билеты',
      projectTitle: 'Отпуск',
      description: 'нужно ещё забронировать отпуск в системе учёта',
    });
    expect(matchCandidate('отпуск', candidate)).toBe(5);
  });
});

describe('matchCandidate — пустой запрос', () => {
  it('пустая (после нормализации) строка запроса не совпадает ни с чем', () => {
    expect(matchCandidate('   ', task({ title: 'Молоко' }))).toBeNull();
  });
});
