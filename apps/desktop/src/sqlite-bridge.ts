/**
 * Транспорт до нативной SQLite — реализация `NativeSqlBridge` (`@shagi/app`)
 * поверх Tauri `invoke` (ADR-0005). Дословно тот же файл, что у Android
 * (`apps/mobile/src/sqlite-bridge.ts`): обе оболочки говорят с ОДНИМ общим
 * крейтом `shagi-sqlite`, поэтому и набор `invoke`-имён у них один. Это не
 * дублирование логики — здесь нет логики вовсе, только шесть вызовов; сама
 * реализация живёт в одном месте на две платформы.
 *
 * Здесь НЕТ ни одного SQL-оператора, ни одного имени таблицы и ни одного
 * знания о схеме: всё это принадлежит `@shagi/storage` (SPEC/00 §3 — в
 * `apps/*` нет бизнес-логики). Оболочка отвечает ровно за то, за что
 * отвечает оболочка: дотянуться до платформенной возможности, которой у
 * WebView нет.
 *
 * Соответствие команд — `crates/shagi-sqlite/src/sqlite.rs`. Контракт, который
 * нативная сторона обязана держать и который делает транзакции возможными:
 * все вызовы идут на ОДНО соединение под мьютексом.
 */
import { invoke } from '@tauri-apps/api/core';
import type { NativeSqlBridge, NativeSqlInfo, NativeSqlRow, NativeSqlValue } from '@shagi/app';

export function createNativeSqlBridge(): NativeSqlBridge {
  return {
    open: (databaseName) => invoke<NativeSqlInfo>('sqlite_open', { databaseName }),
    execute: async (sql, params) => {
      await invoke('sqlite_execute', { sql, params: params as NativeSqlValue[] });
    },
    query: (sql, params) =>
      invoke<NativeSqlRow[]>('sqlite_query', { sql, params: params as NativeSqlValue[] }),
    close: async () => {
      await invoke('sqlite_close');
    },
    snapshot: () => invoke<string>('sqlite_snapshot'),
    restore: async (token) => {
      await invoke('sqlite_restore', { token });
    },
  };
}
