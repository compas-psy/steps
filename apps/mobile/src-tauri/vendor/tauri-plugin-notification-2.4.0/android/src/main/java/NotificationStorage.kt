// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

package app.tauri.notification

import android.content.Context
import android.content.SharedPreferences
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import org.json.JSONException
import java.lang.Exception

// Key for private preferences
private const val NOTIFICATION_STORE_ID = "NOTIFICATION_STORE"
// Key used to save action types
private const val ACTION_TYPES_ID = "ACTION_TYPE_STORE"

class NotificationStorage(private val context: Context, private val jsonMapper: ObjectMapper) {
  // ШАГИ-ПАТЧ №1 из трёх (см. `PATCH.md` рядом, ADR-0008 дополнение от
  // 2026-09-04) — ПРИЧИНА дефекта, а не его симптом.
  //
  // Было: `editor.putString(key, request.sourceJson.toString())`. Поле
  // `sourceJson` (`Notification.kt`) НИКОГДА никем в этом крейте не
  // заполняется — ни Rust-стороной (`batch` — mobile-only команда, идёт из JS
  // прямо в Kotlin), ни `Invoke.parseArgs` (обычный `readValue`, ничего не
  // инжектит). Для КАЖДОЙ записи, созданной через `batch`, оно `null`, а
  // Kotlin'овский `Any?.toString()` на null-приёмнике даёт СТРОКУ «null» —
  // в SharedPreferences ложился литерал `null`, и persisted-слой плагина был
  // мёртв целиком: `get_pending` падал на нём NPE (патч №3 ниже), а
  // `LocalNotificationRestoreReceiver` молча не восстанавливал НИЧЕГО после
  // перезагрузки устройства (`getSavedNotification` возвращал `null`, запись
  // пропускалась по `?: continue`) — прямое нарушение frozen-требования
  // «после reboot напоминания восстанавливаются без открытия приложения».
  //
  // Стало: сериализуем сам объект — но СВОИМ мапper'ом, а не тем, который
  // передан в конструктор. Причина ровно одна, и она измерена, а не
  // предположена (эксперимент на Jackson 2.15.3 — той самой версии, что
  // объявлена в `tauri-2.11.5/mobile/android/build.gradle.kts:43`):
  //
  //   * записывает эту таблицу `NotificationPlugin` — с мапper'ом
  //     `PluginManager` (`setVisibility(PropertyAccessor.FIELD, ANY)`);
  //   * читают её ОБА ресивера — `LocalNotificationRestoreReceiver` и
  //     `TimedNotificationPublisher` — со СТРОГИМ `ObjectMapper()` по
  //     умолчанию (`TauriNotificationManager.kt`);
  //   * при FIELD-видимости Jackson выдаёт и backing-поля Kotlin, и
  //     bean-имена сразу: `{"isGroupSummary":false,…,"groupSummary":false}`.
  //     Строгий мапper ресивера знает только `groupSummary` и падает на
  //     `isGroupSummary` с `UnrecognizedPropertyException` — мимо
  //     `catch (ex: JSONException)` в `getSavedNotification` ниже, то есть
  //     boot-restore сломался бы ещё грубее, чем до патча.
  //
  // Поэтому пишем мапper'ом с ВИДИМОСТЬЮ ПО УМОЛЧАНИЮ: он выдаёт только
  // bean-имена, и такой JSON читается обратно и строгим `ObjectMapper()`
  // ресиверов, и мапper'ом плагина (`get_pending`) — проверено обоими.
  // `FAIL_ON_EMPTY_BEANS` выключен по одной причине: `extra: JSObject`
  // (наследник `org.json.JSONObject`) не имеет bean-свойств, и НЕпустой
  // `extra` иначе уронил бы саму запись, то есть `batch()`. ШАГИ `extra` не
  // шлют (`notification-bridge.ts`), а чужой непустой `extra` вырождается в
  // `{}` — хуже, чем faithful round-trip, но несравнимо лучше и падения
  // планирования, и прежнего состояния, когда терялась ВСЯ запись целиком.
  //
  // Сохраняется и путь ресивера, который МУТИРУЕТ `schedule.date` для
  // просроченных уведомлений перед повторной записью: сериализуется текущее
  // состояние объекта, а не исходный JSON запроса. И формат записи больше не
  // зависит от того, кто сконструировал `NotificationStorage`.
  private val storageMapper: ObjectMapper =
    ObjectMapper().disable(SerializationFeature.FAIL_ON_EMPTY_BEANS)

  fun appendNotifications(localNotifications: List<Notification>) {
    val storage = getStorage(NOTIFICATION_STORE_ID)
    val editor = storage.edit()
    for (request in localNotifications) {
      if (request.schedule != null) {
        val key: String = request.id.toString()
        editor.putString(key, storageMapper.writeValueAsString(request))
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

  // ШАГИ-ПАТЧ №3 из трёх (см. `PATCH.md` рядом и ADR-0008, дополнение от
  // 2026-09-04) — защита от СИМПТОМА; причину чинит патч №1 выше. Остаётся
  // и после него: чистит legacy-записи `"null"`, которые успели лечь в
  // SharedPreferences со сборок ДО патча №1, и не даёт одной битой записи
  // снова уронить весь `get_pending`.
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