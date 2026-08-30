# ШАГИ — PRODUCT BEHAVIOR R1

Этот документ — высший приоритет для видимого пользователю поведения R1.

---

## 1. Limits

### Task

- title: 1–500 Unicode chars after trim; CR/LF/TAB normalize to one space; input that consists only of accepted NLP service tokens cannot save until a human-readable title remains;
- identical title/date Tasks are valid; no content-based automatic deduplication;
- description: 0–100 000 chars, multiline plain text; URLs auto-detected; rich editor не входит в R1;
- max 100 direct subtasks;
- max 200 checklist items;
- max 50 labels/task;
- max 1 explicit reminder in R1 UI;
- max 20 links;
- max 10 attachments/task;
- technical active task target: 100 000/account/local workspace.

### Project

- title 1–120;
- description 0–10 000;
- technical max 500 active;
- Free entitlement: 10 active projects;
- archived projects do not count toward limit.

### Section/Label

- section title 1–80;
- label 1–80;
- label unique case-insensitive after Unicode normalization in user scope.

---

## 2. Inbox — production semantics

Product v4 связывал Inbox с `project_id==null`, но это противоречит Inbox Zero для пользователя, который не использует Projects. Поэтому implementation-spec уточняет модель:

```text
capture_state = inbox | processed
```

Inbox = active tasks с `capture_state=inbox`.

### Что попадает в Inbox

- global/system Quick Add without context;
- Quick Add widget;
- explicit destination `Входящие`;
- future OS/share/email capture without destination;
- import row explicitly left as Inbox.

### Что не попадает

- `+` from Today → processed + today;
- `+` from Plan selected date → processed + selected date;
- `+` from Project/Section/Board → processed + project context;
- onboarding First Task → processed + today.

`project_id=null` остаётся допустимым у processed task. Проекты не обязательны.

### Process Inbox

Actions per card:
- **Сегодня** → `planned_date=today`, `capture_state=processed`;
- **Дата** → chosen date + processed;
- **Проект** → chosen project + processed;
- **Удалить** → delete;
- **Пропустить** → remains inbox, go next.

Именно `capture_state` позволяет реальный Inbox Zero.

---

## 3. Contextual Quick Add

| Origin | Inherited values |
|---|---|
| Today | planned_date=today, processed |
| Plan selected date | selected date, processed |
| Project | project, processed |
| Section | project+section, processed |
| Board column | project+section, processed |
| Inbox | inbox, no date |
| Global/widget | inbox, no date/project |

Inherited values visible as editable chips. Explicit NLP/manual value always wins.

If user removes inherited Today date chip, task remains processed/undated; it does not jump back into Inbox.

### Draft safety

- non-empty Quick Add draft autosaves locally;
- Escape/close does not destroy it;
- successful create clears draft;
- non-empty stale draft shown once with `Продолжить / Удалить`;
- draft never syncs across devices.

Desktop:
- `Ctrl/Cmd+N` Quick Add;
- Enter create;
- Escape close, draft kept;
- Tab navigation through chips.

---

## 4. Deterministic NLP R1

No AI/network.

### Pipeline

1. Unicode NFKC.
2. Protect quoted spans (`«...»`, `"..."`) from service-token parsing.
3. Lexer.
4. Entity candidates.
5. Deterministic precedence.
6. Temporal validation.
7. Preview chips.
8. Accept/reject/edit.
9. Accepted service tokens removed from title.

### Grammar

Date:
- сегодня, завтра, послезавтра;
- weekdays;
- через N дней/недель;
- 5 сентября, 05.09, 05.09.2026;
- выходные → nearest Saturday;
- следующая неделя → next Monday.

Weekday:
- `в пятницу` = nearest Friday including today;
- `в следующую пятницу` = Friday of next calendar week;
- preview chip always shows exact date.

Time:
- `в 11`, `11:00`, `в 9:30`;
- утром/днём/вечером → configurable suggestions 09:00/14:00/19:00 defaults.

Deadline:
- marker `до <date/time>` only.

Duration:
- `15 мин`, `45 минут`, `1 час`, `1 ч 30 мин`, `полтора часа`.

Recurrence:
- каждый день;
- по будням;
- каждый понедельник;
- каждое 5 число;
- раз в неделю;
- каждые N дней/недель/месяцев.

Project: `#name`.  
Label: `@name`.  
Priority: `!1 !2 !3 !4`.

Free words `срочно/важно` are NOT control tokens R1.

### Ambiguity

