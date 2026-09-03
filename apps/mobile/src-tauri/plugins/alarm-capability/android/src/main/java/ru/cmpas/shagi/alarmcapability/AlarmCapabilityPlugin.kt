package ru.cmpas.shagi.alarmcapability

import android.app.Activity
import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * Единственная задача этого плагина: то, чего нет в tauri-plugin-notification
 * (ADR-0008) — узнать ДО планирования, доступен ли точный alarm
 * (`canScheduleExactAlarms()`, Android 12+/API 31+), и открыть системные
 * настройки, если нет (`ACTION_REQUEST_SCHEDULE_EXACT_ALARM`).
 * На API < 31 точные alarm разрешены безусловно — SCHEDULE_EXACT_ALARM
 * появился именно в 31 (`05§3.1`).
 */
@TauriPlugin
class AlarmCapabilityPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun canScheduleExact(invoke: Invoke) {
        val result = JSObject()
        result.put("value", canScheduleExactInternal())
        invoke.resolve(result)
    }

    @Command
    fun openExactAlarmSettings(invoke: Invoke) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                data = Uri.fromParts("package", activity.packageName, null)
            }
            activity.startActivity(intent)
        }
        invoke.resolve()
    }

    private fun canScheduleExactInternal(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val alarmManager = activity.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return alarmManager.canScheduleExactAlarms()
    }
}
