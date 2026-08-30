# Domain research — ШАГИ R1 (E00–E12, локальный офлайн-продукт)

Источники (прочитаны целиком): `SPEC/01_PRODUCT_BEHAVIOR_R1.md` (909 строк), `SPEC/02_DATA_MODEL_SYNC.md` (366 строк), `SPEC/11_REFERENCE_BASE.md` (43 строки). Все ссылки ниже — на разделы (`§N`) этих файлов.

---

## 1. Сущности и поля

Источник схемы: `02_DATA_MODEL_SYNC.md §2`. Типы даны как domain-типы (Temporal), не native Date.

### tasks

| Поле | Тип | Обязательность | По умолчанию / правило |
|---|---|---|---|
| id | uuid (UUIDv7) | required | генерируется при создании |
| owner_scope | text | required | "local profile or account scope" — формат не специфицирован (см. §9 открытые вопросы) |
| title | string | required | 1..500 Unicode chars после trim; CR/LF/TAB → один пробел (`01§1`) |
| description | string | optional | 0..100 000 chars, multiline plain text, URL auto-detect (`01§1`) |
| status | enum `active\|completed` | required | default `active` |
| capture_state | enum `inbox\|processed` | required | зависит от origin создания (`01§2`, `01§3`) |
| project_id | uuid? | optional | null допустим и для processed задач |
| section_id | uuid? | optional | требует project_id (`02§2.1`) |
| parent_task_id | uuid? | optional | без циклов; глубина ≤1 для user-created (`02§2.1`) |
| rank | string (fractional) | required | генерируется между соседями (`02§5`) |
| priority | int 1..4 | required | default 4 |
| focus_date | PlainDate? | optional | null либо == planned_date (`02§2.1`) |
| day_bucket | enum `default\|later` | required | default `default`; `later` требует Planned Date (`02§2.1`) |
| available_from | PlainDate? | optional | — |
| planned_date | PlainDate? | optional | — |
| planned_time | PlainTime? | optional | floating local; требует planned_date (`02§2.1`) |
| duration_min | int? 1..1440 | optional | — |
| deadline_date | PlainDate? | optional | — |
| deadline_time | PlainTime? | optional | null = date-only дедлайн |
| series_id | uuid? | optional | только для top-level recurring Task в R1 |
| occurrence_seq | bigint? | optional | стабильный номер генерации в серии |
| generated_from_occurrence_id | uuid? | optional | для atomic undo/audit цепочки повтора |
| original_project_name_snapshot | text? | optional | снимок для истории после удаления проекта |
| original_section_name_snapshot | text? | optional | снимок для истории после удаления секции |
| source | enum `user\|import\|recurrence\|vector\|future` | required | происхождение задачи |
| source_channel | enum? `text\|voice\|file\|image\|share` | optional | будущее (Vector) provenance |
| source_capture_batch_id | uuid? | optional | opaque cross-app корреляция (без указателя на аудио) |
| source_intent_id | uuid? | optional | идемпотентность/provenance одного routed intent |
| created_at | Instant | required | — |
| updated_at | Instant | required | — |
| completed_at | Instant? | optional | consistent со status (`02§2.1`) |
| completion_kind | enum? `done\|skipped` | optional | null пока active; `done` для обычного завершения, `skipped` для пропуска повтора (`02§2.1`) |
| deleted_at | Instant? | optional | tombstone, не user-visible статус (`02§1`) |
| revision | bigint | required | — |
| clocks | json | required | per-field HLC |

### projects
id (uuid), title (1..120), description (0..10 000), color_token (controlled palette, не произвольный hex), icon (curated/none), default_view (`list\|board`), favorite (bool), archived_at (Instant?), rank, timestamps, clocks, deleted_at. (`01§1`, `01§12`, `02§2`)

### sections
id, project_id (required), title (1..80), rank, clocks, deleted_at.

### labels
id, normalized_name, display_name, color_token?, rank, clocks, deleted_at. Уникальность: case-insensitive после Unicode normalization в user scope (`01§1`).

### task_labels
task_id, label_id, add_hlc, remove_hlc. Связь существует, когда `add_hlc > remove_hlc` (OR-set, `02§8`).

### checklist_items
id, task_id, text, done (bool), rank, clocks, deleted_at. Max 200 items/task (`01§1`).

### reminders
id, task_id, kind (enum `explicit\|deadline_approaching\|deadline_missed`), local_rule_json, enabled (bool), scheduled_fingerprint. Max 1 explicit reminder в R1 UI (`01§1`).

### recurrence_series
id, anchor_type (enum `scheduled\|completion`), rrule?, completion_interval_json?, template_json, active (bool), next_occurrence_seq, stop_after_occurrence_seq?, template_revision, clocks, timestamps.

### attachments
id, task_id, display_name, mime, size, sha256, local_uri?, object_key?, state (enum `local_pending\|uploading\|synced\|failed\|deleted`), timestamps. Max 10/task (`01§1`, `01§24`).

### task_links
id, task_id, url, display_label?, timestamps. Max 20/task (`01§1`). Разрешённые схемы: `https, http, mailto, tel`; прочие требуют explicit confirmation (`01§25`).

