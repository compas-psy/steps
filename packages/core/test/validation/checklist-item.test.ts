import { describe, expect, it } from 'vitest';

import { validateChecklistItem } from '../../src/validation/checklist-item.js';

describe('validateChecklistItem — текст пункта чек-листа: 1..500 после нормализации + читаемость', () => {
  it('пустой текст — блокируется', () => {
    const result = validateChecklistItem({ text: '' });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'CHECKLIST_ITEM_TEXT_LENGTH_INVALID')).toBe(
      true,
    );
  });

  it('текст только из пробелов — после нормализации пуст, блокируется', () => {
    const result = validateChecklistItem({ text: '   \n\t  ' });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'CHECKLIST_ITEM_TEXT_LENGTH_INVALID')).toBe(
      true,
    );
  });

  it('текст длиннее 500 символов — блокируется', () => {
    const result = validateChecklistItem({ text: 'а'.repeat(501) });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'CHECKLIST_ITEM_TEXT_LENGTH_INVALID')).toBe(
      true,
    );
  });

  it('ровно 500 символов — граница включительно, не блокируется', () => {
    const result = validateChecklistItem({ text: 'а'.repeat(500) });
    expect(result.valid).toBe(true);
  });

  it('только пунктуация без читаемого текста — блокируется (решение ?10, как у Task.title)', () => {
    const result = validateChecklistItem({ text: '...!!!' });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'CHECKLIST_ITEM_TEXT_NOT_READABLE')).toBe(
      true,
    );
  });

  it('обычный читаемый текст — не блокируется', () => {
    const result = validateChecklistItem({ text: 'Купить молоко' });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('CR/LF/TAB схлопываются в один пробел перед проверкой длины', () => {
    const result = validateChecklistItem({ text: 'a\n\n\tb' });
    expect(result.valid).toBe(true);
  });
});
