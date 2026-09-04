# Локальный патч `tauri-plugin-notification` 2.4.0

Это **дословная копия** крейта `tauri-plugin-notification` версии `2.4.0`
с crates.io (тот же `Cargo.toml`, та же лицензия, те же исходники) с **тремя**
точечными изменениями в Kotlin-слое. Подключается через `[patch.crates-io]` в
`apps/mobile/src-tauri/Cargo.toml`.

Обоснование решения целиком — ADR-0008, дополнение «Task B8 — production-дефект
`tauri-plugin-notification` 2.4.0 (`getPending()` NPE)».

## Изменения (каждое помечено в коде комментарием `ШАГИ-ПАТЧ №N`)

| № | Файл | Место | Что чинит |
| - | ---- | ----- | --------- |
| 1 | `android/.../NotificationStorage.kt` | `appendNotifications()` | **причина**: в SharedPreferences писался литерал `null` вместо записи |
| 2 | `android/.../NotificationSchedule.kt` | `NotificationScheduleSerializer.serialize()` | потеря `allowWhileIdle` при round-trip |
| 3 | `android/.../NotificationStorage.kt` | `getSavedNotifications()` | **симптом**: одна битая запись роняла весь `get_pending` |

## Дефект (апстрим, доказан живым прогоном, не предположен)

Android CI `33900673629`: исключение раскрыто полностью через CDP
`Runtime.getProperties` (диагностический раунд):

```
NullPointerException: Attempt to invoke virtual method
'int app.tauri.notification.Notification.getId()' on a null object reference
```

Цепочка (прочитана по коду апстрима):

1. `NotificationStorage.appendNotifications()` писала
   `request.sourceJson.toString()`.
2. Поле `Notification.sourceJson` (`Notification.kt:38`) в этом крейте
   **никем никогда не заполняется** — для записей, созданных командой
   `batch` (единственный путь планирования у ШАГОВ, ADR-0008, инвариант 1),
   оно всегда `null`.
3. Kotlin'овский `Any?.toString()` на null-приёмнике возвращает **строку**
   `"null"` — в `SharedPreferences` ложится литерал `null`.
4. `getSavedNotifications()` читает его обратно: Jackson штатно, **без
   исключения**, десериализует JSON-литерал `null` в Kotlin `null` —
   существующий `catch (_: Exception)` его не ловит, потому что ловить
   нечего.
5. `null` попадал в `ArrayList<Notification>`; дальше
   `Notification.buildNotificationPendingList()` (`Notification.kt:87`)
   разыменовывал его на `notification.id`.

Следствия для продукта было два, и второе тяжелее первого:

- падал весь `get_pending`, а с ним — первый шаг startup-реконсиляции
  (`NotificationSchedulerPort.listScheduled()`), из-за чего напоминание, чей
  OS-alarm пропал (Force Stop), **никогда не восстанавливалось** при
  следующем запуске (P0 CONFIRMED, прогон `33872888416`);
- `LocalNotificationRestoreReceiver` после реальной перезагрузки устройства
  **не восстанавливал НИЧЕГО**: он читает те же записи через
  `getSavedNotification()`, который на литерале `null` возвращает `null`, и
  запись молча пропускается (`?: continue`, `TauriNotificationManager.kt:555`).
  Это прямое нарушение frozen-требования «после reboot напоминания
  восстанавливаются без открытия ШАГОВ».

## Патч №1 — причина, путь записи

`appendNotifications()` сериализует сам объект `Notification`, а не
несуществующий `sourceJson`. Использован **собственный** `ObjectMapper` с
видимостью по умолчанию, а не переданный в конструктор, и это не вкусовщина,
а измеренный факт (эксперимент на Jackson `2.15.3` — ровно той версии, что
объявлена в `tauri-2.11.5/mobile/android/build.gradle.kts:43`):

- пишет таблицу `NotificationPlugin` — мапper'ом `PluginManager`, у которого
  `setVisibility(PropertyAccessor.FIELD, JsonAutoDetect.Visibility.ANY)`;
- читают её оба ресивера (`LocalNotificationRestoreReceiver`,
  `TimedNotificationPublisher`) — **строгим** `ObjectMapper()` по умолчанию;
- при FIELD-видимости Jackson выдаёт разом и backing-поля Kotlin, и
  bean-имена: `{"isGroupSummary":false,…,"groupSummary":false}`. Строгий
  мапper знает только `groupSummary` и падает на `isGroupSummary` с
  `UnrecognizedPropertyException` — мимо `catch (ex: JSONException)` в
  `getSavedNotification()`.