### import_batches
id, source, started_at, finished_at, rollback_deadline, status, report_json.

### sync_outbox
op_id, device_id, entity_type, entity_id, patch_json, field_clocks_json, base_revision, created_at, retry_count.

### sync_conflicts
id, entity_type, entity_id, field, local_value, remote_value, winner_value, local_clock, remote_clock, resolved_at.

### (R3, вне охвата волны, но присутствует в схеме) vector_capture_batches
id, created_at, source_channel (`voice|text|file|image|share`), intent_count, resolution_state (enum `resolved\|needs_review\|partial_failure`), expires_at?. Без raw audio (`02§2.2`).

### Все enum'ы (сводно)

| Enum | Значения | Где |
|---|---|---|
| tasks.status | active, completed | §2 |
| tasks.capture_state | inbox, processed | §2 |
| tasks.day_bucket | default, later | §2 |
| tasks.source | user, import, recurrence, vector, future | §2 |
| tasks.source_channel | text, voice, file, image, share | §2 |
| tasks.completion_kind | null (active), done, skipped | §2, §2.1 |
| tasks.priority | 1, 2, 3, 4 (int, не строго enum, но замкнутый диапазон; default 4) | §2 |
| projects.default_view | list, board | §2 |
| attachments.state | local_pending, uploading, synced, failed, deleted | §2 |
| reminders.kind | explicit, deadline_approaching, deadline_missed | §2 |
| recurrence_series.anchor_type | scheduled, completion | §2 |
| vector_capture_batches.resolution_state (R3) | resolved, needs_review, partial_failure | §2.2 |
| vector_capture_batches.source_channel (R3) | voice, text, file, image, share | §2.2 |

---

## 2. Инварианты (валидатор — локально и на входящих sync-мутациях)

Общий контекст: `02_DATA_MODEL_SYNC.md §11.1` требует, чтобы перед принятием/merge удалённого патча общий валидатор проверял ownership/scope, Project/Section/Parent relations, hierarchy, temporal rules, recurrence top-level restriction и creation entitlements; невалидная мутация отклоняется со стабильным error code и никогда не сохраняется как невалидный server snapshot; клиент держит отклонённую операцию actionable до починки. Ниже — конкретный список правил, которые обязан покрывать этот единый валидатор (доменный слой, общий для локальных команд и входящих sync-патчей).

### Блокирующие (reject/cannot save)

1. `planned_time != null` при `planned_date == null` — блокируется (`01§5`, `02§2.1`).
2. `deadline_time != null` при `deadline_date == null` — блокируется (`01§5`, `02§2.1`).
3. `planned_date < available_from` — блокируется (`01§5`).
4. `deadline < начало дня available_from` — блокируется (`01§5`).
5. `section_id` без `project_id` — недопустимо (`02§2.1`).
6. Прямой child Task обязан иметь тот же Project/Section, что и Parent (`02§2.1`, детализация переноса в `01§12`).
7. Нет цикла в `parent_task_id`; user-created глубина ≤1 (`02§2.1`).
8. Recurring Task обязан быть top-level (`parent_task_id=null`); Subtask не может иметь Повтор; попытка переместить recurring Task под другую Task блокируется, пока повтор не снят (`01§11.1`, `02§2.1`).
9. `child capture_state=processed` — дочерняя задача не может быть в inbox (`02§2.1`).
10. `focus_date` — либо null, либо строго равен `planned_date` (`02§2.1`).
11. `day_bucket=later` требует непустой Planned Date (`02§2.1`).
12. Согласованность `status=completed` и `completed_at` (оба заданы/не заданы синхронно) (`02§2.1`).
13. У active Task `completion_kind=null`; у завершённой обычной — `done`; у пропущенного повтора — `skipped` (`02§2.1`).
14. title: 1..500 Unicode chars после trim; CR/LF/TAB нормализуются в один пробел; если после отбрасывания принятых NLP service-токенов не остаётся человекочитаемого текста — сохранение блокируется до появления читаемого заголовка (`01§1`).
15. description: 0..100 000 chars (`01§1`).
16. max 100 прямых subtasks на Task (`01§1`).
17. max 200 checklist items на Task (`01§1`).
18. max 50 labels на Task (`01§1`).
19. max 1 explicit reminder в R1 UI на Task (`01§1`).
20. max 20 links на Task (`01§1`).
21. max 10 attachments на Task (`01§1`).
22. Project: title 1..120, description 0..10 000 (`01§1`).
23. Section title 1..80; Label 1..80 (`01§1`).
24. Label unique case-insensitive после Unicode normalization в user scope (`01§1`).
25. duration_min ∈ [1,1440] когда задан (`01§5`, `02§2`).
26. priority ∈ [1,4] (`02§2`).
27. Free entitlement: 10 активных проектов — gate только на **обычном** create/reactivate 11-го проекта (contextual Pro paywall, без частично созданного проекта); не применяется к import/backup/account-merge — миграция никогда не отбрасывает данные, лишний excess остаётся доступным, гейтится только последующее создание (`01§12`).
28. Технический потолок 500 активных проектов (`01§1`) — отдельно от Free-лимита 10.
29. Ownership/scope: входящая sync-мутация обязана пройти проверку владения записью, отношений Project/Section/Parent, hierarchy, temporal-правил (п.1–13), ограничения "recurring = top-level", и creation entitlements (лимиты выше) — иначе отклоняется со стабильным error code и не попадает в снапшот сервера (`02§11.1`).
30. Whole-series delete boundary: любой occurrence с `occurrence_seq > stop_after_occurrence_seq` подавляется/tombstone-ится **независимо от HLC-порядка** (remove-wins); сама граница мержится по max/remove-wins и не может быть понижена устаревшим клиентом (`01§11.8`, `02§13`).
31. Template revision reconciliation: если materialized occurrence сгенерирован из более старого `template_revision`, а затем приходит более новая правка "Вся серия" — поля, не входящие в `override_fields` этого occurrence, реконсилируются к новому шаблону; completed/skipped история никогда не переписывается (`01§11.8.1`, `02§13`).

