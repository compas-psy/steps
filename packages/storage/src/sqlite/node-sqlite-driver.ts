import { DatabaseSync, type StatementSync } from 'node:sqlite';

import type { SqliteDriverPort, SqliteParam, SqliteRow } from './driver-port.js';

/**
 * `DatabaseSync.prototype.serialize`/`.deserialize` существуют в рантайме
 * Node 24.20.0 этого контейнера (проверено эмпирически при разведке — тот
 * же приём, что и у `docs/adr/0005-*` про `node:sqlite` в целом), но
 * отсутствуют в типах `@types/node@24.13.3`, установленных в этом
 * репозитории (пробел апстрима, не опечатка здесь) — узкое локальное
 * расширение типа вместо `any` на весь `DatabaseSync`.
 */
interface SerializableDatabaseSync {
  serialize(name?: string): Uint8Array;
  deserialize(data: Uint8Array): void;
}

/**
 * Реализация `SqliteDriverPort` (`./driver-port.ts`) поверх встроенного
 * `node:sqlite` (задание пакета работ E02.2, п.1) — кандидат "тесты/CI" из
 * заголовочного комментария порта. `node:sqlite` синхронен целиком (Node 24,
 * `DatabaseSync`); методы порта объявлены `async` только чтобы совпадать по
 * форме с портом (которая рассчитана и на асинхронный Tauri-адаптер) — сама
 * работа с базой каждый раз завершается синхронно до какого-либо `await`
 * внутри этого класса, поэтому наружу не протекает никакой реальной
 * асинхронности (нет гонок с другим кодом этого процесса между `execute` и
 * следующим вызовом).
 *
 * `PRAGMA journal_mode=WAL` и `PRAGMA foreign_keys=ON` включаются при
 * каждом открытии — прямое требование `00§2`, не опция (см. `NodeSqliteDriver.open`).
 */
export class NodeSqliteDriver implements SqliteDriverPort {
  private readonly db: DatabaseSync;
  private readonly statementCache = new Map<string, StatementSync>();
  /** Глубина вложенности `transaction()` — 0 снаружи любой транзакции. Порт
   * не выставляет `BEGIN`/`COMMIT` напрямую (см. заголовочный комментарий
   * `driver-port.ts`), а колбэк-транзакции этого пакета (`../ports/storage-port.ts`
   * `runTransaction`, `./sqlite-storage.ts`) сами по себе не вкладываются —
   * глубина > 1 достижима только если код ВНУТРИ уже открытой транзакции
   * зачем-то снова вызовет `driver.transaction(...)`; SAVEPOINT здесь —
   * защита на этот случай, а не ожидаемый основной путь. */
  private transactionDepth = 0;

  private constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** `path` — путь к файлу БД либо `:memory:`. WAL реально включается
   * только у файловой БД (`PRAGMA journal_mode` для `:memory:` всегда
   * возвращает `memory`, см. `test/sqlite/wal-and-foreign-keys.test.ts`) —
   * это ограничение самого SQLite, не этого класса. */
  static open(path: string): NodeSqliteDriver {
    const db = new DatabaseSync(path, { readBigInts: true });
    const driver = new NodeSqliteDriver(db);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    return driver;
  }

  private statement(sql: string): StatementSync {
    let stmt = this.statementCache.get(sql);
    if (stmt === undefined) {
      stmt = this.db.prepare(sql);
      this.statementCache.set(sql, stmt);
    }
    return stmt;
  }

  async execute(sql: string, params: readonly SqliteParam[] = []): Promise<void> {
    this.statement(sql).run(...params);
  }

  async queryAll<Row extends SqliteRow = SqliteRow>(
    sql: string,
    params: readonly SqliteParam[] = [],
  ): Promise<readonly Row[]> {
    return this.statement(sql).all(...params) as Row[];
  }

  async queryOne<Row extends SqliteRow = SqliteRow>(
    sql: string,
    params: readonly SqliteParam[] = [],
  ): Promise<Row | null> {
    const row = this.statement(sql).get(...params);
    return (row as Row | undefined) ?? null;
  }

  async transaction<T>(run: () => Promise<T>): Promise<T> {
    const depth = this.transactionDepth;
    const savepointName = `sp_${depth}`;
    if (depth === 0) {
      this.db.exec('BEGIN IMMEDIATE');
    } else {
      this.db.exec(`SAVEPOINT ${savepointName}`);
    }
    this.transactionDepth = depth + 1;

    try {
      const result = await run();
      this.transactionDepth = depth;
      if (depth === 0) {
        this.db.exec('COMMIT');
      } else {
        this.db.exec(`RELEASE SAVEPOINT ${savepointName}`);
      }
      return result;
    } catch (error) {
      this.transactionDepth = depth;
      // Настоящий откат — `ROLLBACK`/`ROLLBACK TO SAVEPOINT`, не эмуляция:
      // проверяется `test/sqlite/transaction-rollback.test.ts`, читая
      // состояние базы напрямую после форсированного сбоя посреди мутации.
      if (depth === 0) {
        this.db.exec('ROLLBACK');
      } else {
        this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        this.db.exec(`RELEASE SAVEPOINT ${savepointName}`);
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    this.statementCache.clear();
    this.db.close();
  }

  /**
   * Синхронное исполнение DDL/утилитарного SQL без параметров — используется
   * ТОЛЬКО материализацией схемы (`./migrations.ts`) и быстрым синхронным
   * путём общего контракта (`./sqlite-storage.ts` `createSqliteStorageForContract`,
   * см. его комментарий о том, почему обычный async-протокол миграций там не
   * подходит). Не часть `SqliteDriverPort` — контракт порта сознательно весь
   * асинхронный (ради будущего Tauri-адаптера), а этот метод — деталь именно
   * `node:sqlite`-реализации.
   */
  execSync(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Атомарный снимок/восстановление БД (`02§15`: "native atomic DB
   * backup/checkpoint") — используется протоколом миграций (`./migrations.ts`
   * `sqliteMigrationCheckpoint`) как `MigrationCheckpointPort` для этого
   * драйвера. Не часть `SqliteDriverPort` по той же причине, что и `execSync`.
   */
  snapshot(): Uint8Array {
    return (this.db as unknown as SerializableDatabaseSync).serialize();
  }

  restoreFromSnapshot(bytes: Uint8Array): void {
    this.statementCache.clear();
    (this.db as unknown as SerializableDatabaseSync).deserialize(bytes);
    // `PRAGMA foreign_keys` — per-connection, не переживает `deserialize`
    // (который подменяет содержимое этого же соединения) сам по себе;
    // `journal_mode=WAL`, наоборот, записан в заголовок файла-образа и
    // восстанавливается вместе с байтами снимка — переустанавливать не нужно.
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  /** Только для диагностики/тестов специфики SQLite (WAL, `sqlite_master`)
   * — не часть `SqliteDriverPort`. */
  pragma(name: string): SqliteRow | null {
    return (this.db.prepare(`PRAGMA ${name}`).get() as SqliteRow | undefined) ?? null;
  }
}
