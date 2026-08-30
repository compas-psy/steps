import { describe, expect, it } from 'vitest';

import { t } from '../src/index.js';

/**
 * Ключи выводятся из каталога (`catalog.ts`: `keyof typeof CATALOG_RU_RU[N]`),
 * а не дублируются вручную в отдельном списке типов. Эти проверки — не про
 * рантайм: если убрать `@ts-expect-error`, `pnpm typecheck` должен упасть —
 * это и есть доказательство, что несуществующий ключ не компилируется.
 * `it.skip` — тела намеренно не выполняются (незачем дважды бросать
 * рантайм-ошибку отсутствующего ключа, это уже покрыто `missing-key.test.ts`);
 * важен сам факт компиляции файла под `tsc --noEmit`.
 */
describe('типобезопасность ключей (проверяется tsc, не рантаймом)', () => {
  it.skip('несуществующий ключ вообще не компилируется', () => {
    // @ts-expect-error — такого ключа нет ни в одном namespace каталога
    t('common', 'this.key.does.not.exist');
  });

  it.skip('ключ одного namespace недопустим для другого — namespace тоже типобезопасен', () => {
    // @ts-expect-error — "count" существует в namespace "tasks", не в "common"
    t('common', 'count');
  });

  it.skip('несуществующий namespace тоже не компилируется', () => {
    // @ts-expect-error — такого namespace нет в CATALOG_RU_RU
    t('does-not-exist', 'anything');
  });

  it('реальный ключ компилируется и работает — контрольная проверка на ложные "expect-error"', () => {
    expect(t('common', 'list.empty')).toBe('Здесь пока нет задач.');
  });
});
