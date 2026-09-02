/**
 * Мост в НАТИВНУЮ SQLite оболочки и реализация `SqliteDriverPort` поверх
 * него — вторая из двух реализаций порта, предусмотренных ADR-0005
 * («настоящие приложения (Tauri)»).
 *
 * --- Почему не `@tauri-apps/plugin-sql`, как предполагал ADR-0005 ---------
 *
 * ADR-0005 называл официальный плагин направлением и честно отмечал, что
 * проверить его в том контейнере было нечем. Проверка сделана в пакете
 * работ ADR-0005 — и плагин не подходит, по двум измеримым причинам
 * (`tauri-plugin-sql` 2.4.1, исходники прочитаны):
 *
 * 1. Он выставляет ровно четыре команды — `load`, `close`, `execute`,
 *    `select`. Команды транзакции нет ВОВСЕ.
 * 2. Соединение он открывает как `Pool::connect(url)` — пул `sqlx` со
 *    значением по умолчанию `max_connections: 10`. Значит `BEGIN` и
 *    `COMMIT`, отправленные двумя отдельными `execute`, физически могут
 *    уехать на РАЗНЫЕ соединения пула: транзакции через этот плагин
 *    невыразимы в принципе, а не «требуют дисциплины».
 *
 * Для ШАГОВ это не мелочь: весь write-путь построен на том, что сущность и
 * её outbox-запись ложатся ОДНОЙ транзакцией (`00§7`, `ports/transaction.ts`).
 * Хранилище, где транзакция — фикция, не удовлетворяет контракту
 * (`../contract/storage-contract.ts` проверяет откат чтением базы после
 * форсированного сбоя). Поэтому оболочка даёт собственный узкий мост поверх
 * ОДНОГО соединения — см. `apps/mobile/src-tauri/src/sqlite.rs`.
 *
 * --- Что здесь, а что в оболочке -----------------------------------------
 *
 * Здесь: весь SQL, транзакционный протокол, кодирование значений,
 * сериализация вызовов. В оболочке — только транспорт (`invoke`) и
 * нативное соединение. Оболочка не знает ни одного SQL-оператора: правило
 * «в `apps/*` нет бизнес-логики» (SPEC/00 §3) распространяется и на схему.
 *
 * --- Кодирование значений -------------------------------------------------
 *
 * Через IPC ходит JSON, а в JSON нет ни 64-битных целых, ни `bigint`.
 * Между тем ВСЕ целочисленные колонки схемы (`../schema/tables.ts`: типы
 * `integer`/`bigint`/`instant`) читаются доменом как `bigint` — так же, как
 * их отдаёт `node:sqlite` с `readBigInts: true`. Поэтому целые ходят в обе
 * стороны размеченными объектами `{ "i64": "123" }`: `number` потерял бы
 * точность на метках времени в наносекундах (они больше 2^53), а голая
 * строка была бы неотличима от текстовой колонки.
 */
import type { SqliteDriverPort, SqliteParam, SqliteRow } from './driver-port.js';

/** Значение, как оно ходит через IPC. */
export type NativeSqlValue = string | number | boolean | null | { readonly i64: string };

export type NativeSqlRow = Readonly<Record<string, NativeSqlValue>>;

/** Диагностика открытой базы — то, чем Android-смоук доказывает, что
 * backend действительно SQLite, а не что-то другое. */
export interface NativeSqlInfo {
  /** Абсолютный путь файла БД в app-private каталоге. */
  readonly path: string;
  readonly sqliteVersion: string;
  /** Ожидается `wal` (`00§2`). */
  readonly journalMode: string;
  /** Ожидается `true` (`00§2`). */
  readonly foreignKeys: boolean;
  /** Скомпилирован ли движок с FTS5 (`00§2`). */
  readonly fts5: boolean;
}

/**
 * Транспорт до нативной SQLite. Реализуется оболочкой (`apps/mobile`), а
 * не этим пакетом: `@shagi/storage` не имеет права знать про Tauri.
 *
 * Контракт, который обязана обеспечить реализация и без которого
 * транзакции не работают: **все вызовы идут на ОДНО соединение**. Не пул.
 */
export interface NativeSqlBridge {
  open(databaseName: string): Promise<NativeSqlInfo>;
  execute(sql: string, params: readonly NativeSqlValue[]): Promise<void>;
  query(sql: string, params: readonly NativeSqlValue[]): Promise<readonly NativeSqlRow[]>;
  close(): Promise<void>;
  /** Атомарный снимок БД в файл (`VACUUM INTO`) — checkpoint миграций
   * (`02§15`). Возвращает путь снимка. */
  snapshot(): Promise<string>;
  /** Восстановление из снимка, сделанного `snapshot()`. */
  restore(snapshotPath: string): Promise<void>;
}

function encodeParam(value: SqliteParam): NativeSqlValue {
  if (value === null) return null;
  if (typeof value === 'bigint') return { i64: value.toString() };
  if (typeof value === 'string' || typeof value === 'number') return value;
  throw new TypeError(
    'NativeSqlBridge: значения BLOB через мост не поддерживаются — ' +
      'ни одна колонка замороженной схемы (`schema/tables.ts`) не имеет типа blob. ' +
      'Появится такая колонка — мост придётся расширить осознанно, а не молча.',
  );
}