### Предупреждающие (save разрешён, но с warning)

32. `planned > deadline` — сохраняется с предупреждением (`01§5`).
33. `planned_time + duration` заканчивается после deadline — сохраняется с предупреждением (`01§5`).
34. reminder назначен после deadline — сохраняется с предупреждением (`01§5`).

### Явно валидные комбинации (не нарушения, валидатор не должен их блокировать)

35. Duration без Time.
36. Deadline без Planned Date.
37. Available From без Planned Date.
38. Задача вовсе без temporal-полей.

Дата-only deadline "истекает" в конце локального дня `23:59:59.999` для целей классификации (missed/overdue) — это не блокирующее правило, а правило интерпретации (`01§5`).

---

## 3. Temporal-модель

Источники: `01§5`, `01§6`, `01§19`, `02§2`.

- **Available From** (`PlainDate|null`) — дата, раньше которой задача не должна планироваться/показываться как доступная; жёстко ограничивает Planned Date и Deadline снизу (см. инварианты 3–4). В Plan UI может показывать лёгкий маркер "станет доступна" на дату доступности — это не отдельная задача и не считается в тотал (`01§14`).
- **Planned Date / Planned Time** (`PlainDate|null` / `PlainTime|null`) — "мягкий" план, определяет попадание в группы Today/Plan и сортировку. Planned Time floating local (не абсолютный instant), требует Planned Date. Удаление Planned Date также удаляет Planned Time, сбрасывает Focus и `day_bucket`, но Duration остаётся (`01§5`).
- **Duration** (int minutes 1..1440) — независим от наличия Time; используется только для сортировки/отображения и для warning "planned_time+duration заканчивается после deadline".
- **Deadline** (`deadline_date` + опциональный `deadline_time`) — "жёсткий" срок. date-only deadline эквивалентен `23:59:59.999` локального дня при классификации missed/overdue. Удаление Deadline удаляет Deadline Time и deadline-derived schedules (уведомления) (`01§5`).
- **Reminder** — explicit (пользовательское время) либо deadline-derived (`deadline_approaching`/`deadline_missed`); подробности в `01§18`.
- **focus_date** — либо null, либо == planned_date; управляет группой "Главное" (max 3/день). Полночь не переносит вчерашний Focus вперёд — то есть, поскольку `focus_date` жёстко привязан к конкретному planned_date, задача автоматически выпадает из "Главное" на новый день без явной очистки поля (см. открытый вопрос §9 — не описано явное обнуление `focus_date` в БД).
- **day_bucket** (`default|later`) — управляет попаданием в "По времени/Сегодня" против "Когда будет время"; переключается только вручную (`Когда будет время` действие → `later`, очищает Planned Time, сохраняет Duration и Planned Date). Назначение Planned Time на Later-задачу сбрасывает bucket в `default`; смена Planned Date тоже сбрасывает bucket в `default` (`01§6`).

### Planned Date vs Deadline, Missed Plan vs Missed Deadline

- **Planned Date** — намерение/план "когда я хочу это сделать"; не блокирует ничего жёстко (можно быть в прошлом).
- **Deadline** — обязательство "к какому сроку это должно быть готово"; участвует в блокирующих инвариантах (не может быть раньше available_from) и в системе уведомлений (`deadline_approaching`/`deadline_missed`).
- **"Не по плану" (Missed Plan)** = `planned_date < today` И deadline ещё не просрочен (`01§6`). Приоритет ниже, чем "Просрочен срок". Массовые действия ("Bulk Today/Tomorrow") никогда не трогают Deadline.
- **"Просрочен срок" (Missed Deadline)** = Deadline passed, active — показывается **независимо от planned_date**, и имеет наивысший приоритет в Today (`01§6`). Нет дефолтного bulk-сдвига дедлайна.

### Смена таймзоны

Task time floats с локальными wall-clock значениями (нет per-task timezone в R1, `01§19`). При смене таймзоны устройства приложение перепланирует локальные напоминания, сохраняя семантику "09:00 = локальные 09:00" в новой таймзоне, и обновляет device timezone на бэкенде для синхронного fallback-канала уведомлений. Даты/времена задач сами по себе **не пересчитываются** — только расписание уведомлений.

---

## 4. Recurrence

