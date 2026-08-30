//! Оболочка ШАГОВ для Android.
//!
//! SPEC/00 §3: в `apps/*` не должно быть ни одного экрана, ни одной строки
//! продуктовой/бизнес-логики. Единственный подключённый плагин —
//! `tauri-plugin-deep-link`, которым `src/platform.ts` реализует
//! `DeepLinkPort`. `haptics`/`networkStatus` идут через Web API прямо из
//! WebView (`navigator.vibrate`/`navigator.onLine`) — им нативный мост не
//! нужен, поэтому его здесь и нет.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .run(tauri::generate_context!())
        .expect("ошибка при запуске оболочки ШАГОВ");
}
