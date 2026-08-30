import { describe, expect, it } from 'vitest';

import {
  validateProject,
  type ProjectValidationContext,
  type ProjectValidationInput,
} from '../../src/validation/project.js';

function bareInput(): ProjectValidationInput {
  return { title: 'Работа', description: '' };
}

function bareContext(): ProjectValidationContext {
  return { origin: 'create', activeProjectCountExcludingThis: 0, hasProEntitlement: false };
}

describe('validateProject — правило 22: title 1..120, description 0..10000 (блокирующее)', () => {
  it('пустой title — блокируется', () => {
    const result = validateProject({ ...bareInput(), title: '' }, bareContext());
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe('PROJECT_TITLE_LENGTH_INVALID');
  });

  it('title длиннее 120 символов — блокируется', () => {
    const result = validateProject({ ...bareInput(), title: 'а'.repeat(121) }, bareContext());
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'PROJECT_TITLE_LENGTH_INVALID')).toBe(true);
  });

  it('ровно 120 символов — граница включительно, не блокируется', () => {
    const result = validateProject({ ...bareInput(), title: 'а'.repeat(120) }, bareContext());
    expect(result.issues.some((i) => i.code === 'PROJECT_TITLE_LENGTH_INVALID')).toBe(false);
  });

  it('description длиннее 10000 символов — блокируется', () => {
    const result = validateProject(
      { ...bareInput(), description: 'a'.repeat(10_001) },
      bareContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'PROJECT_DESCRIPTION_TOO_LONG')).toBe(true);
  });

  it('ровно 10000 символов — граница включительно, не блокируется', () => {
    const result = validateProject(
      { ...bareInput(), description: 'a'.repeat(10_000) },
      bareContext(),
    );
    expect(result.issues.some((i) => i.code === 'PROJECT_DESCRIPTION_TOO_LONG')).toBe(false);
  });
});

describe('validateProject — правило 27: Free-лимит 10 активных проектов, гейтит только create/reactivate (`01§12`)', () => {
  it('обычное создание 11-го проекта на Free — блокируется', () => {
    const result = validateProject(bareInput(), {
      origin: 'create',
      activeProjectCountExcludingThis: 10,
      hasProEntitlement: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      {
        rule: 27,
        code: 'PROJECT_LIMIT_REACHED',
        severity: 'blocking',
        field: 'activeProjectCount',
        details: { limitType: 'free', limit: 10, attemptedCount: 11 },
      },
    ]);
  });

  it('реактивация 11-го проекта на Free — та же гейта, блокируется', () => {
    const result = validateProject(bareInput(), {
      origin: 'reactivate',
      activeProjectCountExcludingThis: 10,
      hasProEntitlement: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 27)).toBe(true);
  });

  it('создание 10-го проекта на Free (граница включительно) — не блокируется', () => {
    const result = validateProject(bareInput(), {
      origin: 'create',
      activeProjectCountExcludingThis: 9,
      hasProEntitlement: false,
    });
    expect(result.issues.some((i) => i.rule === 27)).toBe(false);
  });

  it('Pro-аккаунт — 11-й проект не блокируется правилом 27', () => {
    const result = validateProject(bareInput(), {
      origin: 'create',
      activeProjectCountExcludingThis: 10,
      hasProEntitlement: true,
    });
    expect(result.issues.some((i) => i.rule === 27)).toBe(false);
  });

  it('импорт, дающий 11+ активных проектов — НЕ блокируется (находка №39: миграция не отбрасывает данные)', () => {
    const result = validateProject(bareInput(), {
      origin: 'import',
      activeProjectCountExcludingThis: 50,
      hasProEntitlement: false,
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('restore из резервной копии — НЕ блокируется', () => {
    const result = validateProject(bareInput(), {
      origin: 'restore',
      activeProjectCountExcludingThis: 30,
      hasProEntitlement: false,
    });
    expect(result.valid).toBe(true);
  });

  it('слияние аккаунтов — НЕ блокируется', () => {
    const result = validateProject(bareInput(), {
      origin: 'account_merge',
      activeProjectCountExcludingThis: 15,
      hasProEntitlement: false,
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateProject — правило 28: технический потолок 500 активных проектов, отдельно от Free-лимита', () => {
  it('обычное создание 501-го проекта (даже на Pro) — блокируется', () => {
    const result = validateProject(bareInput(), {
      origin: 'create',
      activeProjectCountExcludingThis: 500,
      hasProEntitlement: true,
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      {
        rule: 28,
        code: 'PROJECT_LIMIT_REACHED',
        severity: 'blocking',
        field: 'activeProjectCount',
        details: { limitType: 'technical', limit: 500, attemptedCount: 501 },
      },
    ]);
  });

  it('ровно 500 (граница включительно) — не блокируется', () => {
    const result = validateProject(bareInput(), {
      origin: 'create',
      activeProjectCountExcludingThis: 499,
      hasProEntitlement: true,
    });
    expect(result.issues.some((i) => i.rule === 28)).toBe(false);
  });
});
