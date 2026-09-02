//! Оболочка ШАГОВ для Android.
//!
//! SPEC/00 §3: в `apps/*` не должно быть ни одного экрана, ни одной строки
//! продуктовой/бизнес-логики. Подключённый плагин один —
//! `tauri-plugin-deep-link`, которым `src/platform.ts` реализует
//! `DeepLinkPort`. `haptics`/`networkStatus` идут через Web API прямо из
//! WebView (`navigator.vibrate`/`navigator.onLine`) — им нативный мост не
//! нужен, поэтому его здесь и нет.
//!
//! Команды `sqlite_*` (`./sqlite.rs`) — не исключение из этого правила, а
//! ровно платформенная возможность: доступ к файлу нативной SQLite, которого
//! у WebView нет. Ни схемы, ни SQL приложения там нет — только транспорт
//! (ADR-0005).

mod sqlite;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .manage(sqlite::SqliteState::default())
        .invoke_handler(tauri::generate_handler![
            sqlite::sqlite_open,
            sqlite::sqlite_execute,
            sqlite::sqlite_query,
            sqlite::sqlite_snapshot,
            sqlite::sqlite_restore,
            sqlite::sqlite_close,
        ])
        .run(tauri::generate_context!())
        .expect("ошибка при запуске оболочки ШАГОВ");
}
