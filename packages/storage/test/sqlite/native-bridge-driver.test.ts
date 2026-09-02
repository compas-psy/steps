import { describe, expect, it } from 'vitest';

import { BridgedSqliteDriver } from '../../src/sqlite/native-bridge.js';
import { createFakeNativeBridge } from './support/fake-native-bridge.js';

/**
 * Собственные гарантии драйвера поверх нативного моста (ADR-0005) — то,
 * чего общий контракт хранилища не проверяет, потому что он про
 * `StoragePort`, а не про транспорт под ним.
 */
describe('BridgedSqliteDriver: обязательные свойства базы (00§2)', () => {
  it('падает громко, если journal_mode не WAL', async () => {
    await expect(
      BridgedSqliteDriver.open(createFakeNativeBridge({ reportJournalMode: 'delete' }), 'a.db'),
    ).rejects.toThrow(/journal_mode=delete/);
  });

  it('падает громко, если внешние ключи выключены', async () => {
    await expect(
      BridgedSqliteDriver.open(createFakeNativeBridge({ reportForeignKeys: false }), 'b.db'),
    ).rejects.toThrow(/foreign_keys/);
  });

  it('падает громко, если движок собран без FTS5', async () => {
    await expect(
      BridgedSqliteDriver.open(createFakeNativeBridge({ reportFts5: false }), 'c.db'),
    ).rejects.toThrow(/FTS5/);
  });

  it('открывается, когда все три свойства на месте', async () => {
    const driver = await BridgedSqliteDriver.open(createFakeNativeBridge(), 'd.db');
    await driver.execute('CREATE TABLE probe (id TEXT PRIMARY KEY)');
    await driver.close();
  });
});

describe('BridgedSqliteDriver: значения через IPC', () => {
  it('64-битные целые переживают JSON без потери точности', async () => {
    // Метка времени в наносекундах больше 2^53 — обычный `number` её уже
    // округляет. Ради этого случая целые и ходят размеченными.
    const driver = await BridgedSqliteDriver.open(createFakeNativeBridge(), 'i64.db');
    await driver.execute('CREATE TABLE t (id TEXT PRIMARY KEY, at INTEGER NOT NULL)');
    const nanos = 1_788_369_255_288_254_754n;
    // Через `number` это значение не проходит: double округляет его, и
    // обратное преобразование даёт ДРУГОЕ число. Отсюда и разметка целых.
    expect(BigInt(Number(nanos))).not.toBe(nanos);

    await driver.execute('INSERT INTO t (id, at) VALUES (?, ?)', ['x', nanos]);
    const row = await driver.queryOne<{ at: bigint }>('SELECT at FROM t WHERE id = ?', ['x']);

    expect(typeof row?.at).toBe('bigint');
    expect(row?.at).toBe(nanos);
    await driver.close();
  });

  it('NULL, текст и число возвращаются своими типами', async () => {
    const driver = await BridgedSqliteDriver.open(createFakeNativeBridge(), 'types.db');
    await driver.execute('CREATE TABLE t (id TEXT PRIMARY KEY, note TEXT, ratio REAL)');
    await driver.execute('INSERT INTO t VALUES (?, ?, ?)', ['x', null, 1.5]);
    const row = await driver.queryOne<{ note: string | null; ratio: number }>(
      'SELECT note, ratio FROM t',
    );
    expect(row?.note).toBeNull();
    expect(row?.ratio).toBe(1.5);
    await driver.close();
  });

  it('BLOB отвергается понятной ошибкой, а не молча искажается', async () => {
    const driver = await BridgedSqliteDriver.open(createFakeNativeBridge(), 'blob.db');
    await driver.execute('CREATE TABLE t (id TEXT PRIMARY KEY, data BLOB)');
    await expect(
      driver.execute('INSERT INTO t VALUES (?, ?)', ['x', new Uint8Array([1, 2, 3])]),
    ).rejects.toThrow(/BLOB/);
    await driver.close();
  });
});

describe('BridgedSqliteDriver: транзакции', () => {
  it('откат — настоящий: после сбоя в базе нет ни одной записи транзакции', async () => {
    const driver = await BridgedSqliteDriver.open(createFakeNativeBridge(), 'rollback.db');
    await driver.execute('CREATE TABLE t (id TEXT PRIMARY KEY)');

    await expect(
      driver.transaction(async () => {
        await driver.execute('INSERT INTO t VALUES (?)', ['a']);
        await driver.execute('INSERT INTO t VALUES (?)', ['b']);
        throw new Error('сбой посреди транзакции');
      }),
    ).rejects.toThrow('сбой посреди транзакции');

    const rows = await driver.queryAll('SELECT id FROM t');
    expect(rows).toEqual([]);
    await driver.close();
  });

  it('вложенная транзакция откатывается точкой сохранения, внешняя выживает', async () => {
    const driver = await BridgedSqliteDriver.open(createFakeNativeBridge(), 'savepoint.db');
    await driver.execute('CREATE TABLE t (id TEXT PRIMARY KEY)');

    await driver.transaction(async () => {
      await driver.execute('INSERT INTO t VALUES (?)', ['внешняя']);
      await expect(
        driver.transaction(async () => {
          await driver.execute('INSERT INTO t VALUES (?)', ['вложенная']);
          throw new Error('сбой внутри');
        }),
      ).rejects.toThrow('сбой внутри');
    });

    const rows = await driver.queryAll<{ id: string }>('SELECT id FROM t');
    expect(rows.map((row) => row.id)).toEqual(['внешняя']);
    await driver.close();
  });

  it('две одновременные транзакции верхнего уровня НЕ переплетаются', async () => {
    // Главный риск моста: `BEGIN` и `COMMIT` — отдельные вызовы через IPC.
    // Если вторая транзакция стартует внутри первой, её `COMMIT` закроет
    // обе, и откат первой уже ничего не откатит. Драйвер выстраивает
    // транзакции верхнего уровня в очередь — тест проверяет именно это.
    const driver = await BridgedSqliteDriver.open(createFakeNativeBridge(), 'concurrent.db');
    await driver.execute('CREATE TABLE t (id TEXT PRIMARY KEY)');

    const failing = driver.transaction(async () => {
      await driver.execute('INSERT INTO t VALUES (?)', ['первая']);
      // Отдаём управление циклу событий — именно здесь вторая транзакция
      // и вклинилась бы без очереди.
      await Promise.resolve();
      throw new Error('первая падает');
    });
    const succeeding = driver.transaction(async () => {
      await driver.execute('INSERT INTO t VALUES (?)', ['вторая']);
    });

    await expect(failing).rejects.toThrow('первая падает');
    await succeeding;

    const rows = await driver.queryAll<{ id: string }>('SELECT id FROM t');
    // Первая откатилась целиком, вторая записалась целиком.
    expect(rows.map((row) => row.id)).toEqual(['вторая']);
    await driver.close();
  });

  it('провал одной транзакции не блокирует очередь навсегда', async () => {
    const driver = await BridgedSqliteDriver.open(createFakeNativeBridge(), 'queue.db');
    await driver.execute('CREATE TABLE t (id TEXT PRIMARY KEY)');

    await expect(
      driver.transaction(async () => {
        throw new Error('первая');
      }),
    ).rejects.toThrow('первая');
    await driver.transaction(async () => {
      await driver.execute('INSERT INTO t VALUES (?)', ['после провала']);
    });

    expect(await driver.queryAll('SELECT id FROM t')).toHaveLength(1);
    await driver.close();
  });
});
