import { describe, expect, it } from 'vitest';

import type { SqliteDriverPort, SqliteRow } from '../../src/sqlite/driver-port.js';

/**
 * `SqliteDriverPort` не имеет реализации в этом пакете работ (ADR-0005,
 * задание E02.1 «Границы») — этот тест лишь подтверждает, что тип
 * компилируется и его форма (набор методов) достаточна, чтобы написать
 * простой мок и убедиться, что вызывающий код может работать через порт, а
 * не через конкретный драйвер.
 */
describe('SqliteDriverPort — форма контракта (ADR-0005)', () => {
  it('минимальный мок удовлетворяет интерфейсу и вызывается стандартно', async () => {
    const rows: SqliteRow[] = [{ id: '1' }];
    const mock: SqliteDriverPort = {
      execute: async () => {},
      queryAll: async <Row extends SqliteRow>() => rows as Row[],
      queryOne: async <Row extends SqliteRow>() => (rows[0] as Row | undefined) ?? null,
      transaction: async (run) => run(),
      close: async () => {},
    };

    await expect(mock.queryAll('select 1')).resolves.toEqual(rows);
    await expect(mock.queryOne('select 1')).resolves.toEqual(rows[0]);
    await expect(mock.transaction(async () => 42)).resolves.toBe(42);
  });
});
