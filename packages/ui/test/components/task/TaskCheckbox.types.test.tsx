import { describe, expect, it } from 'vitest';

import { TaskCheckbox } from '../../../src/components/task/index.js';

/**
 * Проверка типизации, тот же приём что `IconButton.types.test.tsx` (E03.1):
 * `TaskCheckbox` без `label` не должен компилироваться — гарантию даёт
 * `pnpm --filter @shagi/ui typecheck`, этот тест лишь подтверждает, что файл
 * вообще скомпилировался (т.е. директива `@ts-expect-error` была нужна и
 * сработала).
 */
function testTaskCheckboxWithoutLabel() {
  // @ts-expect-error: `label` — обязательный пропс TaskCheckbox (доступное имя)
  return <TaskCheckbox checked={false} onChange={() => {}} />;
}

describe('TaskCheckbox — типизация', () => {
  it('компилятор требует обязательный label (проверяется @ts-expect-error)', () => {
    expect(typeof testTaskCheckboxWithoutLabel).toBe('function');
  });
});
