import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  NativeSqlBridge,
  NativeSqlInfo,
  NativeSqlRow,
  NativeSqlValue,
} from '../../../src/sqlite/native-bridge.js';

/**
 * Поддельный `NativeSqlBridge` для тестов: настоящая SQLite (`node:sqlite`,
 * одно соединение — как требует контракт моста), поддельный только
 * транспорт. Каждое значение на границе проходит через
 * `JSON.parse(JSON.stringify(...))` — ровно там, где настоящий Tauri IPC
 * теряет точность 64-битных целых, если кодирование сделано неверно.
 *
 * `options` позволяют СЛОМАТЬ обязательные свойства `00§2` (WAL, внешние
 * ключи, FTS5) — чтобы проверить, что `BridgedSqliteDriver.open` падает
 * громко, а не работает на половинчатой базе.
 */
export interface FakeBridgeOptions {
  /** Выключить внешние ключи ПОСЛЕ честного отчёта — для общего контракта
   * (разбор — в `createSqliteStorageForContract`). */
  readonly relaxForeignKeysAfterOpen?: boolean;
  /** Соврать в отчёте про journal_mode. */
  readonly reportJournalMode?: string;
  /** Соврать в отчёте про внешние ключи. */
  readonly reportForeignKeys?: boolean;
  /** Соврать в отчёте про FTS5. */
  readonly reportFts5?: boolean;
}

/** Точка, где значение пересекает IPC. */
export function overIpc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function encodeSqliteValue(value: unknown): NativeSqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return { i64: value.toString() };
  if (typeof value === 'string' || typeof value === 'number') return value;
  throw new TypeError(`фиктивный мост: неожиданный тип значения ${typeof value}`);
}

function decodeParam(value: NativeSqlValue): string | number | bigint | null {
  if (value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return BigInt(value.i64);
  return value;
}

/** Мост поверх `node:sqlite` — одно соединение, как того требует контракт
 * `NativeSqlBridge` (пул сломал бы транзакции, см. его комментарий). */
export function createFakeNativeBridge(options: FakeBridgeOptions = {}): NativeSqlBridge {
  const relaxForeignKeys = options.relaxForeignKeysAfterOpen === true;
  const dir = mkdtempSync(join(tmpdir(), 'shagi-native-'));
  let db: DatabaseSync | null = null;
  let dbPath = '';

  const open = async (databaseName: string): Promise<NativeSqlInfo> => {
    dbPath = join(dir, databaseName);
    db = new DatabaseSync(dbPath, { readBigInts: true });
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    const journal = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    const foreignKeys = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: bigint };
    const version = db.prepare('SELECT sqlite_version() AS v').get() as { v: string };
    const fts5 = db.prepare(`SELECT sqlite_compileoption_used('ENABLE_FTS5') AS used`).get() as {
      used: bigint;
    };
    const info = overIpc({
      path: dbPath,
      sqliteVersion: version.v,
      journalMode: options.reportJournalMode ?? journal.journal_mode,
      foreignKeys: options.reportForeignKeys ?? Number(foreignKeys.foreign_keys) === 1,
      fts5: options.reportFts5 ?? Number(fts5.used) === 1,
    });
    // Внешние ключи выключаются ПОСЛЕ честного отчёта — ровно тем же
    // приёмом и по той же причине, что у `createSqliteStorageForContract`
    // (`src/sqlite/sqlite-storage.ts`, там разбор целиком): несколько
    // тестов общего контракта СОЗНАТЕЛЬНО пишут одну сущность изолированно,
    // ссылаясь на id из таблицы, которую никогда не заполняют, — это цель
    // теста, а не недосмотр. Продуктовый путь послабления не делает: там
    // `PRAGMA foreign_keys=ON` безусловна, и `BridgedSqliteDriver.open`
    // падает, если это не так (проверяется отдельным тестом ниже).
    if (relaxForeignKeys) db.exec('PRAGMA foreign_keys = OFF');
    return info;
  };

  const required = (): DatabaseSync => {
    if (db === null) throw new Error('фиктивный мост: база не открыта');
    return db;
  };

  return {
    open,
    async execute(sql, params) {
      const decoded = overIpc(params).map((value) => decodeParam(value));
      required()
        .prepare(sql)
        .run(...decoded);
    },
    async query(sql, params) {
      const decoded = overIpc(params).map((value) => decodeParam(value));
      const rows = required()
        .prepare(sql)
        .all(...decoded) as Record<string, unknown>[];
      return overIpc(
        rows.map((row) => {
          const encoded: Record<string, NativeSqlValue> = {};
          for (const [column, value] of Object.entries(row)) {
            encoded[column] = encodeSqliteValue(value);
          }
          return encoded as NativeSqlRow;
        }),
      );
    },
    async close() {
      db?.close();
      db = null;
    },
    async snapshot() {
      // `VACUUM INTO` — тот же механизм, что и на нативной стороне: не
      // байты через IPC, а согласованная копия файла (`02§15`).
      const path = `${dbPath}.checkpoint`;
      rmSync(path, { force: true });
      required().exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
      return path;
    },
    async restore(token) {
      // Настоящая проверка токена — на нативной стороне (`sqlite.rs`,
      // юнит-тесты там же). Здесь токен фиктивного моста — тот же путь,
      // что вернул `snapshot()`: этого достаточно, чтобы проверить
      // TS-плагинг (`createBridgedMigrationCheckpoint`, `BridgedSqliteDriver`),
      // не дублируя security-границу, которая целиком в Rust.
      required().close();
      copyFileSync(token, dbPath);
      db = new DatabaseSync(dbPath, { readBigInts: true });
      db.exec(relaxForeignKeys ? 'PRAGMA foreign_keys = OFF' : 'PRAGMA foreign_keys = ON');
    },
  };
}