Never silently guess. Chip must expose resolved exact date/time. Rejected chip restores source text exactly once.

### Time-only without a date

If input contains a time but no explicit/inherited date:
- if that local time is still >= current local minute → resolve to Today;
- if already passed → resolve to Tomorrow.

The resulting exact Date chip is always shown, so the rule is visible and editable.

If Composer already inherited a date (for example Today), the explicit time attaches to that inherited date even if the time is in the past; inherited date is visible and editable.

A time-only Deadline (`до 11`) uses the same Today/Tomorrow rule when no date context exists.

Golden corpus: >=800 examples including false positives, quoted spans, month/year boundaries, leap years, combined expressions and Cyrillic punctuation.

---

## 5. Temporal model and constraints

Fields:
- Available From: PlainDate|null;
- Planned Date: PlainDate|null;
- Planned Time: PlainTime|null;
- Duration: int minutes 1..1440;
- Deadline: date + optional time;
- Reminder;
- Recurrence.

Blocking:
- `planned_time != null` while `planned_date == null`;
- `deadline_time != null` while `deadline_date == null`;
- planned_date < available_from;
- deadline < beginning of available_from day.

Warning/save allowed:
- planned > deadline;
- planned_time+duration ends after deadline;
- reminder after deadline.

Valid:
- duration without time;
- deadline without planned date;
- available_from without planned date;
- no temporal fields.

Date-only deadline expires at end of local day (`23:59:59.999` for classification).

---

### Date shortcut semantics

- Сегодня → current local date.
- Завтра → current local date + 1.
- Выходные → today if Saturday/Sunday, otherwise nearest Saturday.
- Следующая неделя → next Monday, never current Monday.
- Removing Planned Date also removes Planned Time, clears Focus and `day_bucket`; Duration remains.
- Removing Deadline also removes Deadline Time and deadline-derived schedules.

---

## 6. Today — no duplicates

One task appears at most once.

Precedence:

1. **Просрочен срок**
2. **Не по плану**
3. **Главное**
4. **По времени**
5. **Сегодня**
6. **Когда будет время**

### Просрочен срок

Deadline passed, active. Shown regardless of planned date.
Actions: Complete / Reschedule / Change deadline / Open.
No default bulk deadline shift.

### Не по плану

planned_date < today and deadline not passed.
Actions: per-task reschedule; bulk Today/Tomorrow. Bulk never changes Deadline.

### Главное

`focus_date=today`, max 3.

Undated task → prompt `Запланировать на сегодня и добавить в Главное?`.
Task on other date → prompt to move today.
Setting Focus clears `day_bucket=later`.
Midnight does not carry yesterday Focus forward.
Fourth Focus → choose one of 3 to replace.

### По времени

Today + planned_time; order time ASC then manual rank.

### Сегодня

Today, no time, default bucket; manual rank.

### Когда будет время

Only manual action/drag. Never inferred from P4.

- action `Когда будет время` sets `day_bucket=later`, **clears Planned Time**, preserves Duration and Planned Date;
- assigning a Planned Time to a Later task resets `day_bucket=default`;
- changing Planned Date resets bucket to default.

This prevents a timed task from being hidden by the higher-priority `По времени` group while the user expected it in `Когда будет время`.

---

## 7. Priority vs ordering

Priority never rewrites manual rank automatically.
Explicit `Sort by Priority` is view mode only. Returning to Manual restores previous ranks.

---

## 8. Completion

### Normal task

Immediate local transaction; calm completion motion; leaves active list; 6-second Undo toast.

### Parent with incomplete direct subtasks

Compact prompt:

> Есть N незавершённых подзадач

- **Завершить всё** — parent + active direct subtasks completed atomically.
- **Отмена**.

R1 does not allow completed parent with active direct child. Completing all children does not automatically complete parent. Checklist state never blocks parent completion.

### Undo

Restores exact prior status/focus/bucket/subtask graph.
For recurrence, generated next occurrence is also removed if it has not independently changed. If already changed remotely, preserve it and surface sync conflict notice rather than losing data.

---

## 9. Delete

Normal Task: immediate + 6s Undo; backend/local tombstone remains for sync, but no user-visible Trash R1.

Parent delete cascades direct subtasks/checklist/links; one Undo restores graph.

Recurring delete:
- Это повторение;
- Вся серия.

Delete current occurrence skips it and creates next according to rule. Delete entire series stops future generation; completed historical occurrences remain history.

---

## 10. Subtasks vs checklist

