use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

mod commands;
#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

#[cfg(desktop)]
use desktop::AlarmCapability;
#[cfg(mobile)]
use mobile::AlarmCapability;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
    // `mobile.rs`'s `register_android_plugin()?`/`run_mobile_plugin()?` возвращают
    // `Result<_, PluginInvokeError>`, не `tauri::Error` — без этого варианта `?`
    // там не собирается (`E0277`, поймано только реальной Android-сборкой CI:
    // этот cfg(mobile)-путь не компилируется на голом `cargo check` в песочнице
    // без Android-таргета). `#[cfg(mobile)]` обязателен и на самом варианте —
    // `tauri::plugin::mobile` — это модуль, САМ `#[cfg(mobile)]`-огороженный в
    // `tauri`, его не существует под `cfg(desktop)` (это и уронило desktop-сборку
    // при первой попытке без `cfg`). Тот же вариант и то же `cfg`, что и в
    // `tauri-plugin-notification`'s собственном `src/error.rs`.
    #[cfg(mobile)]
    #[error(transparent)]
    PluginInvoke(#[from] tauri::plugin::mobile::PluginInvokeError),
    #[error("SCHEDULE_EXACT_ALARM capability не поддержана на этой платформе")]
    UnsupportedPlatform,
}

impl serde::Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

pub type Result<T> = std::result::Result<T, Error>;

pub trait AlarmCapabilityExt<R: Runtime> {
    fn alarm_capability(&self) -> &AlarmCapability<R>;
}

impl<R: Runtime, T: Manager<R>> AlarmCapabilityExt<R> for T {
    fn alarm_capability(&self) -> &AlarmCapability<R> {
        self.state::<AlarmCapability<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("alarm-capability")
        .invoke_handler(tauri::generate_handler![
            commands::can_schedule_exact,
            commands::open_exact_alarm_settings
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let capability = mobile::init(app, api)?;
            #[cfg(desktop)]
            let capability = desktop::init(app, api)?;
            app.manage(capability);
            Ok(())
        })
        .build()
}
