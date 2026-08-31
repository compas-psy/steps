import { describe, expect, it } from 'vitest';

import { makeOutboxEntry, makeTask } from '../../src/contract/fixtures.js';
import { createInMemoryStorage } from '../../src/memory/index.js';
import type { DomainMutation } from '../../src/ports/index.js';

/**
 * Задание пакета работ E02.1: "покажи, что попытка записать сущность мимо
 * outbox действительно невозможна — либо не компилируется, либо падает
 * тестом". Здесь — оба слоя, не один:
 *
 *  1. **Не компилируется** — `DomainMutation.outbox` типизирован как
 *     `NonEmptyArray<SyncOutboxEntry>` (`../../src/values.ts`), поэтому
 *     `outbox: []` и вызов вовсе без поля `outbox` — ошибки `tsc`, а не
 *     рантайма. `// @ts-expect-error` ниже сам становится красным тестом:
 *     если когда-нибудь тип ослабят и это снова станет компилироваться,
 *     `tsc` пометит сам `@ts-expect-error` как неиспользуемый и упадёт
 *     (задание E02.1 «Критерий готовности» требует, чтобы `pnpm --filter
 *     @shagi/storage typecheck` был частью зелёного прогона — эта строка
 *     проверяется именно им).
 *  2. **Падает тестом** — рантайм-защита в реализации (`in-memory-storage.ts`
 *     `applyMutationToTables`) на случай вызова из нетипизированного кода
 *     (`as unknown as DomainMutation`, обход границы пакета из JS без типов).
 *
 * Дополнительно: ни у одного репозитория (`../../src/ports/*-repository.ts`)
 * нет метода "просто сохранить сущность" — это проверяется самим тем, что
 * этот файл физически не может найти такой метод, чтобы его вызвать; нет
 * отдельного assertion на "отсутствие метода" — TypeScript уже не даёт
 * написать `storage.tasks.save(...)`, что и есть форма API, о которой
 * говорит задание.
 */
describe('мимо outbox сущность не записать', () => {
  it('не компилируется: пустой outbox', () => {
    const task = makeTask();
    const mutationWithEmptyOutbox: DomainMutation = {
      writes: [{ entity: 'task', value: task }],
      // @ts-expect-error — `outbox: []` не соответствует `NonEmptyArray<SyncOutboxEntry>`.
      outbox: [],
    };
    expect(mutationWithEmptyOutbox.outbox).toEqual([]);
  });

  it('не компилируется: поле outbox отсутствует вовсе', () => {
    const task = makeTask();
    // @ts-expect-error — `outbox` обязателен, у `DomainMutation` нет другого
    // способа передать мутацию без него.
    const mutationWithoutOutbox: DomainMutation = {
      writes: [{ entity: 'task', value: task }],
    };
    expect(mutationWithoutOutbox.writes).toHaveLength(1);
  });

  it('падает тестом: та же попытка в обход типов (as unknown) отклоняется рантайм-проверкой', async () => {
    const storage = createInMemoryStorage();
    const task = makeTask();
    const bypassedMutation = {
      writes: [{ entity: 'task', value: task }],
      outbox: [],
    } as unknown as DomainMutation;

    await expect(
      storage.runTransaction(async (tx) => {
        await tx.applyMutation(bypassedMutation);
      }),
    ).rejects.toThrow(/outbox/);

    await expect(storage.tasks.findById(task.id)).resolves.toBeNull();
  });

  it('падает тестом: outbox с одной записью — контрольная группа, подтверждает, что запрет именно на пустоту, а не на applyMutation вообще', async () => {
    const storage = createInMemoryStorage();
    const task = makeTask();

    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: task }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });

    await expect(storage.tasks.findById(task.id)).resolves.not.toBeNull();
  });
});
