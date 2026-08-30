//! Оболочка ШАГОВ для Windows.
//!
//! SPEC/00 §3: в `apps/*` не должно быть ни одного экрана, ни одной строки
//! продуктовой/бизнес-логики. Здесь и нет — только точка входа и три
//! плагина, которыми `src/platform.ts` реализует `GlobalShortcutPort`,
//! `DeepLinkPort` и `SharePort` (`packages/platform/src/index.ts`). Своих
//! Tauri-команд (`invoke_handler`) оболочка не заводит: всё, что нужно,
//! уже даёт JS API официальных плагинов.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .run(tauri::generate_context!())
        .expect("ошибка при запуске оболочки ШАГОВ");
}