Замеренный результат по вариантам (writer → reader):

| writer | reader `plain` | reader `plugin` |
| ------ | -------------- | --------------- |
| мапper плагина (FIELD ANY) | **падает** `UnrecognizedPropertyException: isGroupSummary` | ок |
| мапper по умолчанию | ок | ок |

Поэтому пишется мапper'ом по умолчанию: такой JSON читается **любым** из
двух — и сегодняшних, и будущих — читателей. Побочно формат записи перестал
зависеть от того, кто сконструировал `NotificationStorage`.

`SerializationFeature.FAIL_ON_EMPTY_BEANS` выключен ровно по одной причине:
`extra: JSObject` (наследник `org.json.JSONObject`) не имеет bean-свойств, и
непустой `extra` иначе уронил бы саму запись, то есть `batch()`. ШАГИ `extra`
не шлют (`apps/mobile/src/notification-bridge.ts` отправляет только
`id`/`title`/`schedule.at`), а чужой непустой `extra` вырождается в `{}` —
faithful round-trip для него потребовал бы ser/deser-модуля для `JSONObject`
в обоих ресиверах, то есть куда большего расхождения с апстримом. Это
единственное известное ограничение патча, и оно названо здесь, а не скрыто.

## Патч №2 — `allowWhileIdle` в сериализаторе расписания

Апстрим-асимметрия: `NotificationScheduleDeserializer` **читает**
`allowWhileIdle` (поле есть у всех трёх подклассов `NotificationSchedule`), а
`NotificationScheduleSerializer` его **не писал**. Пока persisted-слой был
мёртв, это не проявлялось. Как только записи стали валидными (патч №1), потеря
поля стала бы реальной тихой деградацией:
`TauriNotificationManager.setExactIfPossible()` выбирает по
`schedule.allowWhileIdle()` между `setExactAndAllowWhileIdle(RTC_WAKEUP, …)` и
`setExact(RTC, …)`. То есть восстановленный после reboot alarm перестал бы
будить устройство и обходить Doze, хотя мост явно просит
`allowWhileIdle: true`. Поле добавлено во все три ветки (`at`, `interval`,
`every`).

## Патч №3 — симптом, путь чтения

- `null`-результат разбора не попадает в возвращаемый список — битая запись
  больше не считается pending;
- сам ключ удаляется штатным внутренним `deleteNotification()` (такая запись
  не может стать валидной сама по себе, а её присутствие ломало **каждый**
  последующий `get_pending`);
- поведение для валидных записей не меняется; исключения разбора
  обрабатываются ровно как раньше (запись пропускается).

Патч остаётся нужным и после патча №1: он вычищает legacy-записи `"null"`,
которые успели лечь в `SharedPreferences` со сборок до патча №1, и не даёт
одной битой записи снова уронить весь `get_pending`.

Ничего не глушится: broad `catch (Throwable)` не добавлялся, ни один реальный
сбой не превращается в «успех».

## Что патчи возвращают продукту

`batch()` снова наполняет persisted-слой валидными записями, и вместе с ним
оживают обе функции, ради которых `batch` и был выбран (ADR-0008, инвариант 1):

- `pending()`/`get_pending` отдаёт реальный снимок запланированного —
  на нём стоит content-aware реконсиляция (A6);
- `LocalNotificationRestoreReceiver` восстанавливает alarm'ы после
  `BOOT_COMPLETED` **без открытия ШАГОВ**.

SQLite остаётся source of truth (A6): реконсиляция при старте всё так же
сверяет желаемое с фактическим и досоздаёт недостающее. Дублей не возникает —
`schedule()` безусловно делает `cancel` по детерминированному native id ПЕРЕД
`batch` (ADR-0008, инварианты 6 и 7). Доставка уведомления от этого хранилища
не зависела и не зависит: сработавший alarm воспроизводит
`android.app.Notification`, лежащий Parcelable'ом в extras `PendingIntent`.

## Как обновлять

При переходе на новую версию апстрима: заново скопировать крейт из
`~/.cargo/registry/src/*/tauri-plugin-notification-<версия>/`, проверить,
исправлены ли три дефекта выше (`appendNotifications`/`sourceJson`,
`allowWhileIdle` в сериализаторе, null-запись в `getSavedNotifications`), и
либо снять соответствующий патч (если исправлен апстримом), либо перенести это
же изменение.
