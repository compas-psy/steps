# ШАГИ — FINAL INDEPENDENT REVIEW LOG

После первой полной инженерной сборки ТЗ проведён отдельный reviewer-pass «как будто документ писал другой CPO/architect». Ниже — найденные пробелы и уже внесённые решения.

## 1. Inbox semantics

**Дыра:** v4 связывал Inbox с `project_id=null`, но action «Сегодня» не назначал Project, поэтому Inbox Zero был логически невозможен для пользователя без Projects.

**Исправлено:** введён `capture_state=inbox|processed`; Inbox — capture queue. Contextual capture processed; Process Date/Today/Project выводит из Inbox.

## 2. Duplicates in Today

**Дыра:** Task могла одновременно быть overdue, Focus и timed.

**Исправлено:** one-render precedence `DeadlineMissed > MissedPlan > Focus > Timed > Today > Later`.

## 3. Parent completion

**Дыра:** не определено завершение parent при незавершённых subtasks.

**Исправлено:** R1 prompt `Завершить всё / Отмена`; completed parent with active direct child не допускается.

## 4. Recurrence relative deadlines/reminders

**Дыра:** новый occurrence мог получить абсолютный deadline прошлого occurrence.

**Исправлено:** series template stores relative offsets.

## 5. Recurrence Undo

**Дыра:** completion creates next occurrence; ordinary Undo could leave duplicate.

**Исправлено:** generated occurrence linked to source and reverted atomically if untouched.

## 6. Project archive

**Дыра:** не было ясно, остаются ли active tasks archived project в Today.

**Исправлено:** они leave Today/Plan, remain Search-visible in Archived context; archive with active tasks confirms.

## 7. Permanent Project delete

**Дыра:** судьба tasks undefined.

**Исправлено:** explicit `Move tasks to Inbox` or destructive `Delete project and tasks`.

## 8. Imported Todoist comments before Shared

**Дыра:** R1 comments отсутствуют, импорт мог потерять данные.

**Исправлено:** comments preserved in delimited description block until R1.3.

## 9. Import rollback

**Дыра:** preview есть, но recovery после массового импорта не определён.

**Исправлено:** import_batch + 10-minute/untouched rollback.

## 10. Quick Add draft loss

**Дыра:** closing composer could lose thought.

**Исправлено:** local unsynced draft persists.

## 11. Search contract

**Дыра:** не были зафиксированы `ё/е`, ranking/native-web parity.

**Исправлено:** exact normalization/ranking contract.

## 12. Notification semantics

**Дыра:** notification types existed without exact permission timing/dedupe/rescheduling defaults.

**Исправлено:** just-in-time permission, deterministic deadline notifications, notification_id dedup, reconciliation.

## 13. Floating time representation

**Дыра:** implementation via JS Date would violate product semantics after timezone travel.

**Исправлено:** PlainDate/PlainTime in domain; Instant only system timestamps.

## 14. Account merge dedupe

**Дыра:** vague «safe duplicate detection» risks destructive fuzzy matching.

**Исправлено:** stable UUID only, no title/date fuzzy dedup.

## 15. Logout/revoked Shared cache

**Дыра:** future shared content could remain visible after revoke.

**Исправлено:** purge shared cache on logout/authorization reconciliation; offline limitation documented.

## 16. Attachments security/lifecycle

**Дыра:** object state existed without quota/MIME/key/checksum safeguards.

**Исправлено:** full lifecycle, quota, opaque keys, sniffing, pending/retry.

## 17. Runtime Google Fonts

**Дыра:** design handoff imports Google Fonts, contrary to offline/privacy/performance goals.

**Исправлено:** Geist/Geist Mono self-host/package.

## 18. Prototype-only visual artifacts

**Дыра:** agent could literally implement green phone frame, fake status bar, showcase header, Zapiski theme.

**Исправлено:** explicitly non-production.

## 19. Widgets cross-platform ambiguity

**Дыра:** could be interpreted that native Android home widgets are required identically on Windows/Web.

**Исправлено:** Android native widgets mandatory; other platform capability adapts/hides.

## 20. Subscription downgrade data loss

**Дыра:** 10-project Free limit after Pro cancellation undefined.

**Исправлено:** existing content editable, creation/reactivation gated only, nothing deleted.

## 21. Privacy/data localization

**Дыра:** external telemetry/cloud could become accidental PII primary store.

**Исправлено:** RF primary storage, no raw content telemetry, separate opt-in analytics/diagnostics.

## 22. Smart magic

**Дыра:** AI could claim capacity without data and own scheduling.

**Исправлено:** capacity/scheduling deterministic local, source data explicit, AI only proposal.

## 23. Shared wrongly coupled to SIMPAS

