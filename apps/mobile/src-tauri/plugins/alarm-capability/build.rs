const COMMANDS: &[&str] = &["can_schedule_exact", "open_exact_alarm_settings"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .try_build()
        .expect("не собрать tauri-plugin-alarm-capability: см. вывод выше");
}