Subtask = full Task with own temporal metadata; appears in Today/Plan/Search with parent context. R1 UI depth 1, schema future-safe.

Checklist item = `{text, done, rank}`, only inside Task Detail.

Checklist → subtask preserves text/completed state.  
Subtask → checklist warns about metadata loss and requires confirm.

---

## 11. Recurrence

Series + exactly one materialized active **top-level** occurrence.

### 11.1 Hierarchy rule

- A recurring Task must be top-level (`parent_task_id=null`) in R1.
- A Subtask cannot independently receive `Повтор`.
- Moving a recurring Task under another Task is blocked until recurrence is removed.
- A recurring Todoist subtask is promoted to top-level on import with an explicit warning; recurrence is preserved.

A recurring parent may contain non-recurring subtasks/checklist items; new occurrences recreate them incomplete.

### 11.2 Deterministic occurrence identity

Each series has `occurrence_seq`.

Generated occurrence ID is deterministic UUIDv5 from `series_id + occurrence_seq`.

Generated Subtask/Checklist IDs are deterministic UUIDv5 from `parent_occurrence_id + stable_template_item_id`.

Thus two offline devices completing the same occurrence converge onto one next graph.

### 11.3 Scheduled anchor

Next is the first schedule slot strictly after completion/skip local time.

Examples:
- weekly Monday completed Wednesday → next Monday;
- task completed three weeks late → first future scheduled slot, not a backlog of overdue copies.

Rules:
- monthly day 31 skips months without day 31;
- yearly Feb 29 only in leap years;
- weekdays = Mon–Fri local calendar.

### 11.4 Completion anchor

Next planned date = completion local date + interval using Temporal `overflow:"constrain"` for month/year arithmetic.

Example: one month after Jan 31 → Feb 28/29.

### 11.5 Skip/delete current occurrence

Current-only action is worded **`Пропустить это повторение`** and is represented as historical completion, not a tombstone:

- current occurrence becomes `status=completed`, `completion_kind=skipped`, `completed_at=skip time`;
- history displays `Пропущено`;
- scheduled anchor → first schedule slot after skip time;
- completion anchor → skip local date becomes the next interval anchor;
- Skip supports the same 6-second Undo transaction as completion;
- `Удалить всю серию` stops future generation and preserves completed/skipped history.

### 11.6 Series editing

Template edit → `Это повторение / Вся серия`.

`Это повторение` changes current graph only.  
`Вся серия` changes current + future template.  
Completed history is immutable.  
One-off reschedule does not change the series rule.

### 11.7 Relative fields and recurring-parent subtasks

Series template stores relative deadline/reminder/available offsets, never stale absolute values.

Subtasks:
- cannot recur themselves;
- have stable template item IDs;
- when Parent has Planned Date, template-copyable child dates are day offsets from Parent; times remain floating wall-clock; reminders are relative to the child occurrence;
- if Parent has no Planned Date, dated child values are current-occurrence-only and UI warns that future repeats will recreate that child without those dates;
- editing a generated child in a recurring parent offers `Это повторение / Будущие повторения` for template-copyable fields.

### 11.8 Concurrent series delete/complete — remove-wins boundary

Whole-series delete sets `stop_after_occurrence_seq = current_occurrence_seq` (or the last sequence intentionally retained). Any future occurrence with `occurrence_seq > stop_after_occurrence_seq` is suppressed/tombstoned **regardless of HLC ordering**.

This prevents a stale offline completion from resurrecting N+1 after another device deleted the entire series.

### 11.8.1 Whole-series edit vs offline generation

Series template has monotonically increasing `template_revision`. Each materialized occurrence stores `template_revision_applied` and a set of `override_fields` changed with `Это повторение`.

If an offline device generates next occurrence from an older template and later receives a newer `Вся серия` edit:
- non-overridden fields reconcile to the newest template;
- occurrence-specific override fields remain;
- completed/skipped history is never rewritten.

---

### 11.9 Undo completion

Generated next graph is linked to source occurrence and removed atomically if untouched. If another device already changed that next occurrence, preserve remote work and show sync conflict notice.

### 11.10 Restore old recurrence

If no next active occurrence exists → `Отметить снова невыполненной`.

If next exists → no normal restore; offer `Создать отдельную копию` (non-recurring).

### 11.11 Restore completed hierarchy