**Дыра:** personal collaboration could be implemented only as ecosystem feature.

**Исправлено:** standalone R1.3 Shared.

## 24. Subtask schema overconstraint

**Дыра:** R1 one-level UX could permanently block future hierarchy.

**Исправлено:** UI one-level, data model future-safe.

## 25. Completed history / project deletion

**Дыра:** deleting project could erase context of historical completed task.

**Исправлено:** completed record keeps project-name snapshot.

## 26. Sync stale resurrection

**Дыра:** short UI Undo alone insufficient for device offline months.

**Исправлено:** 90-day local/server tombstone retention.

## 27. CSV formula injection

**Дыра:** portable CSV export can become execution vector in spreadsheet apps.

**Исправлено:** dangerous leading formula characters escaped/prefixed.

## 28. Domain/service database mixing

**Дыра:** future SIMPAS integration could tempt direct SQL links into PRAKTIKA.

**Исправлено:** hard service boundary + opaque object refs + scoped API.

## 29. Recurrence-on-subtask ambiguity

**Дыра:** Subtask была полной Task, а recurrence — общей Task-функцией, что допускало повторяющегося ребёнка под завершённым/неповторяющимся Parent.

**Исправлено:** recurrence в R1 разрешён только top-level. Recurring Todoist child при импорте повышается до top-level с warning. Recurring Parent может тиражировать non-recurring Subtasks через стабильный template.

## 30. Recurrence multi-device duplicate

**Дыра:** два offline-устройства могли завершить один occurrence и создать два разных UUIDv7 next occurrence.

**Исправлено:** recurrence-generated graph использует deterministic UUIDv5 от series/sequence/template IDs.

## 31. Late scheduled recurrence backlog

**Дыра:** завершение scheduled occurrence через несколько интервалов могло породить следующий уже просроченный occurrence.

**Исправлено:** создаётся первый schedule slot строго после completion/skip time; промежуточные пропущенные слоты не материализуются.

## 32. Completion-anchor skip

**Дыра:** у completion-based recurrence не было определено, от чего считать следующее повторение при пропуске.

**Исправлено:** `Пропустить это повторение`; локальная дата skip становится anchor следующего интервала.

## 33. Restore hierarchy

**Дыра:** Restore Subtask под completed/deleted Parent или Task из archived/deleted Project мог нарушить инварианты.

**Исправлено:** явные restore-context choices: восстановить Parent/Project либо создать/вернуть top-level task в Inbox.

## 34. Parent/Subtask move invariant

**Дыра:** перенос ребёнка отдельно мог оставить Parent и child в разных Projects.

**Исправлено:** Parent move каскадирует direct Subtasks; child-alone cross-project move сначала detach after confirmation.

## 35. Todoist deep hierarchy/import metadata

**Дыра:** актуальный Todoist CSV имеет INDENT до 4, AUTHOR/RESPONSIBLE/TIMEZONE, а R1 SHAGI поддерживает один уровень Subtask.

**Исправлено:** INDENT>=3 flatten с preview-warning/original path; recurring child promotion; AUTHOR/RESPONSIBLE сохраняются; wall-clock DATE не конвертируется неожиданно.

## 36. Browser reminder reliability

**Дыра:** local-only PWA не может гарантировать future notification при полностью закрытом браузере.

**Исправлено:** явный disclosure; reliable closed-browser path = synced account + Web Push/server fallback. Native Android/Windows use native schedulers.

## 37. Android exact-alarm capability

**Дыра:** precise reminder мог тихо стать неточным из-за capability/store policy.

**Исправлено:** just-in-time capability/access flow + release-time policy recheck.

## 38. Logout with unsynced data

**Дыра:** purge account cache при logout мог уничтожить outbox changes.

**Исправлено:** sync/export/retain decision before logout; silent discard запрещён.

## 39. Free migration >10 projects

**Дыра:** Free project limit мог частично блокировать competitor migration/restore.

**Исправлено:** migration/restore/merge сохраняют всё; ограничение действует только на последующее create/reactivate.

## 40. Backup restore ID collision

**Дыра:** restore backup в non-empty workspace мог молча overwrite совпавшие IDs.

**Исправлено:** empty restore preserves IDs; non-empty import remaps colliding graph IDs; destructive replace — отдельный режим с pre-backup.

## 41. Optional telemetry defaults

**Дыра:** design handoff показывает analytics/diagnostics toggle в ON-state, что можно принять за default consent.

**Исправлено:** оба optional consent OFF by default; handoff — только пример состояния.

## 42. Dependency/IP gate

**Дыра:** техническое ТЗ не запрещало зависимость с неподходящей лицензией/копирование competitor assets.

