# Локальный патч `tauri-plugin-notification` 2.4.0

Это **дословная копия** крейта `tauri-plugin-notification` версии `2.4.0`
с crates.io (тот же `Cargo.toml`, та же лицензия, те же исходники) с **одним**
изменением. Подключается через `[patch.crates-io]` в
`apps/mobile/src-tauri/Cargo.toml`.

Обоснование решения целиком — ADR-0008, дополнение «Task B8 — production-дефект
`tauri-plugin-notification` 2.4.0 (`getPending()` NPE)».

## Единственное изменение

`android/src/main/java/NotificationStorage.kt`, функция
`getSavedNotifications()` — помечена в коде комментарием `ШАГИ-ПАТЧ`.

## Дефект (апстрим, доказан живым прогоном, не предположен)

Android CI `33900673629`: исключение раскрыто полностью через CDP
`Runtime.getProperties` (диагностический раунд):

```
NullPointerException: Attempt to invoke virtual method
'int app.tauri.notification.Notification.getId()' on a null object reference
```

Цепочка (прочитана по коду апстрима):

1. `NotificationStorage.appendNotifications()` пишет
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

Следствие для продукта: падал весь `get_pending`, а с ним — первый шаг
startup-реконсиляции (`NotificationSchedulerPort.listScheduled()`), из-за чего
напоминание, чей OS-alarm пропал (Force Stop), **никогда не восстанавливалось**
при следующем запуске (P0 CONFIRMED, прогон `33872888416`).

## Что делает патч

- `null`-результат разбора не попадает в возвращаемый список — stale-запись
  больше не считается pending;
- сам ключ удаляется штатным внутренним `deleteNotification()` (такая запись
  не может стать валидной сама по себе, а её присутствие ломало **каждый**
  последующий `get_pending`);
- поведение для валидных записей не меняется; исключения разбора
  обрабатываются ровно как раньше (запись пропускается).

Ничего не глушится: broad `catch (Throwable)` не добавлялся, ни один реальный
сбой не превращается в «успех».

## Следствие, которое важно знать (не скрывать)

Раз `sourceJson` не заполняется НИКОГДА (п.2 выше), «stale» по этому критерию
оказывается **каждая** запись, созданную командой `batch`. Значит после патча:

- `get_pending` перестаёт падать (это и есть цель) и стабильно возвращает
  **пустой** список;
- persisted-слой плагина фактически не несёт полезной нагрузки для ШАГОВ —
  ни для `pending()`, ни для `LocalNotificationRestoreReceiver` (тот и до
  патча ничего не восстанавливал: он читает те же записи через
  `getSavedNotification()`, который на литерале `null` возвращает `null`, и
  запись пропускается — `?: continue`, `TauriNotificationManager.kt:555`).

Что от этого НЕ ломается:

- **доставка уведомления** не зависит от этого хранилища — сработавший alarm
  воспроизводит `android.app.Notification`, лежащий Parcelable'ом в extras
  `PendingIntent` (ADR-0008, «Что скорректировано», п.2);
- **восстановление после потери OS-alarm** делает наша собственная
  startup-реконсиляция из SQLite (`reconcileReminderSchedule`), а не
  persisted-слой плагина: `listScheduled()` возвращает пустой список,
  реконсиляция видит «ничего не запланировано» и планирует заново.
  Дублей не возникает — `schedule()` безусловно делает `cancel` по
  детерминированному native id ПЕРЕД `batch` (ADR-0008, инварианты 6 и 7).

То есть SQLite как source of truth (A6) и так несёт всю нагрузку; патч
устраняет падение, а не меняет эту расстановку. Отдельное решение о том,
опираться ли вообще на pending/storage-слой официального плагина, владелец
принимает отдельно — здесь оно не предвосхищается.

## Как обновлять

При переходе на новую версию апстрима: заново скопировать крейт из
`~/.cargo/registry/src/*/tauri-plugin-notification-<версия>/`, проверить,
исправлен ли дефект выше (`sourceJson`/`getSavedNotifications`), и либо снять
патч целиком (если исправлен апстримом), либо перенести это же изменение.
