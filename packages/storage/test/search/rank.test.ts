import { generateUuidV7, type Uuid } from '@shagi/core';
import { describe, expect, it } from 'vitest';

import { compareRankedResults, rankCandidates } from '../../src/search/rank.js';
import type { SearchableTask, SearchCandidate } from '../../src/search/types.js';

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

describe('compareRankedResults', () => {
  it('меньший уровень (более точное совпадение) идёт раньше', () => {
    const exact = { candidate: task({ title: 'молоко' }), tier: 1 as const };
    const substring = { candidate: task({ title: 'полмолока' }), tier: 4 as const };
    expect(compareRankedResults(exact, substring)).toBeLessThan(0);
    expect(compareRankedResults(substring, exact)).toBeGreaterThan(0);
  });

  it('при равном уровне активная задача идёт раньше завершённой (правило 7)', () => {
    const active = { candidate: task({ status: 'active' }), tier: 1 as const };
    const completed = { candidate: task({ status: 'completed' }), tier: 1 as const };
    expect(compareRankedResults(active, completed)).toBeLessThan(0);
    expect(compareRankedResults(completed, active)).toBeGreaterThan(0);
  });

  it('полное совпадение уровня и статуса — детерминированный хвост по id', () => {
    const a = { candidate: task({ id: 'aaaa' as Uuid }), tier: 1 as const };
    const b = { candidate: task({ id: 'bbbb' as Uuid }), tier: 1 as const };
    expect(compareRankedResults(a, b)).toBeLessThan(0);
    expect(compareRankedResults(b, a)).toBeGreaterThan(0);
    expect(compareRankedResults(a, a)).toBe(0);
  });
});

describe('rankCandidates', () => {
  it('исключает кандидатов без совпадения ни на одном уровне', () => {
    const candidates: SearchCandidate[] = [task({ title: 'Молоко' }), task({ title: 'Хлеб' })];
    const result = rankCandidates('молоко', candidates);
    expect(result).toHaveLength(1);
    expect(result[0]?.candidate.title).toBe('Молоко');
  });

  it('сортирует по уровню, затем по active/completed, устойчиво к порядку на входе', () => {
    const exact = task({ title: 'Ревизия', status: 'active' });
    const prefixMatch = task({ title: 'Ревизия отчёта', status: 'active' });
    const completed = task({ title: 'Ревизия', status: 'completed' });

    const result = rankCandidates('ревизия', [prefixMatch, completed, exact]);

    expect(result.map((r) => r.candidate.id)).toEqual([exact.id, completed.id, prefixMatch.id]);
  });
});
