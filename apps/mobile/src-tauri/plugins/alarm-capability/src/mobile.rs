use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

const PLUGIN_IDENTIFIER: &str = "ru.cmpas.shagi.alarmcapability";

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<AlarmCapability<R>> {
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "AlarmCapabilityPlugin")?;
    Ok(AlarmCapability(handle))
}

pub struct AlarmCapability<R: Runtime>(PluginHandle<R>);

#[derive(serde::Deserialize)]
struct BoolResponse {
    value: bool,
}

impl<R: Runtime> AlarmCapability<R> {
    pub fn can_schedule_exact(&self) -> crate::Result<bool> {
        self.0
            .run_mobile_plugin::<BoolResponse>("canScheduleExact", ())
            .map(|r| r.value)
            .map_err(Into::into)
    }

    pub fn open_exact_alarm_settings(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<()>("openExactAlarmSettings", ())
            .map_err(Into::into)
    }
}
