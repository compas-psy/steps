import { describe, expect, it } from 'vitest';

import { normalizeLabelName, validateLabel } from '../../src/validation/label.js';

describe('normalizeLabelName — правило 24: case-insensitive после Unicode-нормализации, ё≠е', () => {
  it('"Работа" и "работа" нормализуются к одному значению — одна метка', () => {
    expect(normalizeLabelName('Работа')).toBe(normalizeLabelName('работа'));
  });

  it('"ВАЖНОЕ" и "важное" — одна метка', () => {
    expect(normalizeLabelName('ВАЖНОЕ')).toBe(normalizeLabelName('важное'));
  });

  it('"ёлка" и "елка" — РАЗНЫЕ метки: ё и е различаются при сопоставлении меток (не путать с поиском `01§15`)', () => {
    expect(normalizeLabelName('ёлка')).not.toBe(normalizeLabelName('елка'));
  });

  it('"Ёлка" и "ёлка" — одна и та же метка (регистр не влияет на различие ё/е)', () => {
    expect(normalizeLabelName('Ёлка')).toBe(normalizeLabelName('ёлка'));
  });
});

describe('validateLabel — правило 23: title 1..80 (блокирующее)', () => {
  it('пустое имя — блокируется', () => {
    const result = validateLabel({ displayName: '' }, { existingNormalizedNames: [] });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'LABEL_TITLE_LENGTH_INVALID')).toBe(true);
  });

  it('имя длиннее 80 символов — блокируется', () => {
    const result = validateLabel({ displayName: 'а'.repeat(81) }, { existingNormalizedNames: [] });
    expect(result.valid).toBe(false);
  });

  it('ровно 80 символов — граница включительно, не блокируется', () => {
    const result = validateLabel({ displayName: 'а'.repeat(80) }, { existingNormalizedNames: [] });
    expect(result.issues.some((i) => i.code === 'LABEL_TITLE_LENGTH_INVALID')).toBe(false);
  });
});

describe('validateLabel — правило 24: уникальность в scope пользователя, регистронезависимо после нормализации (блокирующее)', () => {
  it('"Работа" при уже существующей "работа" — блокируется (одна и та же метка)', () => {
    const result = validateLabel(
      { displayName: 'Работа' },
      { existingNormalizedNames: [normalizeLabelName('работа')] },
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      {
        rule: 24,
        code: 'LABEL_NOT_UNIQUE',
        severity: 'blocking',
        field: 'displayName',
        details: { normalized: normalizeLabelName('работа') },
      },
    ]);
  });

  it('"ёлка" при уже существующей "елка" — НЕ блокируется: ё и е различаются при сопоставлении меток', () => {
    const result = validateLabel(
      { displayName: 'ёлка' },
      { existingNormalizedNames: [normalizeLabelName('елка')] },
    );
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.rule === 24)).toBe(false);
  });

  it('новое уникальное имя — не блокируется', () => {
    const result = validateLabel(
      { displayName: 'Дом' },
      { existingNormalizedNames: [normalizeLabelName('работа')] },
    );
    expect(result.valid).toBe(true);
  });

  it('редактирование метки без изменения имени не конфликтует само с собой (существующее имя исключается вызывающим кодом из контекста)', () => {
    const result = validateLabel({ displayName: 'Работа' }, { existingNormalizedNames: [] });
    expect(result.valid).toBe(true);
  });
});