Источники: `01§11`, `02§2` (recurrence_series), `02§13`.

### Модель

Серия (`recurrence_series`) + ровно один материализованный активный **top-level** occurrence одновременно (`01§11` intro). Серия хранит `anchor_type` (`scheduled|completion`), `rrule?`/`completion_interval_json?`, `template_json` (относительные offsets, никогда абсолютные значения — `01§11.7`), `active`, `next_occurrence_seq`, `stop_after_occurrence_seq?`, `template_revision`.

Каждый материализованный occurrence хранит `occurrence_seq`, `template_revision_applied`, `override_fields[]`, `generated_from_occurrence_id`.

### Scheduled-якорь (`01§11.3`)

Следующий occurrence = первый слот расписания строго после локального времени completion/skip. Пример: еженедельно по понедельникам, завершено в среду → следующий — следующий понедельник (не эта неделя). Если задача завершена на три недели позже графика → следующий — первый **будущий** слот, а не backlog просроченных копий. Частные правила: monthly day 31 пропускает месяцы без 31 числа; yearly Feb 29 — только в високосные годы; будни = Mon–Fri по локальному календарю.

### Completion-якорь (`01§11.4`)

Следующая planned_date = дата завершения (локальная) + интервал, с `Temporal.overflow:"constrain"` для арифметики месяц/год. Пример: месяц после 31 января → 28/29 февраля.

### Skip текущего occurrence (`01§11.5`)

Действие "Пропустить это повторение" — НЕ tombstone, а историческое завершение:
- текущий occurrence получает `status=completed`, `completion_kind=skipped`, `completed_at=время skip`;
- в истории отображается "Пропущено";
- scheduled-якорь → первый слот после времени skip;
- completion-якорь → локальная дата skip становится якорем следующего интервала;
- поддерживает тот же 6-секундный Undo, что и обычное завершение;
- "Удалить всю серию" останавливает будущую генерацию, но сохраняет completed/skipped историю.

### Скоупы редактирования шаблона (`01§11.6`)

Редактирование шаблона предлагает выбор `Это повторение / Вся серия`:
- "Это повторение" — меняет только текущий граф (occurrence + его дети), становится `override_fields` записью;
- "Вся серия" — меняет текущий + будущий шаблон, инкрементирует `template_revision`;
- завершённая история неизменяема;
- разовый reschedule (просто подвинуть дату) НЕ меняет правило серии.

### Дети (subtasks/checklist) recurring-родителя (`01§11.7`)

- дочерние Subtask не могут сами иметь Повтор;
- имеют стабильные `stable_template_item_id`;
- если у Parent есть Planned Date — template-копируемые даты детей хранятся как **day offset от Parent**; время остаётся floating wall-clock; напоминания относительны occurrence ребёнка;
- если у Parent нет Planned Date — датированные значения ребёнка действуют только для текущего occurrence, UI явно предупреждает, что будущие повторы пересоздадут ребёнка без этих дат;
- редактирование сгенерированного ребёнка в recurring-родителе предлагает `Это повторение / Будущие повторения` для template-копируемых полей.

### Сходимость при конкурентном завершении/удалении

- **Remove-wins boundary** (`01§11.8`, `02§13`): whole-series delete устанавливает `stop_after_occurrence_seq = current_occurrence_seq` (или последнюю намеренно сохранённую); любой occurrence с `occurrence_seq` выше границы подавляется/tombstone-ится **независимо от порядка HLC** — это предотвращает воскрешение N+1 устаревшим офлайн-завершением после удаления всей серии другим устройством.
- **Template revision reconciliation** (`01§11.8.1`, `02§13`): офлайн-устройство может сгенерировать next occurrence из старого шаблона; при получении более новой правки "Вся серия" — не-overridden поля реконсилируются к новому шаблону, override-поля остаются, завершённая/пропущенная история не переписывается.
- **Atomic completion** (`02§13`): одна локальная транзакция — завершить текущий; вычислить первый валидный next occurrence; инкрементировать sequence; сгенерировать детерминированный next-граф; сохранить `generated_from_occurrence_id`; поставить в очередь все операции.

### Undo/Restore

- **Undo completion** (`01§8`, `01§11.9`, `02§13`): сгенерированный next-граф связан с source occurrence через `generated_from_occurrence_id` и удаляется атомарно, если не изменён. Если другое устройство уже изменило next occurrence — remote-работа сохраняется, показывается sync-конфликт вместо потери данных.
- **Restore old recurrence** (`01§11.10`): если нет активного next occurrence → доступно "Отметить снова невыполненной". Если next существует → обычного restore нет, только "Создать отдельную копию" (нерекуррентную).
- **Restore completed hierarchy** (`01§11.11`): набор сценариев в зависимости от состояния Project/Parent (активен/архивирован/удалён) — см. точный список в `01§11.11`; active child под completed Parent никогда не создаётся.

### Детерминированный UUIDv5 (`02§13`)

