//! Оболочка ШАГОВ для Windows.
//!
//! SPEC/00 §3: в `apps/*` не должно быть ни одного экрана, ни одной строки
//! продуктовой/бизнес-логики. Здесь и нет — только точка входа и три
//! плагина, которыми `src/platform.ts` реализует `GlobalShortcutPort`,
//! `DeepLinkPort` и `SharePort` (`packages/platform/src/index.ts`), плюс
//! команды `sqlite_*` из общего крейта `shagi-sqlite`.
//!
//! Команды SQLite — не бизнес-логика, а ровно платформенная возможность:
//! доступ к файлу нативной SQLite, которого у WebView нет (ADR-0005). Ни
//! схемы, ни SQL приложения в них нет, только транспорт значений. До этого
//! оболочка работала на `kind: 'memory'` и теряла все данные при
//! перезапуске — для local-first продукта это не «временное упрощение», а
//! отсутствие продукта на этой платформе.

use shagi_sqlite::sqlite;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(sqlite::SqliteState::default())
        .invoke_handler(tauri::generate_handler![
            sqlite::sqlite_open,
            sqlite::sqlite_execute,
            sqlite::sqlite_query,
            sqlite::sqlite_snapshot,
            sqlite::sqlite_restore,
            sqlite::sqlite_close,
        ])
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .run(tauri::generate_context!())
        .expect("ошибка при запуске оболочки ШАГОВ");
}
