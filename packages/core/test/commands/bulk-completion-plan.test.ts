import { describe, expect, it } from 'vitest';

import { planBulkCompletion } from '../../src/commands/bulk-completion-plan.js';
import type { Uuid } from '../../src/values.js';

/** Идентификаторы читаемыми буквами: в этих проверках важен ПОРЯДОК и
 * КРАТНОСТЬ, а не форма uuid. */
const id = (name: string): Uuid => name as unknown as Uuid;

const P = id('parent');
const C1 = id('child-1');
const C2 = id('child-2');
const OTHER = id('other');

describe('planBulkCompletion (01§20 «Bulk completion hierarchy»)', () => {
  it('без родителей с подзадачами — подтверждение не нужно, план равен выбору', () => {
    const plan = planBulkCompletion([OTHER, C1], new Map());

    expect(plan.orderedIds).toEqual([OTHER, C1]);
    expect(plan.additionalChildCount).toBe(0);
    expect(plan.needsConfirmation).toBe(false);
  });

  it('выбран родитель — его активные подзадачи добавляются каскадом и считаются в подтверждении', () => {
    const plan = planBulkCompletion([P], new Map([[P, [C1, C2]]]));

    expect(plan.additionalChildCount).toBe(2);
    expect(plan.needsConfirmation).toBe(true);
    // Дети раньше родителя: `01§8` запрещает даже промежуточное состояние
    // «завершённый родитель с активным ребёнком».
    expect(plan.orderedIds).toEqual([C1, C2, P]);
  });

  it('ребёнок, выбранный ЯВНО и попавший через родителя, применяется один раз и не удваивает счётчик', () => {
    const plan = planBulkCompletion([P, C1], new Map([[P, [C1, C2]]]));

    // C1 выбран руками — в «дополнительных» он не считается, человек про
    // него уже знает. Дополнительный только C2.
    expect(plan.additionalChildCount).toBe(1);
    // И в плане он ровно один раз.
    expect(plan.orderedIds.filter((x) => x === C1)).toHaveLength(1);
    expect(new Set(plan.orderedIds).size).toBe(plan.orderedIds.length);
    // Порядок между самими детьми не нормирован — нормировано только то,
    // что оба идут раньше родителя.
    expect(plan.orderedIds.indexOf(C1)).toBeLessThan(plan.orderedIds.indexOf(P));
    expect(plan.orderedIds.indexOf(C2)).toBeLessThan(plan.orderedIds.indexOf(P));
  });

  it('родитель и ВСЕ его подзадачи выбраны явно — подтверждение всё равно показывается, но «дополнительных» ноль', () => {
    // Регрессия, найденная живым прогоном M37: триггер подтверждения по
    // `01§20` — наличие в выборе родителя с активными прямыми подзадачами,
    // а НЕ ненулевой каскад. Раньше этот случай завершал иерархию молча.
    const plan = planBulkCompletion([P, C1, C2], new Map([[P, [C1, C2]]]));

    expect(plan.needsConfirmation).toBe(true);
    expect(plan.additionalChildCount).toBe(0);
    expect(plan.orderedIds.indexOf(C1)).toBeLessThan(plan.orderedIds.indexOf(P));
    expect(plan.orderedIds.indexOf(C2)).toBeLessThan(plan.orderedIds.indexOf(P));
  });

  it('родитель БЕЗ активных подзадач в выборе — подтверждение не нужно', () => {
    // Обратная сторона того же правила: пустой список детей — не иерархия.
    const plan = planBulkCompletion([P], new Map([[P, []]]));

    expect(plan.needsConfirmation).toBe(false);
    expect(plan.orderedIds).toEqual([P]);
  });

  it('выбран только ребёнок — родитель НЕ завершается: каскад идёт сверху вниз, не снизу вверх', () => {
    const plan = planBulkCompletion([C1], new Map([[P, [C1, C2]]]));

    expect(plan.orderedIds).toEqual([C1]);
    expect(plan.additionalChildCount).toBe(0);
    expect(plan.needsConfirmation).toBe(false);
  });

  it('повторы в самом выборе схлопываются', () => {
    const plan = planBulkCompletion([OTHER, OTHER], new Map());

    expect(plan.orderedIds).toEqual([OTHER]);
  });

  it('два родителя с общим набором детей — каждый ребёнок ровно один раз', () => {
    const P2 = id('parent-2');
    const plan = planBulkCompletion(
      [P, P2],
      new Map([
        [P, [C1]],
        [P2, [C1, C2]],
      ]),
    );

    expect(plan.orderedIds.filter((x) => x === C1)).toHaveLength(1);
    expect(plan.additionalChildCount).toBe(2);
    expect(plan.orderedIds.indexOf(C1)).toBeLessThan(plan.orderedIds.indexOf(P));
    expect(plan.orderedIds.indexOf(C2)).toBeLessThan(plan.orderedIds.indexOf(P2));
  });
});