For a normal completed Task/Subtask:
- active original Project → restore there;
- archived Project → choose `Восстановить проект и задачу` or `Восстановить во Входящие`;
- deleted Project → restore top-level into Inbox, retaining former Project snapshot in history;
- completed Parent + completed Subtask restore → choose `Восстановить родительскую и подзадачу` or `Создать отдельную задачу`;
- deleted Parent → restore selected Subtask as top-level in surviving Project/Inbox.

Active child under completed Parent is never created.

---

## 12. Projects

### Create/edit

R1 fields:
- title required;
- optional description;
- small marker color from controlled token palette, no arbitrary hex;
- optional curated icon or none;
- default view List/Board;
- favorite toggle.

Favorite project appears in favorites area; entity is not duplicated.

### Free limit
At 10 active projects, ordinary attempt 11 → contextual Pro paywall; no partial project created.

Unarchive that would exceed limit uses the same gate.

**Import/backup/account-merge exception:** migration never discards data. If migration yields >10 active projects, all remain readable/editable; only later create/reactivate is gated until <=10 or Pro.

### Sections
Create/rename/reorder supported. User-created empty Section remains visible; synthetic `Без раздела` is hidden only when empty.

### Delete section
Tasks move to `Без раздела`; Undo restores section/ranks. Completed history retains a section-name snapshot if live Section is deleted.

### Parent/Subtask project moves

R1 invariant: Parent and direct Subtasks share Project and Section.

- moving Parent Project/Section cascades direct Subtasks in one transaction;
- moving a Subtask alone to another Project requires `Подзадача станет отдельной задачей`; confirm detaches it;
- moving top-level Task to Inbox clears Project/Section and sets Parent `capture_state=inbox`; attached Subtasks remain `processed`.

### Archive project
If active tasks exist, confirm. Archived project and its active tasks disappear from Today/Plan but remain Search-visible in Archived context.

Archiving immediately cancels/suppresses all future explicit/deadline notifications belonging to active tasks in that Project. Unarchive restores visibility and triggers notification reconciliation from current task state; expired reminders are not replayed as a storm.

### Permanent delete archived project
Options:
1. `Переместить задачи во Входящие` → project/section cleared + capture_state=inbox.
2. `Удалить проект и задачи` → destructive confirm.

Completed task history keeps project-name snapshot after project deletion.

---

## 13. List / Board

Same Sections are used in both.

List: sections vertical.  
Board: sections columns; `Без раздела` first only if non-empty.

Drag:
- within section → rank;
- across section → section_id + rank;
- move across projects clears incompatible section.

Every drag operation has accessible context-menu/keyboard alternative. Board virtualizes >200 cards.

---

### Label lifecycle

Deleting a Label:
- removes only label relations; Tasks are never deleted;
- shows 6-second Undo that restores Label + relations;
- if future custom filters reference that Label, R1.1 filter engine marks them invalid/requires repair rather than silently changing meaning.

---

## 14. Plan R1

Agenda, not full calendar.

- chronological lazy day groups;
- compact date strip;
- selected date navigates corresponding group;
- date changes via picker; drag where reliable.

Available From can show lightweight `станет доступна` marker on availability date. Marker is not another task and not counted in task totals.

Deadline-only future task without planned date is not invented into Plan; it surfaces when relevant via filters and when deadline is missed.

---

## 15. Search

Normalize:
- Unicode NFKC;
- case-insensitive;
- `ё`=`е` for matching;
- Russian/Latin;
- token-prefix + substring.

Ranking:
1. exact title;
2. title prefix;
3. title token;
4. title substring;
5. project/label;
6. description;
7. active before completed on tie.

Search covers tasks, completed tasks, projects, labels, future-available tasks.

---

## 16. System filters R1

- Без даты
- P1 / Критичные
- Не по плану
- Просрочен срок
- Повторяющиеся

Read-only predefined. Custom filters R1.1.

---

## 17. Task Detail

Simple: title / complete / context + `Добавить дату / Приоритет / Добавить заметку`.

Expanded hierarchy:
1. title/context;
2. description;
3. Planning;
4. Organization;
5. Subtasks;
6. Checklist;
7. Attachments/Links;
8. future activity.

Autosave valid mutations. `Готово` closes, not saves. Invalid temporal field blocks only that field commit; other editing remains possible.

---

## 18. Reminders / notifications R1

Do not ask notification permission on first launch. Ask when first reminder is created or deadline notifications are enabled.

### Explicit reminder
At configured local date/time.

