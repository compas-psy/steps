// Точка входа бинаря. Вся сборка Builder'а — в `lib.rs`: так же собирается
// (и проверяется на хосте, если получится) как отдельная библиотека.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    shagi_desktop_lib::run()
}