```
occurrence_id = UUIDv5(namespace=series_id, name="occurrence:" + occurrence_seq)
child_id      = UUIDv5(namespace=occurrence_id, name="subtask:" + stable_template_item_id)
checklist_id  = UUIDv5(namespace=occurrence_id, name="checklist:" + stable_template_item_id)
```
Это исключение из UUIDv7 — гарантирует, что два офлайн-устройства, завершившие один и тот же occurrence, сходятся к одному и тому же следующему графу вместо создания дублей (`02§1`, `02§13`).

---

## 5. Today / Inbox / Plan — правила выборки

### Inbox (`01§2`)

`capture_state = inbox | processed`. Inbox = активные задачи с `capture_state=inbox`.

**Попадает в Inbox:** global/system Quick Add без контекста; Quick Add widget; явный выбор "Входящие"; будущий OS/share/email capture без destination; import-строка, явно оставленная как Inbox.

**Не попадает:** `+` из Today → processed+today; `+` из Plan (выбранная дата) → processed+эта дата; `+` из Project/Section/Board → processed+контекст проекта; onboarding First Task → processed+today.

**Process Inbox actions:** "Сегодня" → planned_date=today+processed; "Дата" → выбранная дата+processed; "Проект" → выбранный проект+processed; "Удалить" → delete; "Пропустить" → остаётся inbox, переход к следующей карточке (порядок "следующей" не специфицирован — см. §9).

### Today — правило "без дублей" (`01§6`)

Одна задача появляется максимум один раз. Precedence (порядок групп, задача попадает в первую подходящую и не дублируется ниже):

1. **Просрочен срок** — Deadline passed, active, показывается независимо от planned_date. Действия: Complete/Reschedule/Change deadline/Open. Без дефолтного bulk-сдвига дедлайна.
2. **Не по плану** — `planned_date < today` и deadline не просрочен. Действия: per-task reschedule; bulk Today/Tomorrow (никогда не меняет Deadline).
3. **Главное** — `focus_date=today`, максимум 3. Undated task → prompt "Запланировать на сегодня и добавить в Главное?". Task на другой дате → prompt переноса на сегодня. Полночь не переносит вчерашний Focus. 4-й Focus → предлагается заменить один из 3.
4. **По времени** — Today + planned_time; сортировка time ASC, затем manual rank.
5. **Сегодня** — Today, без времени, default bucket; manual rank.
6. **Когда будет время** — только ручное действие/drag; никогда не выводится автоматически из группы 4. Действие "Когда будет время" ставит `day_bucket=later`, очищает Planned Time, сохраняет Duration и Planned Date.

### Plan (`01§14`)

Agenda-режим, не полный календарь: хронологические lazy day-группы; compact date strip; выбранная дата навигирует к соответствующей группе; смена даты через picker; drag где надёжно. Available From может показывать лёгкий маркер "станет доступна" (не задача, не считается в тотал). Deadline-only будущая задача без planned_date НЕ изобретается в Plan — она проявляется через фильтры и когда дедлайн просрочен.

### Отображение missed/overdue/completed

- Overdue deadline (просрочен срок) — показывается regardless of planned_date, наивысший приоритет.
- Missed plan (не по плану) — показывается пока deadline не просрочен; иначе перекрывается группой 1.
- Completed — не входит в активные группы Today; при complete задача покидает active list (immediate + 6s Undo, `01§8`).
- Search также покрывает completed tasks отдельно (`01§15`), но обычные списки — только active, кроме явного контекста истории/поиска.

---

## 6. NLP (детерминированный русский парсер, `01§4`)

Без AI/сети. Pipeline: 1) Unicode NFKC → 2) защита quoted spans (`«...»`, `"..."`) от парсинга service-токенов → 3) Lexer → 4) entity candidates → 5) детерминированный precedence → 6) temporal validation → 7) preview chips → 8) accept/reject/edit → 9) принятые service-токены удаляются из title.

### Категории и грамматика

- **Date**: сегодня, завтра, послезавтра; дни недели; "через N дней/недель"; "5 сентября", "05.09", "05.09.2026"; "выходные" → ближайшая суббота; "следующая неделя" → следующий понедельник.
- **Weekday**: "в пятницу" = ближайшая пятница, включая сегодня; "в следующую пятницу" = пятница следующей календарной недели; preview chip всегда показывает точную дату.
- **Time**: "в 11", "11:00", "в 9:30"; "утром/днём/вечером" → настраиваемые предложения по умолчанию 09:00/14:00/19:00.
- **Deadline**: маркер "до <дата/время>" — единственный синтаксис в R1.
- **Duration**: "15 мин", "45 минут", "1 час", "1 ч 30 мин", "полтора часа".
- **Recurrence**: "каждый день"; "по будням"; "каждый понедельник"; "каждое 5 число"; "раз в неделю"; "каждые N дней/недель/месяцев".
- **Project**: `#name`.
- **Label**: `@name`.
- **Priority**: `!1 !2 !3 !4`.

Свободные слова "срочно/важно" НЕ являются control-токенами в R1.

### Разрешение конфликтов / нераспознанное