**Исправлено:** SBOM/license scan, approval gate for reciprocal/network-copyleft, no proprietary copy, notices.

## 43. Archived-project notifications

**Дыра:** archived Project был скрыт из Today/Plan, но старые native reminders могли продолжать срабатывать.

**Исправлено:** archive unschedules project reminders; unarchive запускает notification reconciliation.

## 44. Labels deletion

**Дыра:** lifecycle Label не определял, что происходит с Tasks.

**Исправлено:** relation-only delete + Undo; Tasks не удаляются.

## 45. Bulk parent completion

**Дыра:** multi-select мог обходить Parent/Subtask invariant либо показывать много отдельных confirmations.

**Исправлено:** один aggregate confirm, атомарный cascade, duplicate-selected children не double-count.

## 46. Localization contract

**Дыра:** русский был implicit first market, но не было release/i18n acceptance rule.

**Исправлено:** ru-RU mandatory for R1, all strings keyed, missing Russian production key is CI failure.

## 47. `Когда будет время` vs Planned Time

**Дыра:** precedence `По времени` стояла выше `Когда будет время`, поэтому timed Task могла получить Later bucket, но визуально не переместиться.

**Исправлено:** action `Когда будет время` очищает Planned Time и сохраняет Duration; назначение Planned Time обратно сбрасывает Later.

## 48. Time-only NLP

**Дыра:** фраза `Позвонить в 11` могла создать запрещённое состояние Time without Date или потребовать лишний вопрос.

**Исправлено:** deterministic visible rule: today if time still future, otherwise tomorrow; exact date chip always shown. Same rule for time-only deadline.

## 49. Global Quick Add platform boundary

**Дыра:** `Ctrl/Cmd+N` мог быть ошибочно реализован как system-wide shortcut или Web мог обещать невозможное OS-global behavior.

**Исправлено:** in-app shortcut separated from configurable Windows `GlobalShortcutPort`; Web explicitly has no OS-global capture.

## 50. Optional telemetry default in UI

**Дыра:** DS state could override privacy semantics.

**Исправлено:** Data & Privacy explicitly shows analytics and diagnostics default OFF; visual ON screenshot is never a default-value source.

## 51. Recurrence remove-wins race

**Дыра:** HLC/LWW alone could allow a stale offline completion to generate N+1 after whole-series delete on another device.

**Исправлено:** `stop_after_occurrence_seq` remove-wins boundary suppresses all future generated occurrences regardless of clock ordering.

## 52. Recurrence whole-series edit vs offline generation

**Дыра:** next occurrence could be generated from old template while another device changed `Вся серия`.

**Исправлено:** `template_revision` + occurrence `override_fields`; newest template reconciles only non-overridden fields.

## 53. Skip audit semantics

**Дыра:** current-only delete/skip was ambiguous between tombstone and completed history.

**Исправлено:** `Пропустить это повторение` is completed occurrence with `completion_kind=skipped`, produces next occurrence and supports Undo.

## 54. Todoist comment overflow

**Дыра:** imported comments could exceed Description limit and be truncated.

**Исправлено:** overflow is preserved as `Комментарии Todoist.txt` attachment and reported in Preview.

## 55. Scope completeness

После повторного независимого review нормативные документы не содержат известных открытых product/behavior placeholders. Runtime deployment values (OAuth IDs, signing keys, merchant secrets, production DNS/provider credentials) остаются operations secrets, но их contracts определены.

## 56. Design v2 comparator themes

**Дыра/изменение:** R1 handoff v2 заменил demo theme `zapiski` на `Бумага / Графит / Чернила`; coding agent мог принять их за новые темы ШАГОВ.

**Исправлено:** все три явно classified как ZAPISKI-family showcase/comparison. SHAGI R1 остаётся System/Light/Dark.

## 57. V03 `Сохранить все` vs per-intent confidence

**Дыра:** CJM одновременно показывает per-intent confidence и общий `Сохранить все 3`, что допускает ошибочную all-or-nothing/bypass-confirmation реализацию.

**Исправлено:** batch = independent intents. High reversible may already be committed; Medium/Low remain unresolved. Production CTA does not force-save unresolved intents.

## 58. Driving persona vs touch confirmation

**Дыра:** персона за рулём, но Medium/Low mock требует taps.

**Исправлено:** hands-free voice confirmation/one clarification where allowed; otherwise unresolved item goes to later Review without losing thought. No visual form required while driving/screenless.

## 59. Confidence is not authorization

**Дыра:** `High → выполнить` could accidentally auto-run sensitive/destructive/external actions in future apps.

**Исправлено:** independent risk gate. Auto-execute only reversible low-risk command with Undo; sensitive/destructive/send/publish/payment actions require confirmation regardless of model confidence.

