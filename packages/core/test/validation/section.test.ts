import { describe, expect, it } from 'vitest';

import { validateSection } from '../../src/validation/section.js';

describe('validateSection — правило 23: title 1..80 (блокирующее)', () => {
  it('пустой title — блокируется', () => {
    const result = validateSection({ title: '' });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      {
        rule: 23,
        code: 'SECTION_TITLE_LENGTH_INVALID',
        severity: 'blocking',
        field: 'title',
        details: { length: 0 },
      },
    ]);
  });

  it('title длиннее 80 символов — блокируется', () => {
    const result = validateSection({ title: 'а'.repeat(81) });
    expect(result.valid).toBe(false);
  });

  it('ровно 80 символов — граница включительно, не блокируется', () => {
    const result = validateSection({ title: 'а'.repeat(80) });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('обычный короткий заголовок — валиден', () => {
    const result = validateSection({ title: 'Работа' });
    expect(result.valid).toBe(true);
  });
});