- Правило "никогда не угадывать молча" — chip обязан показывать точную resolved дату/время; отклонённый chip восстанавливает исходный текст ровно один раз.
- **Time-only без даты**: если есть время, но нет явной/унаследованной даты — если это локальное время ещё ≥ текущей локальной минуты → Today, иначе → Tomorrow; результирующий Date chip всегда показывается явно (видим и редактируем). Если Composer уже унаследовал дату (например, Today), явное время присоединяется к унаследованной дате даже если время в прошлом; унаследованная дата видима и редактируема. Time-only Deadline ("до 11") использует то же правило Today/Tomorrow при отсутствии контекста даты.
- Нераспознанный остаток текста явно не описан отдельным термином в тексте, кроме того что: принятые service-токены удаляются из title (п.9 pipeline), а нераспознанные фрагменты остаются частью читаемого title как есть.

### Требования к корпусу тестов

Golden corpus ≥800 примеров, включая: false positives, quoted spans, границы месяц/год, високосные годы, комбинированные выражения, кириллическая пунктуация (`01§4` конец раздела).

---

## 7. Хранение и запросы

### Схема локальной БД (native, `02§2`, `02§3`)

Таблицы: `tasks, projects, sections, labels, task_labels, checklist_items, reminders, recurrence_series, attachments, task_links, import_batches, sync_outbox, sync_conflicts` (+ будущая R3 `vector_capture_batches`, `02§2.2`).

Индексы SQLite (`02§3`):
- `tasks(status, planned_date)`
- `tasks(status, deadline_date)`
- `tasks(capture_state, status)`
- `tasks(project_id, section_id, status, rank)`
- `tasks(parent_task_id, status, rank)`
- `tasks(focus_date, status)`
- `tasks(series_id, status)`
- `sections(project_id, rank)`
- `task_labels(task_id)`, `task_labels(label_id)`
- FTS5 по title/description задачи + денормализованные project/label searchable-поля.

Search-индекс должен быть rebuildable из канонических строк (`02§3`).

Кросс-строчные ограничения, которые SQLite CHECK не выражает, обеспечиваются транзакционно в репозитории/domain-тестах и server-валидации (`02§2.1`).

### Ranking (полнотекстовый поиск, `01§15`)

Нормализация: Unicode NFKC; case-insensitive; `ё`=`е` при сопоставлении; Russian/Latin; token-prefix + substring. Ранжирование: 1) exact title, 2) title prefix, 3) title token, 4) title substring, 5) project/label, 6) description, 7) при равенстве — active раньше completed. Поиск покрывает tasks, completed tasks, projects, labels, future-available tasks.

### Fractional ranking (`02§5`)

Insert/move генерирует rank между соседями. Renormalize только при превышении порога длины rank, транзакционно, с batch sync. Не обновлять всех соседей на каждый drag.

### Sync lifecycle / outbox (`02§7`)

Локальная команда пишет **entity + outbox атомарно** в одной транзакции. Foreground worker: 1) push ≤500 ops; 2) сервер идемпотентно принимает по `op_id`; 3) возвращает accepted + remote delta/cursor; 4) клиент мержит; 5) курсор продвигается; 6) acked outbox запись удаляется. Retry backoff: 1s, 2s, 5s, 15s, 30s, затем max 5min пока foreground; далее — фоновое платформенное планирование. Сервер назначает монотонный `server_seq`; клиентский курсор непрозрачен (opaque). Bootstrap = сжатый snapshot + курсор, затем дельты.

`sync_outbox` запись содержит: `op_id, device_id, entity_type, entity_id, patch_json, field_clocks_json, base_revision, created_at, retry_count` (`02§2`).

Для recurrence atomic completion — одна локальная транзакция ставит в outbox **все** операции разом (complete current + generate next graph) (`02§13`).

### Merge-правила (`02§8`)

- Скаляр: per-field LWW по HLC.
- Disjoint concurrent changes (например title vs date) — auto-merge.
- Один и тот же user-visible поле: выше HLC побеждает, проигравший уходит в conflict shadow; если причинно-конкурентно и существенно различается — surfaced conflict (выбор A/B или "Сохранить обе" clone где осмысленно).
- Completion + edit: статус и контент независимы — завершённая задача может содержать конкурентно отредактированный контент.
- Delete + edit: delete побеждает по видимости; отредактированный payload сохраняется в tombstone/conflict shadow 90 дней; опциональный restore через conflict UX; без silent resurrection.
- Labels: OR-set семантика.
- Checklist/subtasks: независимые записи с rank.
- Rank: LWW; при совпадающей эффективной позиции — детерминированный ID/device tie order, затем фоновая нормализация.

### Миграции (`02§15`)

Перед локальной миграцией схемы: native — атомарный DB backup/checkpoint; web — versioned IndexedDB upgrade + recovery snapshot для деструктивных изменений. Провал миграции никогда не стирает данные — открывается previous/read-only recovery path с технической ошибкой.

### Tombstones (`02§9`)

После 6-секундного UI Undo окна: локальный tombstone 90 дней; серверный tombstone 90 дней — предотвращает воскрешение устаревшим офлайн-устройством. Удаление аккаунта следует отдельному privacy-deletion lifecycle (не входит в ordinary tombstone retention).

### Schema negotiation (`02§12`)

Каждый sync-запрос включает client schema version. Сервер может вернуть `UPGRADE_REQUIRED`, если клиент не может безопасно интерпретировать данные. Более новый клиент может продолжать local mode с sync на паузе; без деструктивного down-conversion. Сервер поддерживает минимум 2 активные minor client-версии там, где позволяют security/schema.

