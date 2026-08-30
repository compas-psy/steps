// На Android точкой входа служит библиотека (`tauri::mobile_entry_point`);
// этот бинарь нужен, чтобы крейт собирался и проверялся на хосте
// (`cargo check`/`cargo test` под linux — единственное, что проверяемо в
// контейнере без Android SDK/NDK).
fn main() {
    shagi_mobile_lib::run()
}