Platform delivery:
- Android/Windows native builds must deliver while main UI is closed.
- Android checks exact-alarm capability for precise user-selected times and requests/discloses OS access only when needed.
- Local-only Web/PWA cannot promise closed-browser delivery. Show a one-time note: `Когда браузер закрыт, веб-напоминания могут не сработать. Включите синхронизацию для надёжных уведомлений.` Synced Web may use Web Push/server fallback.

### Deadline approaching default
After permission:
- timed deadline >=24h away → 24h before;
- created with <24h but >2h remaining → 1h before;
- date-only → 09:00 deadline day;
- too-close cases do not fire immediate spam.

### Deadline missed
- timed → +15 min if active;
- date-only → 09:00 next day if active.

One logical `notification_id` deduplicates local/push fallback. Edits atomically cancel/rebuild. Complete/delete cancels all pending task notifications.

---

## 19. Timezone

Task time floats with local wall clock. On timezone change app reschedules local reminders preserving 09:00 as local 09:00 and updates backend device timezone for synced fallback.

No per-task timezone R1.

---

## 20. Multi-select

Actions:
- Complete
- Move date
- Move project
- Priority
- Labels
- Delete

Mixed recurring selection applies to current occurrences only; no silent series-wide edit.

### Bulk completion hierarchy

If selection contains Parent tasks with active direct Subtasks:
- show **one aggregate confirmation**, not one dialog per parent;
- confirmation reports additional child count;
- completion cascades atomically under the same parent rule;
- a Subtask that is both explicitly selected and already included through its selected Parent is counted/applied once;
- Cancel leaves the entire selection unchanged.

---

## 21. Desktop power UX

- `Ctrl/Cmd+K`: command palette.
- `Ctrl/Cmd+N`: Quick Add.
- `Ctrl/Cmd+F`: Search.
- Esc closes overlay, preserves Quick Add draft.
- Space completes selected row only when focus is not input.

Command palette: Today / Open project / Search task / New task / Move / Date / Complete / Settings.

---

## 22. Account/auth UX

R1 has one active workspace UI at a time: local workspace or one signed-in account. Multi-account switching is out of R1.

Local mode first; no account required.

Email OTP:
- 6 digits;
- TTL 10m;
- max 5 failed attempts/challenge;
- 5 requests/hour/email, 20/hour/IP;
- generic response prevents enumeration.

Yandex: Authorization Code + PKCE + state/nonce.

Access token 15m. Rotating refresh 30d. Reuse revokes token family.
Native refresh in OS secure store; Web refresh via HttpOnly Secure SameSite cookie.

### Local → account merge
Stable entity IDs preserved. **No fuzzy dedup by title/date.**

- same UUID known cloud → normal clock merge;
- new UUID → upload as new;
- same-looking content/different UUID → keep both.

Default action `Объединить`; `Не добавлять локальные` keeps a dormant local stash. Settings shows `Локальные задачи на устройстве` with `Объединить / Экспортировать / Удалить`. Never silently discard data.

If merge results in >10 active projects on Free, all are retained/editable; further create/reactivate is gated only.

### Logout

If outbox empty → logout normally.

If unsynced changes exist:
- online → default `Синхронизировать и выйти`;
- offline → `Экспортировать локальные изменения / Выйти и оставить данные на устройстве / Отмена`.

No silent discard.

After clean logout:
- credentials removed/revoked;
- Shared cache purged;
- account-scoped cache removed from normal UI/purged because R1 does not promise encrypted multi-account offline cache;
- dormant pre-account local stash is separate and remains.

Signing into another account requires logout first.

### Account deletion

Requires online re-authentication.

After server accepts deletion:
- revoke sessions;
- purge account-scoped local cache on this device;
- do not convert Shared projects into personal copies;
- dormant pre-account local stash remains because it was never account data.

UI offers Export before final destructive confirmation.

---

## 23. Sync UX

Normal sync invisible.

Show status only if:
- pending >30s while online;
- auth expired;
- server unreachable repeatedly;
- schema incompatibility;
- unresolved same-field conflict.

Offline copy explicitly says local work continues.

---

## 24. Attachments R1b

Defaults:

Free: 10MB/file, 100MB cloud quota.  
Pro: 50MB/file, 2GB cloud quota.  
Max 10/task.

Offline file copied to app-private storage → `local_pending`. Online upload → `synced`; failure → Retry/Cancel.

Reject cloud upload of executables/scripts; validate MIME by sniff, not only extension. Object key never contains raw filename.

---

## 25. Links

Allowed: `https`, `http`, `mailto`, `tel`. Other custom schemes require explicit confirmation before launch.

---

## 26. Import

### Todoist baseline