### Notification reconciliation (`02§14`)

Каждый запуск/background wake сравнивает желаемые schedule fingerprints с OS scheduled notification IDs, отменяет устаревшие и создаёт недостающие. Native horizon: Android/Windows 90 дней; будущий iOS — rolling nearest 50 pending; Web — service worker/push capability где доступно.

---

## 8. Отличия web (IndexedDB) от натива (SQLite)

- **Логическая схема обязана совпадать**: "IndexedDB logical schema mirrors native contracts" (`02§4`) — все таблицы/поля/enum'ы из раздела 1 должны быть отражены идентично.
- **Поиск**: реализация внутри может различаться (FTS5 на native vs собственный движок на IndexedDB), но normalization/ranking/result semantics **обязаны совпадать** с native golden tests (`02§4`, ranking-правила `01§15`) — то есть логику ранжирования придётся реализовать дважды с общими golden-тестами, гарантирующими идентичный результат.
- **Кросс-строчные constraints**, которые не выразить через SQLite CHECK, "enforced transactionally in repository/domain tests and server validation" (`02§2.1`) — так как IndexedDB тем более не имеет декларативных CHECK, весь этот пласт валидации должен жить в общем TS domain-слое, используемом обоими рантаймами (естественный кандидат на shared validator/package).
- **Миграции** различаются механически: native — атомарный DB backup/checkpoint; web — versioned IndexedDB upgrade + recovery snapshot (`02§15`) — то есть два разных механизма миграции с одинаковым контрактом "никогда не терять данные при сбое".
- **Доставка уведомлений** принципиально разная: Android/Windows native builds обязаны доставлять уведомления при закрытом основном UI (через OS scheduling/exact alarms); Android дополнительно проверяет exact-alarm capability и запрашивает/раскрывает доступ только когда нужно. Local-only Web/PWA **не может гарантировать** доставку при закрытом браузере — показывается one-time предупреждение; синхронизированный Web может использовать Web Push/server fallback (`01§18`). Notification horizon тоже разный: Android/Windows 90 дней, будущий iOS — 50 ближайших, Web — service worker/push где доступно (`02§14`).
- **Service worker** обязан никогда не аплоадить/кэшировать пользовательский контент задач в CDN cache (`02§4`) — web-специфичное ограничение, не имеющее аналога на native.
- **Widgets**: Android имеет обязательные Today/Focus/Quick Add виджеты, читающие read-only снапшот, генерируемый core; Web/Windows вместо этого используют install/global shortcuts (`01§28`) — реализуется дважды разными механизмами платформенной интеграции.
- **Что не расходится**: доменные инварианты (раздел 2), temporal-модель, precedence Today/Inbox/Plan, recurrence-логика, NLP-парсер (детерминированный, платформонезависимый) — вся эта логика описана как единый domain-слой без платформенных ветвлений в тексте спецификации.

---

## 9. Открытые вопросы (нужен ADR/решение владельца)