## 60. Cross-app partial failure/idempotency

**Дыра:** one phrase may route to several services; no distributed transaction can guarantee all targets succeed. Retry could duplicate already-created objects.

**Исправлено:** stable capture_batch_id + intent_id + target/action idempotency; per-intent commit/status/retry/Undo; partial failure is first-class.

## 61. Vector provenance after audio deletion

**Дыра:** design says `Связано · Голосовой ввод`, while privacy says raw audio is deleted; UI could imply a playable recording.

**Исправлено:** provenance is metadata only (`source/channel/batch/intent/timestamp`), no audio pointer.

## 62. CJM contact ambiguity leaks a non-existent SHAGI entity

**Дыра:** `Иван П. — 2 контакта` could make implementation add Contacts to Task model.

**Исправлено:** SHAGI create_task keeps `Ивану` as title text; entity resolution only if the actual target action/domain owns a contact entity.

## 63. Illustrative wrong date in design

**Дыра:** on 29.08.2026 the CJM says `пятницы, 5 сент`, but 05.09.2026 is Saturday; next Friday is 04.09.2026.

**Исправлено:** mock date is explicitly non-normative; exact date comes from current local parser and is always shown. No literal example date enters tests/business logic.

## 64. Android permission mock

**Дыра:** design renders a styled microphone permission frame that could be reproduced as fake OS UI.

**Исправлено:** production uses the real Android/iOS OS permission dialog; SHAGI may show only an optional pre-permission explanation.

## 65. Raw-audio failure/offline retention

**Дыра:** `delete after successful recognition` did not define cancel/failure/no-network/crash.

**Исправлено:** transient audio deleted on success/cancel/failure/session expiry/crash cleanup. If no local ASR and no network, default is Text fallback, not hidden audio persistence.

## 66. Deferred unresolved voice items

**Дыра:** hands-free flow can finish with Medium/Low unresolved, but there was no storage/retention model.

**Исправлено:** local encrypted Review item retains minimum text/candidate data <=7 days or until resolution; raw audio remains deleted; user can clear immediately.

## 67. V01 File tab semantics

**Дыра:** Vector input list includes image/document/share, while mock Composer shows one `Файл` tab.

**Исправлено:** `Файл` is a multimodal adapter capable of file/image/document; OS Share is an external entrypoint to the same input contract. No unnecessary extra tabs mandated.

## 68. R3 telemetry privacy

**Дыра:** CJM introduces success metrics but not telemetry content limits.

**Исправлено:** only aggregate event/category/latency/confidence/correction counts; never audio, transcript or entity names.

## 69. Final design-v2 review result

After incorporating v2 and this reviewer pass, no known unresolved design/product contradiction is delegated silently to implementation. Future runtime thresholds/providers remain configurable engineering values behind stable semantic contracts.

## 70. Partial transcript side effects

**Дыра:** live partial ASR could trigger High-confidence creation before the user finished the phrase.

**Исправлено:** partial transcript is display-only; target commands require final segment/capture.

## 71. Cross-app sandbox impossibility

**Дыра:** CJM assumes silent routing to ZAPISKI/PRAKTIKA, but separate Android/iOS apps cannot directly write each other's local stores.

**Исправлено:** Target Capability Registry + target-service API. If target is local-only/unavailable/not authorized, intent is `requires_open/deferred_review`; no false success/direct sandbox write.

## 72. High confidence without reliable Undo

**Дыра:** an action might be classified reversible conceptually but target does not expose an actual undo command/token.

**Исправлено:** High auto-execute requires target-declared reliable Undo contract; otherwise confirmation required.

## 73. Vector review ownership

**Дыра:** unresolved Medium/Low items needed somewhere to live without creating a separate Vector app/nav root.

**Исправлено:** Vector Review is a capability surface inside invoking SIMPAS apps, backed by minimal expiring candidate state; no new app/tab.

## 74. Voice session unbounded resource use

**Дыра:** continuous thought dump had no implementation limits, risking memory/cost/abuse and unpredictable UX.

**Исправлено:** configurable initial limits 120 s / 20 intents / 20k transcript chars, graceful batch finalization, no silent truncation.

## 75. Lock-screen spoken-content leak

**Дыра:** hands-free feedback could read sensitive task/client text aloud.

**Исправлено:** generic acknowledgement by default on screenless/locked surfaces; sensitive content spoken only under explicit trusted-context setting.

## 76. Design-v2 post-review conclusion

R1 remains functionally unchanged by visual v2 except source/theme-showcase classification. R3 now has a complete journey plus executable boundaries for permissions, streaming finalization, risk, cross-app sandbox/auth, idempotency, partial failure, provenance, retention and deferred review.
