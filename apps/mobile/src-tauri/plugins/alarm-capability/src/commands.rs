use tauri::{command, AppHandle, Runtime, State};

use crate::{AlarmCapability, Result};

#[command]
pub(crate) async fn can_schedule_exact<R: Runtime>(
    _app: AppHandle<R>,
    capability: State<'_, AlarmCapability<R>>,
) -> Result<bool> {
    capability.can_schedule_exact()
}

#[command]
pub(crate) async fn open_exact_alarm_settings<R: Runtime>(
    _app: AppHandle<R>,
    capability: State<'_, AlarmCapability<R>>,
) -> Result<()> {
    capability.open_exact_alarm_settings()
}
