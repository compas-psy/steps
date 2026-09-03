use tauri::{AppHandle, Runtime};

pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: tauri::plugin::PluginApi<R, C>,
) -> crate::Result<AlarmCapability<R>> {
    Ok(AlarmCapability(std::marker::PhantomData))
}

// `PhantomData<fn() -> R>`, а не `PhantomData<R>`: `tauri::Runtime` не требует
// `Send + Sync` от самого R (только его `Handle` обязан быть таким —
// `tauri-runtime-2.x/src/lib.rs`), поэтому голый `PhantomData<R>` не
// удовлетворяет `State<'_, T: Send + Sync>` и `invoke_handler` не собирается.
// `fn() -> R` — стандартная идиома маркера, всегда `Send + Sync` независимо от R.
pub struct AlarmCapability<R: Runtime>(std::marker::PhantomData<fn() -> R>);

impl<R: Runtime> AlarmCapability<R> {
    /// Десктоп не имеет этого механизма (`00§11.1`) — всегда `false`, а не
    /// паника: команда должна отвечать, а не быть недостижимой на этой
    /// платформе, раз уж крейт вообще собирается кросс-платформенно.
    pub fn can_schedule_exact(&self) -> crate::Result<bool> {
        Ok(false)
    }

    pub fn open_exact_alarm_settings(&self) -> crate::Result<()> {
        Err(crate::Error::UnsupportedPlatform)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Единственная host-testable часть этого крейта (`?22` — Android SDK
    // здесь недоступен): чистая логика `desktop.rs`. `mobile.rs` — только
    // JNI-мост, `commands.rs` — тонкая обёртка над `AlarmCapability` через
    // Tauri State, ни то ни другое не имеет смысла юнит-тестировать без
    // реального Tauri App/эмулятора (это делает Task B7/B8, не здесь).
    #[test]
    fn desktop_can_schedule_exact_is_always_false() {
        let capability = AlarmCapability::<tauri::test::MockRuntime>(std::marker::PhantomData);
        assert!(!capability.can_schedule_exact().unwrap());
    }

    #[test]
    fn desktop_open_exact_alarm_settings_is_unsupported() {
        let capability = AlarmCapability::<tauri::test::MockRuntime>(std::marker::PhantomData);
        assert!(matches!(
            capability.open_exact_alarm_settings(),
            Err(crate::Error::UnsupportedPlatform)
        ));
    }
}
