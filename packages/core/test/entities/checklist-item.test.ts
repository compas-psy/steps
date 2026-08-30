import { describe, expect, it } from 'vitest';

import type { ChecklistItem } from '../../src/entities/checklist-item.js';
import { asUuid } from '../../src/values.js';

describe('ChecklistItem (§1 «checklist_items», `02§2`; лимит 200/задачу — §2 п.17, забота валидатора)', () => {
  it('пункт чек-листа привязан к задаче и несёт состояние done', () => {
    const item: ChecklistItem = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000040'),
      taskId: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001'),
      text: 'Купить хлеб',
      done: false,
      rank: '0|hzzzzz:' as ChecklistItem['rank'],
      deletedAt: null,
      clocks: {},
    };
    expect(item.done).toBe(false);
  });
});