1. **Формат `owner_scope`.** Схема (`02§2`, tasks.owner_scope) говорит только "local profile or account scope", без конкретного формата (строка-идентификатор? UUID локального профиля? как различать local vs account на уровне значения?). `03_BACKEND_API.md` потенциально отвечает, но не входил в обязательное чтение этой волны.
2. **Порядок "следующей" карточки при "Пропустить" в Process Inbox** (`01§2`) не специфицирован (FIFO по created_at? по rank?). Ни один из трёх файлов не даёт правила сортировки очереди Inbox для этого флоу.
3. **Точная семантика системного фильтра "Без даты"** (`01§16`) — по какому полю фильтруется (только planned_date? или planned_date И deadline_date оба null?) не раскрыто; кандидат-ответчик — `12_SCREEN_STATE_MATRIX.md` или `03_BACKEND_API.md` (не читались).
4. **Список принимаемых NLP service-токенов**, из-за которых title может "не остаться человекочитаемым" (`01§1`, `01§4` п.9) — сама грамматика описана (§4), но нет явного перечня, какие конкретно токены/паттерны считаются "service" при проверке "остался ли человекочитаемый текст". Вероятный ответчик — файл с NLP-корпусом/тест-планом (не входил в эту тройку, возможно `06_TESTING_ACCEPTANCE.md`).
5. **Обнуление `focus_date` на новый день.** `01§6` говорит "Midnight does not carry yesterday Focus forward", но нет явного правила: очищается ли поле `focus_date` в БД в полночь (фоновой job'ой), или оно просто перестаёт совпадать с `today` и естественно выпадает из выборки "Главное" (т.к. инвариант требует `focus_date == planned_date`, а не `== today`). Если planned_date не менялся, `focus_date` формально остаётся равным старому planned_date, что валидно по инварианту 10, но неясно, что при этом значит "фокус" на прошедшую дату (нужно ли обнулять явно?). Ни `01`, ни `02` explicit job/trigger для этого не описывают.
6. **Алгоритм fractional rank.** `02§2` типизирует `rank` как "text | fractional", `02§5` описывает поведение (insert between neighbors, renormalize по threshold), но не конкретный алгоритм/алфавит (base62? LexoRank-подобный?) и не численный threshold длины строки для renormalize. Кандидат-ответчик — `04_UI_DESIGN_SYSTEM.md` или отдельный ADR.
7. **Численный допуск clock skew для HLC** (`02§6`) — "tolerate clock skew" не конкретизирован (сколько минут/часов допустимо перед деградацией порядка).
8. **Стартовое значение `occurrence_seq`** (0 или 1) и точная точка инкремента `next_occurrence_seq` в `recurrence_series` не прописаны буквально, хотя логика вывода UUIDv5 (`02§13`) подразумевает целочисленную последовательность.
9. **Поведение при изменении `available_from` на дату позже уже существующего `planned_date`.** Блокирующее правило (§5, инвариант 3) описывает `planned_date < available_from` как invalid при сохранении, но не говорит, что происходит, если пользователь редактирует уже сохранённую задачу так, что это неравенство возникает (реджект правки available_from? авто-сдвиг planned_date? обе трактовки логически совместимы с текстом).
10. **Конкурентная генерация next occurrence с одинаковым `occurrence_seq`, но разным содержимым.** Детерминированный UUIDv5 (`02§13`) гарантирует одинаковый ID occurrence при завершении на двух офлайн-устройствах, но если завершение произошло в разное локальное время (completion-anchor серия) — вычисленная `planned_date` следующего occurrence может отличаться между устройствами при одинаковом `occurrence_seq`/ID. Явный merge-путь для этого конкретного случая не описан отдельно от общих scalar LWW-правил (`02§8`) — неясно, считается ли это "тем же visible полем" и triggers ли conflict UX.
11. **Список стабильных error code для отклонённых sync-мутаций** (`02§11.1` — "stable error code") не приведён; таксономия кодов ошибок валидатора отсутствует в прочитанных файлах, вероятный ответчик — `03_BACKEND_API.md`.
12. **Криптографический формат "cached signed" entitlement** (`01§32` — "Entitlements cached signed") — алгоритм подписи/проверки на клиенте не описан; кандидат-ответчик — `03_BACKEND_API.md` или `05_SECURITY_PRIVACY_LEGAL.md`.
13. **Ранняя материализация R3-полей схемы в волне E00–E12.** Схема tasks уже содержит `source_channel`, `source_capture_batch_id`, `source_intent_id`, а раздел `02§2.2` описывает будущую таблицу `vector_capture_batches` как "R3". Не указано явно, нужно ли создавать соответствующие nullable-колонки уже в первой волне миграций (чтобы избежать breaking-миграции позже) или полностью отложить. Влияет на план миграций E-эпиков.
14. **Локальное шифрование данных at rest** не упоминается ни в `01`, ни в `02` — если оно требуется, ответ должен быть в `05_SECURITY_PRIVACY_LEGAL.md` (не читался в этой волне).

---

## Итог для декомпозиции

Записано в `/home/user/steps/.ultraplan/research/01-domain.md`: полная таблица сущностей/enum'ов, 38 пронумерованных инвариантов валидатора (блокирующие/warning/явно-валидные), точная temporal-семантика (Available From/Planned/Deadline/Reminder/focus_date/day_bucket + различие Missed Plan/Missed Deadline + поведение при смене TZ), полная модель recurrence (scheduled vs completion anchor, skip, remove-wins boundary, template revision reconciliation, детерминированные формулы UUIDv5), точные правила выборки Today (6 групп с precedence и no-duplicate) и Inbox/Plan, вся грамматика NLP-парсера с примерами и правилами конфликтов, схема БД/индексы/FTS/outbox/merge-правила/миграции, и явная карта расхождений web vs native. Раздел 9 фиксирует 14 открытых вопросов с указанием, какой документ мог бы на них ответить.

Пять вещей, сильнее всего влияющих на архитектуру:
1. Детерминированный UUIDv5 для occurrence/subtask/checklist + remove-wins boundary (`stop_after_occurrence_seq`) — recurrence-движок обязан быть спроектирован вокруг конвергенции офлайн-устройств с первого дня, а не добавлен поверх.
2. Единый domain-валидатор (38 правил) должен быть один общий модуль, вызываемый и локальными командами, и (позже) входящими sync-патчами, и общим и для native, и для web — иначе поведение неизбежно разойдётся.
3. Precedence-модель Today (6 взаимоисключающих групп с чёткими условиями и "no duplicates") — это не UI-фильтр поверх произвольного query, а детерминированный алгоритм классификации, который должен жить в domain-слое и быть покрыт golden-тестами.
4. Per-field HLC + fractional rank + outbox-как-часть-локальной-транзакции — с первого эпика структура локальных команд обязана писать entity и outbox атомарно, иначе поздняя вставка sync-слоя потребует переписывания command-layer.
5. Web (IndexedDB) обязан зеркалить не только схему, но и ranking/search semantics native FTS5 с идентичным результатом на golden-тестах — это отдельный, дважды реализуемый, но с общими тестами компонент, который стоит спроектировать как shared-контракт с самого начала, а не как две независимые реализации.