Support:
- single project CSV;
- backup ZIP containing project CSV files.

Parser tolerant to extra/new columns.

Map when present:
- project/section and `meta view_style=board`;
- active task;
- description;
- date/time;
- duration;
- deadline;
- representable recurrence;
- labels;
- priority;
- attachment URLs.

Todoist hierarchy:
- `INDENT=1` → top-level;
- `INDENT=2` → Subtask;
- `INDENT>=3` is flattened to a direct Subtask of the nearest top-level ancestor because R1 UX is one-level; all Task fields are retained, Import Preview reports the transformation and original parent path;
- recurring Todoist Subtask is promoted to top-level in the same Project/Section and Preview reports it.

`AUTHOR/RESPONSIBLE` are preserved in import report and appended to imported metadata in Description before R1.3.

Todoist `TIMEZONE` is recorded in the import report, but DATE wall-clock values are preserved as the user saw them because SHAGI uses floating-local task time; no surprise conversion during import.

`IS_COLLAPSED` has no R1 persistence equivalent and is shown as ignored cosmetic metadata in Preview.

Standard Todoist backup/CSV does not reliably provide completed history, so UI must not promise it.

Comments before R1.3 are preserved losslessly in a clearly delimited `Импортировано из Todoist — комментарии` block appended to description.

If appending comments would exceed the 100,000-character Description limit, overflow is preserved as a UTF-8 text attachment **`Комментарии Todoist.txt`** and Preview/Result reports this transformation. No truncation.

Import/restore is allowed to preserve more than ordinary per-task attachment/project limits when necessary for lossless migration; limits then gate future user additions, never delete imported data.

### Generic CSV

Mapping UI: title required; project/section/date/time/deadline/duration/priority/labels/description optional.

### Transaction/rollback

Every import has `import_batch_id`. Result allows `Отменить импорт` for 10 minutes or until first manual edit of imported entities. Rollback removes only untouched imported entities.

Security limits: compressed <=100MB, expanded <=500MB, <=10k entries, no path traversal, no recursive archive expansion.

---

## 27. Export / ownership

Always Free.

`shagi-backup-v1.zip`:

```text
manifest.json
data/projects.jsonl
data/sections.jsonl
data/tasks.jsonl
data/labels.jsonl
data/checklist.jsonl
data/reminders.jsonl
data/recurrence.jsonl
data/settings.json
attachments/<attachment-id>
```

Manifest: schema_version, app_version, exported_at, locale, checksums. Never include auth/device secrets.

Also per-project CSV portability export.

### SHAGI backup restore modes

1. **Restore into empty workspace** — preserve original IDs/full graph.
2. **Import into non-empty workspace** — colliding IDs are remapped consistently across the whole imported graph; never overwrite silently.

A destructive `Replace current workspace from backup` is a separate advanced action with confirmation and automatic pre-restore backup.

Plan limits never discard restored/imported data; future create/reactivate obeys current entitlement.

---

## 28. Widgets R1b

Android mandatory:
- Today widget;
- Focus widget;
- Quick Add launcher/widget.

Native widget code reads a read-only snapshot generated by core. Tapping task deep-links into app. Direct complete from widget is out of R1 to avoid duplicate business logic in platform code.

Web/Windows use install/global shortcuts rather than fake widget equivalents.

---

## 29. Appearance

Shipping themes: **System / Light / Dark**. `zapiski` handoff theme is showcase only.

Desktop: Comfortable / Compact density. Mobile: one density.

---

## 30. Settings R1

- Аккаунт
- Синхронизация
- Данные и конфиденциальность
- Внешний вид
- Уведомления
- Быстрый ввод
- Подписка
- Интеграции (extension point)
- О приложении

Quick Input defaults: Утро 09:00 / День 14:00 / Вечер 19:00, editable.

---

## 31. Data & Privacy UX

Show:
- `Только на этом устройстве` / `Синхронизируется`;
- Export;
- analytics toggle;
- diagnostics toggle;
- legal docs;
- delete local data;
- delete account;
- permissions/integrations when relevant.

Analytics and diagnostics are independent optional consents.

---

## 32. Free/Pro downgrade

Entitlements cached signed; offline grace 7 days after cached expiry.

After Pro ends:
- existing >10 projects remain readable/editable;
- no new project/reactivation until active count <=10 or Pro renewed;
- no user data deleted;
- Pro-only data retained, feature UI gated as applicable.

R1 billing may remain feature-flagged until sufficient Pro value exists, but entitlement architecture must be complete.
