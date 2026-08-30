import { describe, expect, it } from 'vitest';

import type { Label } from '../../src/entities/label.js';
import { asUuid } from '../../src/values.js';

describe('Label (§1 «labels», `02§2`)', () => {
  it('метка несёт нормализованное и отображаемое имя раздельно (уникальность §2 п.24 — забота валидатора)', () => {
    const label: Label = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000030'),
      normalizedName: 'важное',
      displayName: 'Важное',
      colorToken: null,
      rank: '0|hzzzzz:' as Label['rank'],
      deletedAt: null,
      clocks: {},
    };
    expect(label.displayName).toBe('Важное');
  });
});
