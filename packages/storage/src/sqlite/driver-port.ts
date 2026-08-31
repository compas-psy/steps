/**
 * Порт SQL-драйвера — решение `docs/adr/0005-sqlite-tauri-plugin-node-sqlite.md`.
 *
 * Абстрагирует ИМЕННО привязку к SQLite (не SQLite vs IndexedDB — те две
 * платформы остаются раздельными адаптерами, `00§2`). Две реализации порта
 * (следующий пакет работ, SQLite-адаптер):
 *
 *  - **тесты/CI** — `node:sqlite` (встроен в Node 24, синхронный API,
 *    оборачивается в `Promise.resolve` под этим портом);
 *  - **настоящие приложения (Tauri)** — официальный `@tauri-apps/plugin-sql`
 *    поверх Rust/`sqlx`, вызовы асинхронны через Tauri `invoke` изначально
 *    (webview не имеет доступа к файловой системе/нативным биндингам
 *    напрямую — весь SQL уходит в Rust-процесс и обратно).
 *
 * Форма — общий знаменатель обоих: параметризованные запросы, транзакция
 * как замыкание (не отдельные BEGIN/COMMIT — под Tauri IPC отдельные вызовы
 * не гарантируют, что между ними не встрянет что-то ещё). Ни один класс
 * пока не реализует этот порт — задание пакета работ E02.1 явно запрещает
 * писать сами адаптеры («Границы»); порт объявлен, чтобы решение ADR-0005
 * было формулировкой, по которой можно реализовать код, а не только словами.
 */

export type SqliteParam = string | number | bigint | Uint8Array | null;

export type SqliteRow = Readonly<Record<string, SqliteParam>>;

export interface SqliteDriverPort {
  /** DDL/DML без возврата строк (`CREATE TABLE`, `INSERT`, `PRAGMA`, ...). */
  execute(sql: string, params?: readonly SqliteParam[]): Promise<void>;

  queryAll<Row extends SqliteRow = SqliteRow>(
    sql: string,
    params?: readonly SqliteParam[],
  ): Promise<readonly Row[]>;

  queryOne<Row extends SqliteRow = SqliteRow>(
    sql: string,
    params?: readonly SqliteParam[],
  ): Promise<Row | null>;

  /** Единственный способ выполнить несколько операторов атомарно — прямого
   * `BEGIN`/`COMMIT` порт не выставляет намеренно (см. заголовочный
   * комментарий: под Tauri IPC раздельные вызовы не образуют одну
   * транзакцию сами по себе). */
  transaction<T>(run: () => Promise<T>): Promise<T>;

  close(): Promise<void>;
}
