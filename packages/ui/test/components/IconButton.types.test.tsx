import { describe, expect, it } from 'vitest';

import { IconButton } from '../../src/index.js';

/**
 * Проверка типизации (§15 «icon button accessible names» — блокер релиза):
 * `IconButton` без `label` не должен компилироваться. По образцу
 * `packages/platform/test/index.test.ts` (`testIncorrectUsageWithoutCheck`)
 * — функция ниже НЕ должна пройти `tsc` без директивы `@ts-expect-error`;
 * реальную гарантию даёт `pnpm --filter @shagi/ui typecheck`, а не этот
 * тест (vitest типы не проверяет) — тест лишь подтверждает, что функция
 * определена, то есть файл вообще скомпилировался (директива была нужна и
 * сработала).
 */
function testIconButtonWithoutLabel() {
  // @ts-expect-error: `label` — обязательный пропс IconButton (доступное имя, §15)
  return <IconButton icon="close" />;
}

describe('IconButton — типизация', () => {
  it('компилятор требует обязательный label (проверяется @ts-expect-error)', () => {
    expect(typeof testIconButtonWithoutLabel).toBe('function');
  });
});
