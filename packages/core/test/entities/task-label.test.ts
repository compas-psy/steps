import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { isTaskLabelActive, type TaskLabel } from '../../src/entities/task-label.js';
import type { Hlc } from '../../src/hlc.js';
import { asUuid } from '../../src/values.js';

const taskId = asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001');
const labelId = asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000030');

function hlc(physicalIso: string, logical = 0): Hlc {
  return { physical: Temporal.Instant.from(physicalIso), logical, deviceId: null };
}

describe('TaskLabel — OR-set (`02§8`: "relation exists when add_hlc > remove_hlc")', () => {
  it('связь активна, когда addHlc новее removeHlc', () => {
    const link: TaskLabel = {
      taskId,
      labelId,
      addHlc: hlc('2026-08-30T10:00:01Z'),
      removeHlc: hlc('2026-08-30T10:00:00Z'),
    };
    expect(isTaskLabelActive(link)).toBe(true);
  });

  it('связь неактивна, когда removeHlc новее или равен addHlc', () => {
    const link: TaskLabel = {
      taskId,
      labelId,
      addHlc: hlc('2026-08-30T10:00:00Z'),
      removeHlc: hlc('2026-08-30T10:00:01Z'),
    };
    expect(isTaskLabelActive(link)).toBe(false);
  });

  it('связь никогда не удалялась (removeHlc=null) — активна', () => {
    const link: TaskLabel = {
      taskId,
      labelId,
      addHlc: hlc('2026-08-30T10:00:00Z'),
      removeHlc: null,
    };
    expect(isTaskLabelActive(link)).toBe(true);
  });
});
