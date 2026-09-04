// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

package app.tauri.notification

import android.content.Context
import android.content.SharedPreferences
import com.fasterxml.jackson.databind.ObjectMapper
import org.json.JSONException
import java.lang.Exception

// Key for private preferences
private const val NOTIFICATION_STORE_ID = "NOTIFICATION_STORE"
// Key used to save action types
private const val ACTION_TYPES_ID = "ACTION_TYPE_STORE"

class NotificationStorage(private val context: Context, private val jsonMapper: ObjectMapper) {
  fun appendNotifications(localNotifications: List<Notification>) {
    val storage = getStorage(NOTIFICATION_STORE_ID)
    val editor = storage.edit()
    for (request in localNotifications) {
      if (request.schedule != null) {
        val key: String = request.id.toString()
        editor.putString(key, request.sourceJson.toString())
      }
    }
    editor.apply()
  }

  fun getSavedNotificationIds(): List<String> {
    val storage = getStorage(NOTIFICATION_STORE_ID)
    val all = storage.all
    return if (all != null) {
      ArrayList(all.keys)
    } else ArrayList()
  }

  // ШАГИ-ПАТЧ (единственное изменение этого вендоренного крейта относительно
  // апстрима 2.4.0; см. `PATCH.md` рядом и ADR-0008, дополнение от 2026-09-04).
  //
  // Апстрим-дефект, доказанный живым прогоном на эмуляторе (Android CI
  // `33900673629`, полностью раскрытое через CDP `Runtime.getProperties`
  // исключение): `getPending()` падал с
  //   NullPointerException: Attempt to invoke virtual method
  //   'int app.tauri.notification.Notification.getId()' on a null object reference
  //
  // Механизм (прочитан по коду, не предположен): `appendNotifications` выше
  // пишет `request.sourceJson.toString()`, а поле `sourceJson`
  // (`Notification.kt`) НИКОГДА никем в этом крейте не заполняется — для
  // записей, созданных через команду `batch`, оно всегда `null`. Kotlin'овский
  // `Any?.toString()` на null-приёмнике даёт СТРОКУ «null», и в
  // SharedPreferences ложится литерал `null`. При обратном чтении Jackson
  // штатно (БЕЗ исключения — поэтому существующий `catch` его не ловит)
  // десериализует JSON-литерал `null` в Kotlin `null`, и прежний код клал
  // этот `null` в `ArrayList<Notification>`. Дальше
  // `Notification.buildNotificationPendingList` разыменовывал его на
  // `notification.id` → NPE, и падал ВЕСЬ `get_pending`, а вместе с ним —
  // вся startup-реконсиляция приложения (`listScheduled()` — её первый шаг).
  //
  // Патч минимален и не меняет семантику для валидных записей: null-результат
  // разбора больше не попадает в список (stale-запись не считается pending), и
  // сам ключ удаляется штатным внутренним `deleteNotification` — такая запись
  // не может стать валидной сама по себе, а её присутствие ломало КАЖДЫЙ
  // последующий `get_pending`. Никаких broad `catch (Throwable)` и глушения
  // реальных ошибок: исключения разбора обрабатываются ровно так же, как и
  // раньше (запись пропускается), просто теперь ещё и вычищается.
  fun getSavedNotifications(): List<Notification> {
    val storage = getStorage(NOTIFICATION_STORE_ID)
    val all = storage.all
    if (all != null) {
      val notifications = ArrayList<Notification>()
      val staleKeys = ArrayList<String>()
      for (key in all.keys) {
        val notificationString = all[key] as String?
        val notification = try {
          jsonMapper.readValue(notificationString, Notification::class.java)
        } catch (_: Exception) {
          null
        }
        if (notification == null) {
          staleKeys.add(key)
          continue
        }
        notifications.add(notification)
      }
      // Удаление ПОСЛЕ обхода, не внутри: `storage.all` отдаёт снимок, а
      // менять само хранилище во время его обхода — лишний повод для
      // сомнений там, где отложенная чистка стоит одну строку.
      for (key in staleKeys) {
        deleteNotification(key)
      }
      return notifications
    }
    return ArrayList()
  }

  fun getSavedNotification(key: String): Notification? {
    val storage = getStorage(NOTIFICATION_STORE_ID)
    val notificationString = try {
      storage.getString(key, null)
    } catch (ex: ClassCastException) {
      return null
    } ?: return null

    return try {
      jsonMapper.readValue(notificationString, Notification::class.java)
    } catch (ex: JSONException) {
      null
    }
  }

  fun deleteNotification(id: String?) {
    val editor = getStorage(NOTIFICATION_STORE_ID).edit()
    editor.remove(id)
    editor.apply()
  }

  private fun getStorage(key: String): SharedPreferences {
    return context.getSharedPreferences(key, Context.MODE_PRIVATE)
  }

  fun writeActionGroup(actions: List<ActionType>) {
    for (type in actions) {
      val editor = getStorage(ACTION_TYPES_ID + type.id).edit()
      editor.clear()
      editor.putInt("count", type.actions.size)
      for (i in 0 until type.actions.size) {
        val action = type.actions[i]
        editor.putString("id$i", action.id)
        editor.putString("title$i", action.title)
        editor.putBoolean("input$i", action.input ?: false)
      }
      editor.apply()
    }
  }

  fun getActionGroup(forId: String): Array<NotificationAction?> {
    val storage = getStorage(ACTION_TYPES_ID + forId)
    val count = storage.getInt("count", 0)
    val actions: Array<NotificationAction?> = arrayOfNulls(count)
    for (i in 0 until count) {
      val id = storage.getString("id$i", "")
      val title = storage.getString("title$i", "")
      val input = storage.getBoolean("input$i", false)

      val action = NotificationAction()
      action.id = id ?: ""
      action.title = title
      action.input = input
      actions[i] = action
    }
    return actions
  }
}