function decodeValue(value: NativeSqlValue): SqliteParam {
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return BigInt(value.i64);
}

function decodeRow(row: NativeSqlRow): SqliteRow {
  const decoded: Record<string, SqliteParam> = {};
  for (const [column, value] of Object.entries(row)) decoded[column] = decodeValue(value);
  return decoded;
}

/**
 * `SqliteDriverPort` поверх моста.
 *
 * **Сериализация транзакций.** У драйвера ОДНО нативное соединение, а
 * `BEGIN`/`COMMIT` — отдельные вызовы через IPC. Если две транзакции
 * начнутся одновременно, вторая `BEGIN` придёт внутрь первой и `COMMIT`
 * первой закроет обе. Поэтому `transaction()` выстраивается в очередь
 * обещаний: следующая ждёт завершения предыдущей. Вложенные вызовы
 * (`transaction` внутри `transaction`) очередь НЕ используют — они идут
 * через `SAVEPOINT`, ровно как в `node:sqlite`-драйвере, иначе получилась
 * бы взаимная блокировка сама на себе.
 */
export class BridgedSqliteDriver implements SqliteDriverPort {
  private readonly bridge: NativeSqlBridge;
  private transactionDepth = 0;
  /** Хвост очереди транзакций верхнего уровня. */
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(bridge: NativeSqlBridge) {
    this.bridge = bridge;
  }

  /**
   * Открывает базу и ПРОВЕРЯЕТ обязательные свойства `00§2` вслух: WAL,
   * внешние ключи, FTS5. Нарушение любого — исключение с диагностикой, а не
   * тихая работа на половинчатой базе: смысл перехода на нативную SQLite в
   * том, что она настоящая, а «почти настоящая» неотличима от прежней
   * заглушки ровно до первой потери данных.
   */
  static async open(bridge: NativeSqlBridge, databaseName: string): Promise<BridgedSqliteDriver> {
    const info = await bridge.open(databaseName);
    if (info.journalMode.toLowerCase() !== 'wal') {
      throw new Error(
        `BridgedSqliteDriver: journal_mode=${info.journalMode}, а 00§2 требует WAL. ` +
          `База: ${info.path}`,
      );
    }
    if (!info.foreignKeys) {
      throw new Error(
        `BridgedSqliteDriver: PRAGMA foreign_keys выключен, а 00§2 требует ON. База: ${info.path}`,
      );
    }
    if (!info.fts5) {
      throw new Error(
        'BridgedSqliteDriver: движок SQLite собран без FTS5, а 00§2 требует полнотекстовый ' +
          `поиск. Версия движка: ${info.sqliteVersion}`,
      );
    }
    return new BridgedSqliteDriver(bridge);
  }

  async execute(sql: string, params: readonly SqliteParam[] = []): Promise<void> {
    await this.bridge.execute(sql, params.map(encodeParam));
  }

  async queryAll<Row extends SqliteRow = SqliteRow>(
    sql: string,
    params: readonly SqliteParam[] = [],
  ): Promise<readonly Row[]> {
    const rows = await this.bridge.query(sql, params.map(encodeParam));
    return rows.map((row) => decodeRow(row)) as Row[];
  }

  async queryOne<Row extends SqliteRow = SqliteRow>(
    sql: string,
    params: readonly SqliteParam[] = [],
  ): Promise<Row | null> {
    const rows = await this.queryAll<Row>(sql, params);
    return rows[0] ?? null;
  }

  async transaction<T>(run: () => Promise<T>): Promise<T> {
    if (this.transactionDepth > 0) return this.nested(run);
    const attempt = this.queue.then(
      () => this.topLevel(run),
      () => this.topLevel(run),
    );
    // Очередь не должна «залипнуть» на отказе предыдущей транзакции —
    // поэтому хвост очереди держит проглоченную копию, а вызывающий код
    // получает исходное обещание с его исключением.
    this.queue = attempt.catch(() => undefined);
    return attempt;
  }

  private async topLevel<T>(run: () => Promise<T>): Promise<T> {
    await this.bridge.execute('BEGIN IMMEDIATE', []);
    this.transactionDepth = 1;
    try {
      const result = await run();
      this.transactionDepth = 0;
      await this.bridge.execute('COMMIT', []);
      return result;
    } catch (error) {
      this.transactionDepth = 0;
      await this.bridge.execute('ROLLBACK', []);
      throw error;
    }
  }

  private async nested<T>(run: () => Promise<T>): Promise<T> {
    const name = `sp_${this.transactionDepth}`;
    await this.bridge.execute(`SAVEPOINT ${name}`, []);
    this.transactionDepth += 1;
    try {
      const result = await run();
      this.transactionDepth -= 1;
      await this.bridge.execute(`RELEASE SAVEPOINT ${name}`, []);
      return result;
    } catch (error) {
      this.transactionDepth -= 1;
      await this.bridge.execute(`ROLLBACK TO SAVEPOINT ${name}`, []);
      await this.bridge.execute(`RELEASE SAVEPOINT ${name}`, []);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.bridge.close();
  }
}
