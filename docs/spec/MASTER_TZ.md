# ШАГИ — ПОЛНОЕ ТЗ НА РЕАЛИЗАЦИЮ

**Implementation Specification 1.2 DESIGN V2 REVIEWED / FROZEN · 29.08.2026**

> Актуальная версия после учёта Claude Design v2 и повторного независимого CPO/architecture review. Приоритет документов — в INDEX.md.


---

<!-- FILE: INDEX.md -->

# ШАГИ — пакет полного ТЗ на реализацию

**Версия:** Implementation Specification 1.2 DESIGN V2 REVIEWED / FROZEN  
**Дата:** 29 августа 2026  
**Продукт:** ШАГИ · экосистема СИМПАС  
**Статус:** готово к декомпозиции в эпики и реализации  
**Основание:** утверждённая Product/UX Specification v4.0 FINAL + Claude Design handoff v2 (R1 + VECTOR CJM) + повторный независимый CPO/architecture review.

## Состав

| Файл | Назначение |
|---|---|
| `00_MASTER_IMPLEMENTATION_TZ.md` | Главный инженерный контракт: цель, стек, архитектура, платформы, релизный scope, инварианты |
| `01_PRODUCT_BEHAVIOR_R1.md` | Исчерпывающее поведение R1 и edge cases |
| `02_DATA_MODEL_SYNC.md` | Модель данных, локальная БД, outbox, sync и conflicts |
| `03_BACKEND_API.md` | Backend, API, auth, attachments, entitlements и extension contracts |
| `04_UI_DESIGN_SYSTEM.md` | Production-перенос Claude Design: tokens, компоненты, responsive, accessibility |
| `05_SECURITY_PRIVACY_LEGAL.md` | Security, privacy, RF data localization, consent/telemetry |
| `06_TESTING_ACCEPTANCE.md` | Tests, perf budgets, visual regression, release gates, DoD |
| `07_RELEASES_FUTURE.md` | R1.1 → R3 с техническими extension points |
| `08_DEVOPS_CICD_OPERATIONS.md` | CI/CD, environments, deployment, backup, monitoring, rollback |
| `09_IMPLEMENTATION_PLAN.md` | Эпики, зависимости, параллельные lanes и checkpoints |
| `10_FINAL_REVIEW_LOG.md` | Независимый post-write review: найденные дыры и принятые исправления |
| `11_REFERENCE_BASE.md` | Provenance и внешние facts, проверенные на дату ТЗ |
| `12_SCREEN_STATE_MATRIX.md` | Полная матрица M01–M52/D01–D20/T/ST с implementation acceptance |
| `13_FINAL_VALIDATION_REPORT.md` | Финальный cross-file validation: автоматические и reviewer-проверки |
| `14_DESIGN_V2_DELTA.md` | Что изменил новый design handoff и какие implementation-contracts были скорректированы |
| `ШАГИ_FULL_IMPLEMENTATION_TZ_FINAL.md` | Все нормативные документы, объединённые в один файл |
| `source/` | Product Spec v4.0, Claude Design v2: R1 + VECTOR CJM, DS snapshot и оригинальный handoff ZIP |

## Приоритет источников истины

При расхождении верхний документ важнее нижнего:

1. `01_PRODUCT_BEHAVIOR_R1.md` — пользовательское поведение R1 и edge cases.
2. `02_DATA_MODEL_SYNC.md` — инварианты данных и синхронизации.
3. `03_BACKEND_API.md` — сетевые и backend-контракты.
4. `04_UI_DESIGN_SYSTEM.md` — production-визуал утверждённого handoff.
5. `00_MASTER_IMPLEMENTATION_TZ.md` — общая архитектура и scope.
6. `05_SECURITY_PRIVACY_LEGAL.md` — security/privacy constraints имеют veto над удобством реализации.
7. `07_RELEASES_FUTURE.md` — future releases.
8. `source/PRODUCT_SPEC_v4.0_FINAL.md` — продуктовый замысел, если вопрос не конкретизирован выше.
9. `source/R1_DESIGN_HANDOFF_v2.html` + `source/VECTOR_CJM_HANDOFF_v2.html` + `source/design-system-v2/` — current visual/CJM source for shown states.
10. Previous handoff files, if retained, are history only.

HTML Claude Design задаёт визуальный результат, а не DOM/React-архитектуру. Его внутренние `<x-import>`, showcase navigation, mock device frame и support runtime не копируются в production.

## Блокирующие красные линии

- R1 core полностью работает локально без аккаунта и сети.
- В R1 нет Voice/Vector и нет AI-зависимости.
- NLP R1 rule-based, deterministic и offline.
- Planned Date ≠ Deadline; Missed Plan ≠ Missed Deadline.
- Простая задача не требует заполнения сложной формы.
- Ни user content, ни названия задач/проектов/меток не попадают в telemetry или operational logs.
- Все строки через i18n; hardcoded user-facing text в reusable components запрещён.
- Все цвета/radii/type/shadows через DS tokens; literal product colors вне token layer запрещены CI.
- Platform shells не содержат product screens/business logic.
- Account Core, SHAGI data и будущие sensitive SIMPAS domains физически/логически разделены.
- Серверные персональные данные граждан РФ первично хранятся/обрабатываются в инфраструктуре РФ.
- Showcase themes `Бумага / Графит / Чернила`, зелёные рамки устройств и fake status bars из handoff — comparison/demo only, не production SHAGI.


## Design v2 rule

`source/R1_DESIGN_HANDOFF_v2.html` supersedes the old R1 HTML visually. `source/VECTOR_CJM_HANDOFF_v2.html` is the approved future R3 CJM/concept source. Behavior hardened in implementation specs remains normative over illustrative mock text.


---

<!-- FILE: 00_MASTER_IMPLEMENTATION_TZ.md -->

# ШАГИ — MASTER IMPLEMENTATION SPECIFICATION

**Версия:** 1.2 DESIGN V2 REVIEWED / FROZEN  
**Дата:** 29.08.2026  
**Владелец требований:** CPO СИМПАС  
**Назначение:** полный инженерный контракт на реализацию ШАГОВ с учётом Product Spec v4.0 и Claude Design handoff v2 (R1 + VECTOR CJM).

---

## 0. Цель R1

Построить самостоятельный personal task manager, который в public R1 даёт:

- local-first старт без регистрации;
- быстрый contextual Quick Add;
- deterministic Russian NLP;
- Today-first управление днём;
- Inbox capture queue;
- Projects / Sections / List / Board;
- temporal-модель `Available From / Planned Date / Planned Time / Duration / Deadline / Reminder`;
- recurrence с scheduled/completion anchors;
- subtasks + checklist;
- labels / priority / Today Focus;
- Plan agenda;
- search/system filters/completed;
- local notifications;
- offline-first;
- опциональный account/sync;
- Todoist/CSV import и полный backup/export;
- attachments/links в R1b;
- Android widgets в R1b;
- desktop command palette/global Quick Add;
- Free/Pro entitlement shell;
- production UI по утверждённому Claude Design.

R1 **не содержит** voice input, Vector, generative AI, внешние calendars, team workspace. Архитектура обязана позволить R1.1/R1.2/R1.3/R2/R3 без замены базовой Task model, navigation, Composer и sync protocol.

---

## 1. Платформы

### 1.1 Public R1 release gate

- **Android**: Tauri 2 Mobile; minSdk 26; targetSdk — актуальное обязательное значение магазина на момент release build.
- **Windows**: Windows 10 22H2+ / Windows 11 x64; arm64 из той же codebase допустим.
- **Web/PWA**: Chromium/Edge/Firefox/Safari — последние 2 major versions; installable app shell и offline launch.

### 1.2 Архитектурно обязательная готовность

- **iOS 16+**
- **macOS 13+**

Для iOS/macOS запрещены отдельные product forks: те же `packages/core`, `packages/ui`, `packages/app`, только thin platform shells/ports. Публикация может быть отдельным `R1.0.x` release train.

### 1.3 Platform parity

Различаются только capabilities: notifications, secure storage, widgets, haptics, share/deep-links, global shortcut, updater/store billing. Если capability отсутствует — UI адаптируется/скрывает action, domain behavior не fork'ается.

---

## 2. Baseline stack

Baseline выбран для унификации с уже используемым в СИМПАС cross-platform подходом и может меняться только через ADR.

### Client/toolchain

- Node.js **24 LTS+** для CI/tooling.
- pnpm 10+ workspaces.
- TypeScript 5.9+ strict.
- React 19.
- Vite 8+.
- Tauri 2 — native shells.
- Vitest — unit/integration.
- Playwright — Web E2E + visual regression.
- Zod — runtime schemas/contracts.
- `@js-temporal/polyfill` — domain time; native `Date` запрещён в domain rules.
- RFC 5545/RRULE-compatible representation для scheduled recurrence.
- минимальный UI state store (Zustand-equivalent); Local Repository, а не server cache, остаётся data source UI.

### Local storage

Native:
- SQLite, WAL;
- foreign keys ON;
- migrations;
- FTS5;
- attachments в app-private filesystem.

Web:
- IndexedDB через versioned repository adapter;
- OPFS/Blob where supported;
- одинаковая observable search semantics.

React components не используют SQLite/IndexedDB напрямую.

### Server

- Node.js 24 LTS+.
- Fastify 5.x.
- PostgreSQL **18.x** current stable major baseline.
- Redis 7.x+ для ephemeral queues/rate-limits/sync hints.
- S3-compatible object storage в РФ; baseline self-hosted MinIO или совместимый RF provider.
- Zod + OpenAPI 3.1.
- separate worker process.
- SQL migrations committed to repo; destructive auto-migration prohibited.

### Infrastructure

- Docker Compose baseline; orchestration can evolve without app changes.
- Nginx reverse proxy.
- TLS.
- PostgreSQL PITR/WAL.
- Object storage versioning/backup.

---

## 3. Monorepo

```text
shagi/
├── apps/
│   ├── web/            # PWA shell only
│   ├── desktop/        # Tauri desktop shell
│   └── mobile/         # Tauri mobile shell
├── packages/
│   ├── contracts/      # DTO/Zod/OpenAPI-compatible types
│   ├── core/           # domain entities/commands/invariants/recurrence/order
│   ├── storage/        # repositories + SQLite/IndexedDB adapters
│   ├── sync/           # outbox/inbox/HLC/merge
│   ├── nlp/            # deterministic Russian parser
│   ├── importer/       # Todoist/CSV/SHAGI backup
│   ├── ui/             # tokens/components
│   ├── app/            # ALL product screens/routes/behavior
│   ├── telemetry/      # sanitized event contracts only
│   └── platform/       # capability interfaces
├── server/
│   ├── api/
│   ├── worker/
│   └── migrations/
├── deploy/
├── docs/
│   ├── spec/
│   ├── adr/
│   ├── dev/
│   ├── product/
│   └── user/
├── scripts/
└── pnpm-workspace.yaml
```

**Invariant:** ни одного product screen/business rule/NLP/sync rule/user copy/pricing rule в `apps/*`.

---

## 4. Platform ports

```ts
interface LocalDbPort {}
interface FileStorePort {}
interface SecureCredentialsPort {}
interface NotificationSchedulerPort {}
interface DeepLinkPort {}
interface SharePort {}
interface GlobalShortcutPort {}
interface HapticsPort {}
interface WidgetPort {}
interface UpdaterPort {}
interface BillingPort {}
interface PushHintPort {}
interface NetworkStatusPort {}
interface CalendarProviderPort {} // R1.1
interface AudioCapturePort {}     // R3
```

Unsupported capability = `null/unsupported`. UI не показывает fake-disabled feature.

---

## 5. Domain time

Task time — floating local semantics.

- `Temporal.PlainDate`: planned/available/focus date.
- `Temporal.PlainTime|null`: planned/deadline local time.
- integer minutes: duration.
- `Temporal.Instant`: created/updated/completed/system timestamps.
- IANA timezone: conversion/notification scheduling only.

После перелёта задача `09:00` остаётся `09:00` локального времени. Planned task time нельзя хранить только как UTC instant.

Default locale: `ru-RU`; Monday-first; 24-hour time.

---

## 6. IDs, revisions, ordering

- UUIDv7 for user-created domain IDs, generated locally.
- **Exception:** recurrence-generated occurrence/subtask/checklist IDs use deterministic UUIDv5 derived from stable series/occurrence/template keys; this prevents duplicate next occurrences after concurrent offline completion.
- `device_id`: UUIDv7.
- mutable entities: logical `revision`.
- per-field Hybrid Logical Clock (HLC) для sync merge.
- manual order: fractional `rank` string; integer array index запрещён как persistent order.
- server monotonic cursor is sync transport only, not entity version.

---

## 7. Local-first transaction invariant

Любой user command сначала одной локальной transaction:

1. domain validation;
2. canonical local mutation;
3. outbox mutation;
4. query/search index update;
5. notification reconciliation;
6. immediate UI update.

Network не стоит в critical path. Sync failure не отменяет локально успешное действие.

---

## 7.1 Mandatory domain invariants

Shared domain validation, local repositories, tests and server sync validation must enforce:

- `planned_time` requires `planned_date`;
- `deadline_time` requires `deadline_date`;
- `section_id` requires `project_id`;
- in R1 a direct Subtask has the same Project and Section as its Parent;
- no parent cycle; user-created R1 depth <=1;
- `capture_state=inbox` is top-level only; Subtask is always `processed`;
- `focus_date` requires `planned_date == focus_date`;
- `day_bucket=later` requires Planned Date and resets whenever Planned Date changes;
- **R1 recurrence is top-level only (`parent_task_id=null`)**;
- completed status and `completed_at` are consistent;
- title after trim/newline normalization is non-empty;
- duplicate-looking Tasks are valid and are never auto-deduplicated by content.

The same validator is used for local commands and incoming sync mutations.

---

## 8. Source of truth

Local-only user: Local DB.  
Synced user: для UX source of truth всё равно Local DB; cloud — replica + convergence service.

UI никогда не строится напрямую из transient server response вместо local repository.

---

## 9. Offline boundary

Без сети работают:

- app launch;
- Today/Inbox/Plan/Projects;
- create/edit/complete/delete/undo;
- all R1 temporal fields;
- recurrence;
- labels/priority/focus;
- list/board/reorder;
- NLP;
- search/system filters;
- local reminders;
- local import/export;
- attachment link/local file metadata.

Network-bound:
- account/login;
- sync;
- cloud attachment upload;
- Yandex OAuth;
- billing validation;
- Shared invites;
- external calendars;
- remote Smart/Vector processing.

---

## 10. Engineering milestones

### R1a
Foundation + local DB + onboarding/local mode + task core + contextual Quick Add + NLP baseline + Today + Inbox + Plan agenda + Project List + temporal fields + one reminder + search + local notifications + offline/error states.

### R1b
Recurrence + subtasks/checklist + Board + labels/priority/focus polish + attachments/links + account/auth + sync + import/export + Android widgets + desktop command palette/global shortcut + multi-select + entitlement shell + Data & Privacy + production telemetry opt-in.

**Public R1 = R1a + R1b.** R1a is internal milestone, not market promise.

---

## 11. Future release contracts

- R1.1 Planning: Day/Week/Month, time blocking, external calendars, advanced filters/reminders/history.
- R1.2 Smart: deterministic capacity/planner + AI assistance with preview.
- R1.3 Shared: personal shared projects, members, assignments, comments/activity.
- R2 SIMPAS: opaque links between separate service domains.
- R3 Vector: GigaAM voice + multimodal router, multi-intent split, per-intent confidence/risk, cross-app idempotency, provenance and review queue.

Future layers invoke existing domain commands rather than writing parallel task data.

---

## 11.1 Reminder platform capability matrix

- **Android:** explicit timed reminders use native scheduling. For precise user-selected times, check exact-alarm capability and current store policy. If exact scheduling is unavailable, disclose reduced precision and offer the OS settings path; never silently present an inexact alarm as exact.
- **Windows:** reminders must fire through native scheduled notification/background capability with the main window closed.
- **Web/PWA local-only:** future delivery cannot be guaranteed after all browser processes close. UI explicitly discloses this. Reliable closed-browser reminders require Sync + Web Push/server fallback.
- **iOS/macOS future:** native local notifications through the same platform port.

Notification permission/access is requested just-in-time, not at first launch.

---

## 12. Performance budgets

| Metric | Release budget |
|---|---:|
| local create/complete commit | p95 <50 ms |
| Today query, 50 visible | p95 <80 ms |
| Today from 500 candidates | p95 <150 ms |
| search 10k tasks | p95 <80 ms |
| search 100k tasks | p95 <250 ms |
| Quick Add main-thread keystroke | <16 ms |
| NLP typical parse | p95 <30 ms |
| Android usable cold/local | p95 <2.5 s mid-range |
| Windows warm launch | p95 <1.5 s |
| PWA warm/offline | p95 <1.5 s |
| apply 1000 sync mutations excluding RTT | <1 s |
| Board 500 cards | virtualization; 60fps target |
| Android working-set target | <180 MB |
| Windows target | <250 MB |

Existing local data screen must never await remote API to render.

---

## 13. Documentation

- `docs/spec/` frozen source specs.
- Stack/architecture deviation → ADR before implementation.
- user-visible change updates `docs/user/` and changelog in same PR.
- API change updates OpenAPI + server docs.
- DB migration includes upgrade test and recovery/rollback strategy.
- Feature flag without enabled/disabled tests is incomplete.

## 13.1 Localization contract

- R1 production locale `ru-RU` is mandatory and complete.
- Every user-facing string lives in i18n catalog; reusable components contain no literal product copy.
- Missing Russian key/fallback-to-key in production build is a CI failure.
- Date/time formatting uses locale layer, never handwritten month strings in domain logic.
- Architecture must allow future locales without forking components or domain behavior.

---

## 14. Dependency / IP gate

- Generate SBOM for every release.
- Do not copy competitor source code, proprietary assets/icons or pixel-for-pixel visual compositions.
- Todoist migration uses public documented CSV/backup formats only; no private API dependency.
- GPL/AGPL/SSPL/source-available dependency with reciprocal/network obligations requires explicit architecture/legal approval before merge.
- Bundled fonts/icons must permit commercial redistribution; required third-party notices ship in `О приложении / Лицензии`.

## 15. Design v2 interpretation contract

- R1 visual source is `R1_DESIGN_HANDOFF_v2.html`.
- VECTOR future source is `VECTOR_CJM_HANDOFF_v2.html`.
- The v2 R1 HTML replaces the old comparator theme with `paper / graphite / ink`; these are **ZAPISKI-family showcase/comparison themes**, not shipping SHAGI themes. R1 SHAGI still ships System/Light/Dark only.
- VECTOR CJM is normative for the journey and screen intent, but illustrative dates/contact examples are not domain truth. Exact dates come from the real parser/current locale; mock OS prompts are never re-created as fake custom system dialogs.
- R1 remains voice-free. No R3 component is exposed before its release flag.

## 15.1 Cross-app sandbox boundary — R3

Separate mobile/desktop applications must never assume direct access to each other's local database/sandbox. Vector target execution follows:

1. same-app target → normal local domain command;
2. cross-app target with authenticated target service → scoped target-service API;
3. target unavailable/not authorized/local-only without command bridge → intent remains unresolved and offers later Review / `Открыть приложение для завершения`;
4. direct file/DB writes into another app sandbox are prohibited.

A Target Capability Registry advertises supported action types, authorization state, risk class and Undo capability.


---

<!-- FILE: 01_PRODUCT_BEHAVIOR_R1.md -->

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


---

<!-- FILE: 02_DATA_MODEL_SYNC.md -->

# ШАГИ — DATA MODEL, LOCAL STORAGE & SYNC

---

## 1. Principles

- UUIDv7 for user-created entities/ops/devices.
- Deterministic UUIDv5 for recurrence-generated occurrence/subtask/checklist graph.
- `deleted_at` is implementation tombstone, not user-visible status.
- manual order = fractional rank.
- all mutations through domain commands.
- all migrations versioned/tested.
- no UI component direct DB writes.

---

## 2. Core schema

### tasks

| Field | Type | Rule |
|---|---|---|
| id | uuid | UUIDv7 |
| owner_scope | text | local profile or account scope |
| title | text | 1..500 |
| description | text | <=100k |
| status | enum | active/completed |
| capture_state | enum | inbox/processed |
| project_id | uuid? | |
| section_id | uuid? | same project |
| parent_task_id | uuid? | no cycle |
| rank | text | fractional |
| priority | int | 1..4, default 4 |
| focus_date | date? | local PlainDate |
| day_bucket | enum | default/later |
| available_from | date? | |
| planned_date | date? | |
| planned_time | time? | floating local |
| duration_min | int? | 1..1440 |
| deadline_date | date? | |
| deadline_time | time? | null=date-only |
| series_id | uuid? | recurrence only top-level in R1 |
| occurrence_seq | bigint? | stable generation number |
| generated_from_occurrence_id | uuid? | atomic undo/audit |
| original_project_name_snapshot | text? | history context after project deletion |
| original_section_name_snapshot | text? | history context after section deletion |
| source | enum | user/import/recurrence/vector/future |
| source_channel | enum? | text/voice/file/image/share; future Vector provenance |
| source_capture_batch_id | uuid? | opaque cross-app Vector capture correlation; no audio pointer |
| source_intent_id | uuid? | stable idempotency/provenance of one routed intent |
| created_at | instant | |
| updated_at | instant | |
| completed_at | instant? | |
| completion_kind | enum? | done/skipped; null while active |
| deleted_at | instant? | tombstone |
| revision | bigint | |
| clocks | json | per-field HLC |

Domain/DB checks mirror temporal constraints.

### projects

id, title, description, color_token, icon, default_view(list/board), favorite, archived_at, rank, timestamps, clocks, deleted_at.

### sections

id, project_id, title, rank, clocks, deleted_at.

### labels

id, normalized_name, display_name, color_token?, rank, clocks, deleted_at.

### task_labels

`task_id, label_id, add_hlc, remove_hlc`; relation exists when add_hlc > remove_hlc.

### checklist_items

id, task_id, text, done, rank, clocks, deleted_at.

### reminders

id, task_id, kind(explicit/deadline_approaching/deadline_missed), local_rule_json, enabled, scheduled_fingerprint.

### recurrence_series

id, anchor_type(scheduled/completion), rrule?, completion_interval_json?, template_json, active, **next_occurrence_seq, stop_after_occurrence_seq?, template_revision**, clocks, timestamps.

Template holds relative temporal offsets + defaults + stable subtask/checklist template IDs.

Each materialized recurring Task additionally stores `occurrence_seq`, `template_revision_applied` and `override_fields[]`.

### attachments

id, task_id, display_name, mime, size, sha256, local_uri?, object_key?, state(local_pending/uploading/synced/failed/deleted), timestamps.

### task_links

id, task_id, url, display_label?, timestamps.

### import_batches

id, source, started_at, finished_at, rollback_deadline, status, report_json.

### sync_outbox

op_id, device_id, entity_type, entity_id, patch_json, field_clocks_json, base_revision, created_at, retry_count.

### sync_conflicts

id, entity_type, entity_id, field, local_value, remote_value, winner_value, local_clock, remote_clock, resolved_at.

---

## 2.1 Canonical relational/domain constraints

Enforced in shared validator and DB/integration tests:

- planned_time requires planned_date;
- deadline_time requires deadline_date;
- section_id requires project_id;
- direct child Task shares Project/Section with Parent in R1;
- no parent cycle; user-created depth <=1;
- recurring Task is top-level;
- child capture_state=processed;
- focus_date is null or equals planned_date;
- day_bucket=later requires Planned Date;
- completed status and completed_at are consistent.
- active Task has `completion_kind=null`; completed normal Task uses `done`, skipped recurrence uses `skipped`.

Cross-row constraints SQLite cannot express as CHECK are enforced transactionally in repository/domain tests and server validation.

---

## 2.2 Future Vector provenance records — R3

R3 may add a lightweight local `vector_capture_batches` table:

```text
vector_capture_batches
- id                  UUID
- created_at          Instant
- source_channel      voice|text|file|image|share
- intent_count        integer
- resolution_state    resolved|needs_review|partial_failure
- expires_at          Instant?
```

It stores **no raw audio** and no mandatory full transcript. Its role is correlation/provenance/retry UI.

Each routed intent has a stable `intent_id`; per-target command idempotency key is derived from `capture_batch_id + intent_id + target_service + action_type`. Cross-app retries therefore cannot duplicate a successfully-created Task/Note.

Future per-intent review record fields:
- intent_id;
- target_service/action_type;
- confidence_class/risk_class;
- status;
- minimum candidate payload needed for confirmation;
- target_capability_version;
- idempotency_key;
- undo_token_ref? (opaque, short-lived; never target secret);
- expires_at.

Review queue is a Vector capability surfaced inside the invoking SIMPAS app, not a separate application/navigation root.

Objects created in different SIMPAS apps may share the same opaque `source_capture_batch_id`; this proves common origin without retaining audio.

Unresolved text snippet/candidate payload may be kept locally/encrypted only while the user still needs review, then removed according to R3 retention rules.

---

## 3. SQLite indexes

- tasks(status, planned_date)
- tasks(status, deadline_date)
- tasks(capture_state, status)
- tasks(project_id, section_id, status, rank)
- tasks(parent_task_id, status, rank)
- tasks(focus_date, status)
- tasks(series_id, status)
- sections(project_id, rank)
- task_labels(task_id), task_labels(label_id)
- FTS5 task title/description + denormalized project/label searchable fields.

Search index rebuildable from canonical rows.

---

## 4. Web storage

IndexedDB logical schema mirrors native contracts. Search implementation may differ internally, but normalization/ranking/result semantics must match native golden tests.

Service worker must never upload/cache user task content to CDN cache.

---

## 5. Fractional ranking

Insert/move generates rank between neighbors. Renormalize only when rank length threshold exceeded, transactionally, with batch sync. Do not update every sibling on each drag.

---

## 6. Hybrid Logical Clock

Conceptual format:

```text
physical_ms:counter:device_id
```

- local mutation advances;
- remote receive observes max then advances;
- tolerate clock skew;
- tie-breaker deterministic by device_id.

---

## 7. Sync lifecycle

Local command writes entity + outbox atomically.

Foreground worker:
1. push <=500 ops;
2. server idempotently accepts by op_id;
3. server returns accepted + remote delta/cursor;
4. client merges;
5. cursor advances;
6. acked outbox deleted.

Retry: 1s, 2s, 5s, 15s, 30s, then max 5min while foreground; background platform scheduling thereafter.

Server assigns monotonic `server_seq`; client cursor opaque.

Bootstrap = compressed snapshot + cursor; then deltas.

---

## 8. Merge rules

### Scalar
Per-field LWW by HLC.

### Disjoint concurrent changes
Auto-merge (e.g. title vs date).

### Same user-visible field
Higher HLC wins; loser stored in conflict shadow. If causally concurrent and meaningfully different, surface conflict: choose A/B or `Сохранить обе` clone where meaningful.

### Completion + edit
Status and content independent → completed task may contain concurrent edited content.

### Delete + edit
Delete wins visibility; edited payload retained in tombstone/conflict shadow 90 days. Optional restore clone via conflict UX; no silent resurrection.

### Labels
OR-set semantics.

### Checklist/subtasks
Independent records with rank.

### Rank
LWW; same effective position gets deterministic ID/device tie order then background normalization.

---

## 9. Tombstones

After 6s UI Undo window:
- local tombstone 90 days;
- server tombstone 90 days;
- prevents stale offline device resurrection.

Account deletion follows separate privacy deletion lifecycle and is not ordinary tombstone retention.

---

## 10. Conflict UX threshold

Do not surface every technical merge. Show only same visible field concurrent changes where loser differs and automatic result can surprise user. Conflicts never block continuing local work.

---

## 11. Local → account merge

No fuzzy/title/date dedupe.

- same stable UUID known cloud → HLC merge;
- unknown UUID → new upload;
- visually identical different UUID → both retained.

This is deliberate data-loss prevention.

---

## 11.1 Remote mutation validation

Before accepting/merging a remote patch, shared validator checks ownership/scope, Project/Section/Parent relations, hierarchy, temporal rules, recurrence top-level restriction and creation entitlements.

Invalid mutation is rejected with a stable error code and never stored as an invalid server snapshot. Client keeps the rejected op actionable until repaired.

---

## 12. Schema negotiation

Every sync request includes client schema version. Server can return `UPGRADE_REQUIRED` if client cannot safely interpret data. Newer client may continue local mode while sync paused; no destructive down-conversion.

Server supports at least 2 active minor client versions where security/schema permits.

---

## 13. Recurrence consistency

### Deterministic IDs

`recurrence_series` has a monotonically increasing occurrence sequence.

Generated occurrence:
`UUIDv5(namespace=series_id, name="occurrence:"+occurrence_seq)`.

Generated child/checklist:
`UUIDv5(namespace=occurrence_id, name="subtask:"+stable_template_item_id)` and `checklist:`.

This exception to UUIDv7 prevents two offline devices from creating two logical next occurrences.

### Atomic completion

One local transaction:
- complete current;
- calculate first valid next occurrence;
- increment sequence;
- generate deterministic next graph;
- store generated_from_occurrence_id;
- enqueue all ops.

### Series delete race — remove-wins

Whole-series delete writes `stop_after_occurrence_seq`. Any generated occurrence with a sequence above that boundary is suppressed/tombstoned regardless of LWW/HLC ordering. The boundary itself merges by max/remove-wins semantics and cannot be lowered by a stale client.

### Template revision reconciliation

Whole-series edit increments `template_revision`. A generated occurrence records the revision used plus `override_fields`. During sync, if a newer template exists, only fields not overridden for that occurrence are reconciled to the newest template. Completed/skipped historical occurrences are immutable.

### Undo

Generated graph is reversed atomically if untouched. If remote edits exist, preserve them and surface conflict rather than delete remote work.

---

## 14. Notification reconciliation

Every startup/background wake compares desired schedule fingerprints with OS scheduled notification IDs, cancels stale and creates missing.

Native horizon:
- Android/Windows: 90 days;
- future iOS: rolling nearest 50 pending notifications;
- Web: service worker/push capability where available.

---

## 15. Migration safety

Before local DB schema migration:
- native atomic DB backup/checkpoint;
- web versioned IndexedDB upgrade and recovery snapshot for destructive changes.

Migration failure never wipes data; open previous/read-only recovery path and report technical error.


---

<!-- FILE: 03_BACKEND_API.md -->

# ШАГИ — BACKEND & API SPECIFICATION

---

## 1. Service boundaries

- `account-core` — identity/session/consent; reusable across SIMPAS.
- `shagi-api` — SHAGI sync/application APIs.
- `shagi-worker` — transactional mail, notification fallback, cleanup, billing jobs.
- Account PostgreSQL DB — separate credentials/storage.
- SHAGI PostgreSQL DB — separate credentials/storage.
- Redis.
- S3/MinIO.

No direct SQL joins across SHAGI/PRAKTIKA/ZAPISKI databases.

---

## 2. API base

Configurable production default:

```text
https://shagi-api.cmpas.ru/v1
https://shagi.cmpas.ru
```

Never hardcode into product logic. All JSON UTF-8. Mutation endpoints support idempotency. Every response includes request_id.

---

## 3. Auth

### POST `/auth/email/request`
`{"email":"user@example.com"}` → generic 202.

### POST `/auth/email/verify`
Email + OTP + device metadata → access/refresh + account summary.

### POST `/auth/yandex/exchange`
PKCE auth-code exchange.

### POST `/auth/refresh`
Rotating refresh.

### POST `/auth/logout`
Revoke current session/token.

### GET `/account`
Profile, subscription/entitlements, consent versions.

### DELETE `/account`
Re-auth required; starts irreversible deletion workflow.

---

## 4. Devices

- GET `/devices`
- PATCH `/devices/:id` — name/timezone/push token/app capabilities/version
- DELETE `/devices/:id` — revoke refresh + push token

---

## 5. Sync API

Every incoming operation is validated with the same shared domain invariants as local commands. A valid session does not make client-supplied ownership/parent/project relations trusted.

### POST `/sync/push`

```json
{
  "device_id":"uuid",
  "client_schema":1,
  "cursor":"opaque",
  "ops":[{
    "op_id":"uuid",
    "entity_type":"task",
    "entity_id":"uuid",
    "base_revision":12,
    "patch":{"planned_date":"2026-09-12"},
    "clocks":{"planned_date":"hlc"}
  }]
}
```

Returns accepted/rejected/conflicts/new cursor/optional remote delta.

### GET `/sync/pull?cursor=...&limit=1000`
Delta.

### GET `/sync/bootstrap`
Compressed snapshot + cursor.

`op_id` unique/idempotent; repeated push returns same acceptance, never duplicate mutation.

---

## 6. Server storage

Relational ownership/permissions + versioned snapshots/oplog.

Core:
- user reference (opaque account user_id);
- devices;
- entity snapshots;
- sync operations;
- client cursors;
- attachment objects;
- legal/entitlement references.

Future:
- shared memberships/comments/activity;
- calendar connections;
- SIMPAS linked refs.

JSONB snapshot allowed only with indexed relational ownership/scope fields and explicit schema version.

Merge semantics imported/shared from monorepo contracts/core; do not reimplement divergent server logic.

---

## 7. Attachments

### POST `/attachments/init`
metadata/checksum/size → quota/MIME/ownership validation → upload token/URL.

### POST `/attachments/:id/complete`
validate object/checksum.

### GET `/attachments/:id/download`
short-lived signed URL/auth stream.

### DELETE `/attachments/:id`
tombstone + cleanup.

Security:
- opaque object key;
- no raw filename in path;
- sanitized Content-Disposition;
- unsafe MIME not inline;
- malware-scan hook;
- quotas enforced server-side.

---

## 8. Push/sync hints

Default push payload contains no title/description:

```json
{
  "type":"sync_hint|notification_fallback",
  "notification_id":"uuid",
  "entity_id":"uuid",
  "due_at":"instant"
}
```

Client syncs/reads local data. If unavailable: `Напоминание в ШАГАХ`.

---

## 9. Transactional email

Only OTP, future Shared invites, billing/support legally required messages. Marketing requires separate consent.

Email provider must be approved data processor; primary account DB stays RF-localized.

---

## 10. Legal registry

```text
legal_documents:
 id,type,version,effective_at,content_hash,url

consents:
 user_id,document_id,purpose,accepted_at,revoked_at,source
```

Mandatory agreement/privacy acknowledgement separate from optional analytics/diagnostics/marketing.

---

## 11. Entitlements

Keys:

```text
projects_limit
advanced_calendar
external_calendars
advanced_filters
advanced_reminders
extended_history
advanced_widgets
smart_features
advanced_themes
attachment_quota_bytes
attachment_max_file_bytes
```

Signed entitlement document cached client-side with expiry.

### Billing adapters

- Web/Windows baseline: Т‑Касса server checkout.
- Android RuStore channel: RuStore Billing + server receipt validation.
- future iOS: StoreKit 2 + App Store validation.
- other stores implement same BillingPort.

Never grant durable Pro from client purchase callback without server validation.

Downgrade never deletes content.

---

## 12. Import backend boundary

Todoist/CSV parsing is local where feasible. Source import file not uploaded/stored server by default.

ZIP guards:
- compressed <=100MB;
- expanded <=500MB;
- <=10k entries;
- no path traversal;
- no nested recursive expansion.

---

## 13. R1.1 External Calendar contract

Providers:
- Yandex Calendar;
- Google Calendar;
- Microsoft Outlook/365.

Initial privacy baseline: **read-only ingestion**.

Provider tokens encrypted server-side. Store minimum cache for display/capacity. SHAGI Tasks/time blocks are not written to external calendar by default.

Endpoints: connect/start, callback, list connections, sync, disconnect.

---

## 14. R1.2 Smart API

Capacity arithmetic and scheduling heuristic local/deterministic where possible.

Remote AI only for:
- Break into steps;
- Next step;
- Estimate duration when heuristic not enough.

Request sends only user-selected required context. No raw task prompt in normal logs. Provider no-training. RF-hosted gateway baseline; foreign processing only after explicit legal approval/consent flow.

Response is `proposal`, never mutation.

---

## 15. R1.3 Shared API

Requires account.

- POST `/projects/:id/share`
- POST `/projects/:id/invites`
- DELETE `/projects/:id/invites/:id`
- GET `/projects/:id/members`
- DELETE `/projects/:id/members/:user_id`
- POST `/projects/:id/leave`
- POST/GET `/tasks/:id/comments`

Roles: Owner/Member.

Invite token:
- >=256-bit random;
- TTL 7d;
- project-scoped;
- revocable.

Revoked member mutations rejected server-side; local shared cache purged at next authenticated sync.

---

## 16. R2 SIMPAS boundary

Store opaque ref only:

```json
{"service":"zapiski|praktika|momenty","object_id":"opaque","link_scope":"user-explicit"}
```

No copied source-object content by default. Display metadata fetched via scoped service API. No cross-domain SQL join.

PRAKTIKA links require explicit selection and stricter privacy/audit rules.

---

## 17. R3 Vector — backend/stream contract

Design v2 source: `VECTOR_CJM_HANDOFF_v2.html`.

### 17.1 Pipeline

`Input → ASR/Extraction → Intent split → Entity resolution → Router → per-intent Confidence + Risk gate → Target command → per-intent result`.

One capture can produce N independent intents and multiple target apps. No distributed all-or-nothing transaction is attempted across SIMPAS services. Each intent commits independently and has its own status/retry/Undo.

### 17.2 ASR

Baseline Russian ASR: **GigaAM**.

- streaming partial + final transcript supported;
- server path normalizes to 16 kHz mono PCM/compatible stream internally;
- on-device/local GigaAM-compatible adapter may be used only if device benchmarks and licensing allow; it must emit the same transcript contract;
- if on-device ASR is unavailable and network is unavailable, default behavior is to **not persist raw audio for later upload**. The session explains that voice needs connectivity and offers Text. A future explicit `Сохранить запись до подключения` mode would require a separate product/privacy decision.

### 17.3 Session API

Conceptual endpoints (exact transport may use WebSocket/WebTransport/native stream):

```text
POST /vector/sessions
WS   /vector/sessions/:id/stream
POST /vector/sessions/:id/finalize
POST /vector/sessions/:id/intents/:intent_id/confirm
POST /vector/sessions/:id/intents/:intent_id/correct
POST /vector/sessions/:id/intents/:intent_id/clarify
POST /vector/sessions/:id/intents/:intent_id/retry
DELETE /vector/sessions/:id
```

Session response includes:

```json
{
  "capture_batch_id":"uuid",
  "asr_state":"listening|finalizing|done|failed",
  "partial_transcript":"...",
  "intents":[
    {
      "intent_id":"uuid",
      "target_service":"shagi|zapiski|praktika|momenty",
      "action_type":"create_task",
      "confidence_class":"high|medium|low",
      "risk_class":"reversible_create|reversible_update|sensitive|external_side_effect|destructive",
      "preview":{},
      "status":"parsed|awaiting_confirmation|awaiting_clarification|deferred_review|requires_open|committed|failed|undone"
    }
  ]
}
```

Client never depends on raw numeric model probability. Confidence thresholds/model version are server/config-versioned; client renders the semantic class and reasons needed for correction.

### 17.3.1 Final vs partial transcript

Partial transcript is **display-only** and must never create/modify domain objects. Intent actions become eligible only after a segment is final (endpoint detection/explicit Finish) and has passed confidence/risk policy. This prevents mid-sentence side effects.

Baseline R3 limits are server-configurable but start at:
- 120 seconds continuous voice capture/session;
- 20 extracted intents per capture;
- 20,000 final transcript characters.

At the limit, the client finalizes the current batch and offers `Продолжить новым вводом`; it never silently truncates accepted speech.

### 17.3.2 Target Capability Registry

Vector Router resolves target actions against a versioned registry:

```json
{
  "service":"zapiski",
  "action_type":"create_note",
  "availability":"local|remote|requires_open|unavailable",
  "auth_required":true,
  "risk_class":"reversible_create",
  "supports_undo":true,
  "schema_version":3
}
```

Rules:
- same-app SHAGI create_task can use local command;
- cross-app background creation requires an authenticated/scoped target-service command API;
- mobile sandbox isolation is never bypassed by direct DB/file writes;
- if target is `requires_open/unavailable`, intent remains in Vector Review and may offer a signed/deep-link `Открыть приложение для завершения`;
- if the user has no target account/sync capability, Vector must not pretend the cross-app action already succeeded.

### 17.3.3 Undo contract

A target command eligible for High auto-execute returns an opaque `undo_token`/`undo_until` or equivalent reliable reversible command. If reliable Undo is unavailable, the action cannot use auto-execute even if confidence is High.

### 17.4 Confidence is per intent

- **High:** may auto-execute only when `risk_class` is reversible and the target command supports reliable Undo.
- **Medium:** preview/confirmation.
- **Low:** exactly one minimal clarification at a time.

Confidence never overrides risk. Sensitive/irreversible/external-side-effect operations require confirmation even at High confidence. This is especially mandatory for future PRAKTIKA-sensitive actions, destructive operations and any action that sends/publishes data outside the user's own storage.

### 17.5 Entity-resolution boundary

Do not invent structured entities the target domain does not have.

Example from the CJM, `Отправить Ивану презентацию`, can remain a SHAGI Task title; SHAGI R3 must **not** add a Contacts model merely because the design illustration says `2 контакта с этим именем`. Contact disambiguation is used only if a future action actually targets a contact-aware service.

### 17.6 Cross-app idempotency and partial failure

Every intent uses a stable idempotency key derived from `capture_batch_id + intent_id + target_service + action_type`.

If SHAGI succeeds and ZAPISKI fails:
- successful object remains;
- failed intent shows Retry;
- retry cannot duplicate successful intents;
- batch becomes `partial_failure`;
- user can Undo any committed reversible intent independently.

### 17.6.1 Batch UI semantics

Batch has no `commit all regardless` server operation. `Finalize` closes ASR/parsing; it does not bypass per-intent confirmation. Client renders each intent state independently.

A conceptual design CTA such as `Сохранить все 3` may be used only when every remaining item is already valid/confirmed/reversible under policy; otherwise use `Продолжить`, `Подтвердить N` or `Завершить` with unresolved states explicit.

### 17.7 Provenance

Target objects receive only:
- `source=vector`;
- `source_channel`;
- opaque `source_capture_batch_id`;
- `source_intent_id`;
- creation timestamp.

UI may show `Создано через ВЕКТОР · 09:14` / `Голосовой ввод · 09:14`. It is **not a link to the deleted audio**. Cross-app objects can be correlated by opaque batch id without storing the recording.

### 17.8 Voice session retention

Raw audio is transient by default:
- delete after successful final transcript;
- delete immediately on cancel;
- delete on failure/session timeout/crash cleanup;
- no raw audio in logs/analytics/backups;
- no voiceprint/biometric identity.

If an unresolved intent must be reviewed later, retain only the minimum text/candidate payload required for review, encrypted under normal app-data controls. Default unresolved-review retention: 7 days or until resolved/deleted, whichever comes first. User can clear it immediately from Data & Privacy.

### 17.9 Vector calls normal target commands

SHAGI intent invokes the same `CreateTaskCommand` / validation / capture semantics as text Quick Add. Vector never writes SHAGI DB directly and never bypasses temporal, entitlement or sync invariants.

---

## 18. Support/admin boundary

Operator/support tooling may show technical account metadata only: opaque IDs, authorized account status/email, devices, app/schema versions, sync errors/cursors, entitlements and quota.

Task/project/label/checklist text and attachment filenames are not visible in admin by default. Content enters support only through an explicit user-exported support bundle. No hidden `view all user tasks` capability.

---

## 19. Error contract

```json
{
  "error":{
    "code":"PROJECT_LIMIT_REACHED",
    "message_key":"errors.project_limit",
    "details":{},
    "request_id":"..."
  }
}
```

Stable codes include:
AUTH_OTP_INVALID, AUTH_OTP_EXPIRED, AUTH_RATE_LIMITED, AUTH_REQUIRED, PERMISSION_DENIED, UPGRADE_REQUIRED, SYNC_CONFLICT, SYNC_SCHEMA_TOO_NEW, PROJECT_LIMIT_REACHED, TEMPORAL_CONFLICT, ATTACHMENT_TOO_LARGE, ATTACHMENT_QUOTA_EXCEEDED, ATTACHMENT_UPLOAD_FAILED, IMPORT_INVALID, IMPORT_PARTIAL, SUBSCRIPTION_REQUIRED, CALENDAR_AUTH_EXPIRED, SHARED_MEMBERSHIP_REVOKED, SMART_DISABLED, SMART_PROVIDER_UNAVAILABLE, VECTOR_LOW_CONFIDENCE, VECTOR_PARTIAL_FAILURE, VECTOR_MIC_PERMISSION_DENIED, VECTOR_SESSION_EXPIRED.

Server `message` is never rendered directly; UI uses localized catalog.


---

<!-- FILE: 04_UI_DESIGN_SYSTEM.md -->

# ШАГИ — PRODUCTION UI / DESIGN SYSTEM

Основание: `source/R1_DESIGN_HANDOFF_v2.html` + `source/VECTOR_CJM_HANDOFF_v2.html` + bundled SIMPAS DS snapshot.

---

## 1. Что является source of truth

Production:
- SHAGI palette/tokens;
- typography hierarchy;
- spacing/radii/shadows;
- SHAGI ServiceMark;
- shown app layouts/states;
- mobile bottom navigation;
- desktop sidebar/list/inspector pattern;
- approved copy semantics;
- dark mode values;
- demonstrated interaction intent.

Not production:
- showcase sticky header/navigation;
- Light/Dark/Бумага/Графит/Чернила showcase theme switcher as product screen;
- green phone/device border;
- fake `9:41` status bars;
- Claude support runtime;
- `<x-import>`/DCLogic/HTML hierarchy;
- remote Google Fonts import;
- `paper`, `graphite`, `ink` ZAPISKI-family comparator themes;
- external frame labels `[R1][M]...`.

---

## 2. Fonts

- Geist 400/500/600/700 — UI.
- Geist Mono 400/500/600 — time/tabular/technical microcopy.

Fonts self-hosted/packaged. Runtime Google Fonts network dependency prohibited.

Fallback: `-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial`.

---

## 3. Light tokens

```css
--forest-900:#143D2F;
--forest-800:#1D4735;
--forest-700:#285B46;
--forest-600:#2F6A52;
--forest-500:#3B8F5A;
--sage-50:#F6FAF6;
--sage-100:#EEF4EF;
--sage-150:#E7F0EA;
--sage-200:#DDE9E1;
--sage-300:#C7D8CD;
--gold-500:#CC9E50;
--gold-400:#D8AE67;
--ink-900:#142018;
--ink-500:#5F6C64;
--cream:#F7F8F4;
--white:#FFFFFF;
--background:#F7F8F4;
--foreground:#142018;
--card:#FFFFFF;
--muted:#F2F4EF;
--muted-foreground:#5F6C64;
--border:#E4E9E3;
--primary:#1D4735;
--accent:#CC9E50;
--destructive:#E35D4F;
```

ServiceMark:
- bg `#3B8F5A`
- fg `#F7F8F4`.

---

## 4. Dark theme exact baseline

```css
--background:#10221A;
--foreground:#EAF3EC;
--card:#173326;
--card-foreground:#EAF3EC;
--popover:#173326;
--popover-foreground:#EAF3EC;
--muted:#1C3B2C;
--muted-foreground:#9FB3A6;
--secondary:#1C3B2C;
--secondary-foreground:#EAF3EC;
--border:#24452F;
--input:#1C3B2C;
--ring:#D8AE67;
--accent:#D8AE67;
--accent-foreground:#142018;
--primary:#3B8F5A;
--primary-foreground:#0E1E16;
--destructive:#E8695A;
--destructive-foreground:#1A0D0A;
--blue-soft:#12233A;
--blue-500:#6FA8FF;
--violet-soft:#241B3A;
--violet-500:#B39DFF;
--orange-soft:#3A2712;
--orange-500:#FFA75C;
--red-soft:#3A1512;
--red-500:#FF8A7A;
--success-soft:#123422;
--success-500:#5FBE84;
--amber-soft:#332708;
--amber-500:#E8B96A;
--sage-50:#16281F;
--sage-100:#1B3226;
--sage-150:#1F3A2B;
--sage-200:#254433;
--sage-300:#33573F;
```

`System` follows OS. SHAGI production ships System/Light/Dark only. The v2 handoff comparator themes `Бумага / Графит / Чернила` demonstrate ZAPISKI-family styling and are not SHAGI product themes.

---

## 4.1 Semantic state mapping from approved handoff

- Deadline missed → `--red-soft` / `--red-500` + explicit `Просрочен срок`.
- Missed plan → `--orange-soft` / `--orange-500` + explicit `Не по плану`.
- Today Focus → `--gold-500`.
- normal navigation/completion → forest.
- muted/disabled → neutral/sage.

State meaning is never color-only.

### R1 Project marker palette

Controlled tokens only: forest, gold, blue, violet, orange, red, neutral/sage. Marker is a small dot/icon, not a full rainbow surface. Default forest. Labels have no arbitrary color picker in R1.

---

## 5. Typography

- Page title: 40/44 desktop.
- Hero: 24/30.
- Section title: 20/26.
- Body primary: 15/22.
- Body secondary: 14/20.
- Meta: 12/16.
- Caption: 11/14, uppercase, 700, tracking .04em.
- tabular numbers use `font-variant-numeric: tabular-nums`.

Mobile Today heading follows handoff ~22px rather than blindly using desktop page title.

---

## 6. Spacing / radius / shadow

Spacing: 4,8,12,16,20,24,32,40,48.

Radii: 8,12,16,20,24,999.

Touch target >=44×44 logical px.

Shadows:
- xs `0 1px 2px rgba(20,32,24,.04)`
- sm `0 2px 8px rgba(20,32,24,.04)`
- card `0 8px 30px rgba(20,32,24,.06)`
- hover `0 10px 34px rgba(20,32,24,.09)`
- floating `0 14px 34px rgba(20,32,24,.10)`

No harsh shadow/glassmorphism-driven UI.

---

## 7. Motion

150–300ms ease. Completion 150–250ms. No bounce/parallax. Reduced Motion removes translate/scale, preserving instant/fade <=100ms.

Press scale .97 allowed for buttons/cards where useful, not for text inputs/list rows.

---

## 8. Responsive

Breakpoints:
- mobile <600;
- tablet 600–1023;
- desktop >=1024.

Canonical:
- Mobile 390×844;
- validation 360×800, 412×915, 393×852;
- Tablet 834×1194, 1194×834;
- Desktop 1440×1024;
- minimum 1280×800;
- wide 1920×1080.

Mobile outer margin 16.

Desktop:
- sidebar baseline 240, allowed 240–280;
- inspector 360–440;
- list content readable width; no full-1920 stretched task row.

Native window minimum ~980×640; smaller switches compact/single-pane instead of clipping.

---

## 9. Navigation

Mobile bottom nav:
- Сегодня
- План
- center `+`
- Проекты
- Поиск

Inbox entry: Today header badge, Projects row, system shortcut.

Desktop sidebar:
- Сегодня
- План
- Входящие
- Проекты
- Фильтры
- Метки
- Завершённые

Task opens right Inspector desktop; mobile compact sheet → full detail.

---

## 10. Component hierarchy

### Foundations
Colors, type, spacing, radius, elevation, motion, icons, breakpoints.

### Primitives
Button, IconButton, Input, Textarea, Checkbox, Radio, Switch, Chip, Divider, Tooltip, Spinner.

### Navigation
BottomNav, Sidebar, TopBar, SegmentedControl, Tabs, Breadcrumb, CommandPalette.

### Task
TaskCheckbox, TaskRow, TaskMetadata, FocusMarker, TaskDetail, SubtaskRow, ChecklistRow, TaskMenu.

### Planning
DateChip, TimeChip, DurationChip, DeadlineChip, ReminderChip, RecurrenceChip, DatePicker, TimePicker, TemporalConflict, future CalendarTask/Event.

### Organization
ProjectRow, ProjectHeader, Section, BoardColumn/Card, Label, Priority, Filter.

### Capture
QuickAdd, Composer, NLPToken, InheritedContextChip, ParsingPreview, DraftIndicator.

### Overlay
BottomSheet, Modal, SideInspector, Menu, Popover.

### Feedback
Toast, UndoToast, EmptyState, Loading, Error, Offline, SyncState.

### Account/Data
SignIn, OtpInput, SyncStatus, DataPrivacyRow, Entitlement/Paywall.

---

## 11. Component states

Every interactive component where applicable:
Default / Hover / Pressed / Focus / Selected / Disabled / Loading / Error.

Task:
Normal / Focus / MissedPlan / DeadlineSoon / DeadlineMissed / Recurring / Completed / Selected / Dragging.

State never color-only: overdue has text/icon; focus grouping/marker; selected has structural affordance.

---

## 11.1 Additional production components not fully shown in handoff

Use the same Design System for:
- ProjectCreateEditSheet;
- SectionCreateRename;
- ProjectArchive/Delete;
- RestoreContextSheet;
- RecurringSubtaskScopeSheet;
- WebReminderCapabilityNotice;
- AndroidExactAlarmCapabilityNotice;
- LocalWorkspaceStash;
- BackupRestoreModeSheet.

These are required states of approved behavior, not a new visual direction.

---

## 12. Icons

One coherent line family; generic icons may use Lucide-equivalent style:
- 24 viewBox;
- 1.75 stroke;
- currentColor;
- round caps/joins.

Use supplied custom SIMPAS/service icons where applicable. No emoji icon system.

---

## 13. Key handoff screens to reproduce

- Welcome: forest brand hero, ServiceMark, `Начать`, `Войти`, offline promise.
- Sign in: Email/OTP + Yandex + continue local.
- First Task: creates real task.
- Today normal: Focus/Timed/Today/Later hierarchy.
- Today missed/overdue: two clearly distinct sections.
- Quick Add parsed.
- Task Detail simple/full + recurring edit scope.
- Inbox list + Process mode.
- Plan Agenda.
- Project List/Board.
- Data & Privacy.
- notifications/multi-select/undo/context menu/command palette.
- Desktop Today/Board/Settings.

Unshown edge states follow DS and behavioral spec, not visual invention that conflicts with product principles.

---

## 14. Platform adaptation

No fake status bar; use real safe area.

Android Back closes overlay/sheet first, then navigation; root Today follows OS exit behavior.

iOS future swipe-back only on route stack; must not conflict with horizontal Board.

Desktop has hover/keyboard/context menus/inspector. Web supports pointer + keyboard + installable responsive UI.

---

## 15. Accessibility

Release blocker:
- WCAG 2.2 AA Web;
- AA text contrast;
- keyboard complete desktop/web;
- logical focus order;
- modal focus trap/restore;
- icon button accessible names;
- semantic headings/landmarks;
- polite aria-live completion/sync, not noisy reorder announcements;
- drag alternative;
- reduced motion;
- 200% zoom without loss;
- field errors associated programmatically;
- no swipe-only critical action.

---

## 16. Token/string enforcement

CI scans code. Outside token files forbidden:
- literal product hex/rgb/hsl;
- magic radii/shadows unless explicitly component token;
- user-facing literal strings in reusable component implementation.

---

## 16.1 Localization acceptance

- `ru-RU` is complete in R1; missing key is a build/test failure.
- Components accept copy via i18n keys/slots; no literal production copy in reusable primitives.
- Layout validation includes long Russian strings and 200% zoom.

---

## 17. Visual regression

Production components generate canonical screenshots. Key geometry >2px unexpected divergence or token/color mismatch fails review. Font rasterization platform tolerance allowed, metrics/layout must match.

Golden states include handoff states + production-only edge states (temporal conflict, attachment pending, account merge, offline).

---

## 18. Copy, empty states, brand character

Tone: adult, concise, calm, human; no infantilization, hype, corporate jargon or gamification language.

Examples:
- `На сегодня всё.`
- `Входящие разобраны.`
- `Здесь пока нет задач.`
- `Нет соединения. Изменения сохранятся на устройстве.`
- `Перенести на завтра?`

Avoid technical error text and English implementation terminology in Russian UI.

Empty state may use subtle graphic only if it does not compete with CTA. Never add decorative illustration to every empty view.

Brand metaphor «шаг/движение» is expressed via progression/motion/sequence, not literal footprints/stairs everywhere.

---

## 18.1 VECTOR CJM / R3 design contract — design v2

R3 is future scope; these components remain behind release flags and do not appear in R1.

Approved conceptual frames:
- **V01 Composer / Multimodal:** same Composer evolves to tabs `Текст / Голос / Файл`; Voice is not a separate app. `Файл` may accept image/PDF/text document through the future input adapter rather than proliferating tabs.
- **V02 Voice Listening:** visible recording state, live partial transcript, Stop/Готово and Cancel.
- **V03 Live Parsing:** one utterance may split into multiple independent intents and target apps.
- **V04 High:** committed reversible item + Undo.
- **V05 Medium:** compact preview + `Верно / Исправить`.
- **V06 Low:** one minimal clarification.
- **V07 Provenance:** created object shows source `Создано через ВЕКТОР / Голосовой ввод`, timestamp and, where useful, same-capture correlation; there is no audio playback if raw audio was deleted.

### Important production corrections to illustrative mock text

1. The V03 mock button `Сохранить все 3` is **not** a universal batch transaction. Confidence is per-intent. Production batch UI shows each item's state and a CTA such as `Продолжить / Завершить`, while High reversible intents may already be committed. Unresolved Medium/Low items cannot be silently force-saved by one batch button.
2. The CJM example `до пятницы, 5 сент` is illustrative and date-inconsistent for 29.08.2026 (the next Friday is 04.09.2026). Production always renders the parser-resolved exact local date; never hardcode example dates.
3. `Иван П. — 2 контакта` is an illustration of entity ambiguity, **not** a requirement to add Contacts to SHAGI. Use only when the routed target/action has a contact entity.
4. The Android microphone-permission frame is conceptual. Production invokes the real OS permission dialog; it must not render a fake custom system dialog. Optional pre-permission explanation may use SHAGI DS.
5. Fake `9:41`, device chrome and outer frame remain showcase-only.

### Hands-free / eyes-free mode

The CJM persona may be driving. Production must not require a tap to preserve captured content:
- High reversible intent → audio/haptic acknowledgement + Undo available later;
- Medium → short voice confirmation when voice interaction is permitted, otherwise queue for later review;
- Low → one spoken clarification when permitted, otherwise queue for later review;
- no multi-field visual form while in screenless/lock-screen/watch mode;
- user can finish capture and continue the current activity without looking at the screen.

### Deferred Review surface

Vector does not become a fifth bottom-nav destination. Unresolved voice intents are surfaced as:
- post-capture sheet/badge in the invoking Composer;
- optional `Нужно разобрать` entry in Settings/Data & Privacy while items exist;
- deep-link notification when safe/allowed.

The queue shows minimal transcript snippet + target/action candidate, expiry and `Исправить / Удалить`. No audio playback.

### Screenless acknowledgement

Default screenless feedback is generic and privacy-safe (`Готово`, `Нужно уточнить позже`) through haptic/short tone/TTS as platform allows. Do not speak task/client/note content aloud by default from lock screen/watch.

### Vector visual feedback

- listening: red recording dot is acceptable only as recording-state semantic, not destructive/overdue semantics within the normal task UI; it also has text `Слушаю…`;
- parsing delay must have visible/audible progress; no silent pause;
- per-intent states must be distinguishable by label/icon, not color alone;
- partial failure displays successful and failed items separately; never imply the whole utterance failed if only one target failed.

---

## 19. Legal/IP design boundary

Common UX patterns (Today, Inbox, Board, Calendar, Quick Add, NLP chips, drag-and-drop) can be used, but production must not be pixel-perfect clone of Todoist/Things/TickTick/Singularity, copy their proprietary iconography, branded animation or distinctive branded terminology.

Acceptance heuristic: experienced Todoist user understands SHAGI immediately, but an independent reviewer does not perceive it as recolored Todoist.


---

<!-- FILE: 05_SECURITY_PRIVACY_LEGAL.md -->

# ШАГИ — SECURITY, PRIVACY & LEGAL

---

## 1. Domain isolation

```text
Account Core ≠ SHAGI Application Data ≠ PRAKTIKA Sensitive Data ≠ ZAPISKI Data
```

Common opaque user_id is allowed, but:
- separate DB/schema credentials;
- no cross-domain direct SQL joins;
- no automatic content transfer;
- service API/scoped token only.

---

## 1.1 User content is treated as potentially sensitive UGC

A general task manager cannot know whether a user will type health, family, financial or other sensitive information.

Therefore SHAGI does not profile sensitive categories, does not reuse content for advertising/marketing, does not expose content in admin by default, and sends content to AI/foreign processors only through an explicitly approved future flow. Synced content uses encrypted transport/storage and strict access/audit.

---

## 2. RF personal-data localization

For Russian citizens, primary server-side recording/systematization/accumulation/storage/update/extraction of personal data must occur using databases located in the Russian Federation, consistent with 152-ФЗ Article 18(5) in force for the product release.

Production account email, account IDs, subscription information and synced task data are RF-hosted primary stores. Foreign CDN/provider must not become primary PII database.

---

## 3. Transport

- TLS 1.2 minimum, TLS 1.3 preferred;
- HSTS;
- Secure cookies;
- monitored certificate renewal;
- no credentials in repository or logs.

---

## 4. At rest

- encrypted server volumes/backups/object storage;
- credentials per service;
- secrets manager/CI secret store.

R1 is **not falsely advertised as zero-knowledge**: sync server can technically process synced task data for synchronization/share. Purpose limitation and privacy controls remain strict.

---

## 5. Local secrets

Native refresh/auth secrets: Android Keystore / Windows Credential Manager / Apple Keychain. No plaintext refresh token in SQLite.

Web: HttpOnly Secure session/refresh cookie; no token in localStorage. IndexedDB only application data.

---

## 6. Logs — content prohibition

Never log:
- task title/description;
- project/section/label names;
- subtask/checklist text;
- attachment filename;
- CSV/import body;
- Smart prompt;
- transcript/audio.

Allowed: opaque IDs, route, error code, latency, byte count, app/schema version.

Redaction tests mandatory.

---

## 7. Analytics

Separate opt-in toggle, **OFF by default**; no raw content.

Allowed events examples:
- app_open
- task_created {source, has_date, has_deadline, nlp_token_count}
- task_completed {age_bucket}
- task_rescheduled {direction}
- inbox_processed
- project_created
- quick_add_opened
- reminder_set
- recurrence_set
- import_completed {source,count,warning_count}
- sync_enabled
- sync_error {code}
- paywall_viewed {feature}
- subscription_activated {channel}

Forbidden properties: title/project name/label/email/freeform text/attachment name.

Analytics storage/provider baseline RF.

---

## 8. Diagnostics

Separate toggle from analytics, **OFF by default**.

Crash report: stack, build, OS/device family, technical breadcrumbs. Never content.

Use self-hosted/RF-compatible Sentry/GlitchTip-equivalent or approved local processor.

---

## 9. Auth security

- OTP hash only;
- TTL/rate limits;
- enumeration resistance;
- Yandex PKCE;
- rotating refresh and reuse detection;
- session/device revoke;
- CSRF protection Web;
- strict CORS/CSP;
- brute-force alerts.

---

## 10. Attachments

- MIME sniff;
- extension untrusted;
- no path traversal;
- short-lived signed download;
- unsafe type Content-Disposition attachment;
- size/quota/checksum;
- malware-scan hook;
- opaque object path.

---

## 11. Import/export security

Import:
- ZIP bomb limits;
- no `../`;
- no executable invocation;
- CSV treated as data.

Generic CSV export mitigates spreadsheet formula injection for cells starting with `=`, `+`, `-`, `@` by safe escaping/prefixing.

---

## 11.1 Logout / local account cache

Unsynced data must sync, export or be explicitly retained before logout; silent loss is prohibited. After clean logout account-scoped cache leaves normal UI/storage, Shared cache is purged, and an unmerged pre-account local workspace remains a separate dataset.

---

## 12. Account deletion

- explicit destructive UX + re-auth;
- sessions revoked immediately;
- account hidden/deactivated immediately;
- active SHAGI application data purged within 24h;
- attachment purge async;
- backups age out <=30 days unless specific legal/financial record must be retained separately;
- statutory/legal records minimized and isolated from active product DB.

---

## 13. Local-data deletion

Local-only: warning explicitly says no cloud recovery.

Synced: `Удалить данные этого аккаунта с устройства` clears local cache only after confirmation; cloud remains and can resync.

Never conflate local delete and account delete.

---

## 14. Legal documents/consents

Immutable document versions/hashes.

Separate:
- User Agreement;
- Privacy Policy;
- analytics consent;
- diagnostics consent;
- marketing consent only if marketing introduced;
- R1.2 AI processing disclosure/consent as required;
- R3 voice processing disclosure.

No prechecked optional consent.

---

## 15. Shared privacy R1.3

Project private by default. Member sees shared project only.

Removal immediately revokes server rights; online cache purged. Offline already-cached data cannot be remotely wiped until next contact — document this threat limitation rather than pretend otherwise.

---

## 16. PRAKTIKA R2

Explicit object selection. No fuzzy client auto-match. No analytics reuse of sensitive/professional data. Cross-service access auditable.

---

## 17. AI R1.2

- user initiates/enables;
- minimum context;
- provider allowlist;
- no training on user data;
- no prompt logs by default;
- RF gateway baseline;
- foreign transfer only after legal review and required consent;
- preview before mutation.

---

## 18. Vector R3

Design v2 adds explicit voice privacy requirements.

- microphone permission is just-in-time, initiated by an explicit user action; no background always-listening;
- no voiceprint/speaker identification;
- raw audio is transient and never enters analytics, normal logs, backups or support bundles automatically;
- success → delete raw audio after final transcript; cancel → delete immediately; failure/session expiry/crash recovery → delete transient buffer as part of cleanup;
- a failed recognition must never trigger hidden long-term recording retention `на всякий случай`;
- if on-device ASR is unavailable and network is unavailable, default is to decline voice capture/offer Text rather than persist audio for later upload;
- unresolved intents may retain only minimum transcript/candidate text required for review, encrypted under normal app-data controls, default <=7 days;
- Data & Privacy exposes `Очистить незавершённые голосовые разборы` and an explanation of voice retention;
- optional diagnostic upload of audio, if ever added, requires a separate explicit per-incident consent and is not part of R3 baseline.

### Confidence is not authorization

High model confidence never grants permission for a sensitive/destructive/external action. Action risk policy is independent:
- reversible create/update with reliable Undo may auto-execute;
- PRAKTIKA-sensitive, destructive, send/publish/payment/external-side-effect actions require confirmation;
- target service authorization/permissions remain authoritative.

### Cross-app authorization

- Vector never receives universal database credentials to all SIMPAS products.
- Each target command uses a scoped user authorization and target-defined action schema.
- Capability discovery may reveal action availability, not target content.
- `requires_open` deep links are short-lived/signed where state is passed.
- Review queue candidate text follows the same user-content security class and 7-day default retention.

### Driving / lock-screen privacy

When invoked from lock screen/watch/system shortcut:
- do not read sensitive object content aloud unless user explicitly enables such feedback and platform context is trusted;
- generic acknowledgement is default;
- unresolved sensitive items queue for later authenticated review.

---

## 18.1 IP / dependency compliance

No copied competitor source/assets/pixel-perfect reproduction. Todoist import uses public documented formats. SBOM + dependency license scan are release requirements. Reciprocal/network-copyleft dependencies require explicit approval. Bundled fonts/icons require redistribution rights/notices.

---

## 19. Security baseline

Target OWASP ASVS L2 where applicable, OWASP MASVS mobile controls, SAST, dependency/SBOM/secret scanning.

Critical/high exploitable security issue blocks release. Penetration test required before wide paid rollout and after major auth/share redesign.


---

<!-- FILE: 06_TESTING_ACCEPTANCE.md -->

# ШАГИ — TESTING & ACCEPTANCE

---

## 1. Test pyramid

Unit: domain/time/recurrence/rank/NLP/import/entitlement/merge.  
Integration: SQLite, IndexedDB, Postgres API, sync, auth, attachments.  
E2E: Web Playwright; Android Maestro/Appium-equivalent; Windows Tauri/WebDriver harness; future iOS/macOS smoke.  
Visual: production screenshots against approved handoff semantics.

---

## 2. Temporal mandatory tests

- leap year;
- Dec/Jan;
- timezone change/DST;
- available_from conflicts;
- planned > deadline warning;
- duration crossing deadline;
- date-only deadline end-of-day;
- midnight Today rollover;
- focus_date not carrying forward;
- reminder reschedule after timezone.

---

## 3. NLP golden corpus

>=800 cases across dates, times, duration, deadline, recurrence, priority, project/label, combined phrases, punctuation, quotes, false positives, month/year/leap boundary, malformed input, Unicode/ё, ambiguity.

Golden expected: cleaned title + extracted chips + ambiguity/conflict state.

---

## 4. Recurrence suite

- daily/weekly/monthly/yearly;
- every N;
- weekdays;
- 29/30/31 across short months;
- scheduled completed late;
- completion anchor;
- current vs series edit/delete;
- deadline/reminder offsets;
- subtask/checklist clone incomplete;
- completion Undo;
- old occurrence restore/copy behavior;
- dual-device completion convergence.

---

## 5. Evil sync suite

1. 3 devices offline edit disjoint fields.
2. same title concurrent edit.
3. delete vs edit.
4. complete vs reschedule.
5. label add/remove.
6. concurrent rank moves.
7. archive project while task edited.
8. same recurring occurrence completed on 2 devices.
9. local→account merge.
10. future revoked Shared member offline edits.
11. reconnect with 10k queued ops.
12. client clock skew ±24h.

All must deterministically converge with no silent content loss.

---

## 6. Import fixtures

Versioned fixtures:
- Todoist single CSV;
- Todoist backup ZIP;
- unknown extra columns;
- Cyrillic;
- malformed dates;
- recurrence;
- INDENT 1/2/3/4 flatten policy;
- recurring Subtask promotion;
- AUTHOR/RESPONSIBLE preservation;
- TIMEZONE wall-clock preservation;
- comments;
- `Комментарии Todoist.txt` overflow preservation;
- attachment URLs;
- large archive;
- malicious zip path;
- formula-injection CSV.

No mapped content silently lost.

---

## 7. Accessibility

Automated axe + manual keyboard + TalkBack + NVDA; future VoiceOver. 200% zoom, reduced motion, dark/light contrast, alternative to drag.

---

## 8. Performance profiles

Datasets: 10k/100k tasks, 500 board cards, 200 projects, 50 Today, 50 labels/task edge, 10k completed.

Master budgets are assertions in CI/nightly, not aspirations.

---

## 9. Critical R1 E2E flows

1. local cold start → first Today task <=3 screens.
2. contextless Quick Add → Inbox.
3. Process Today → leaves Inbox, appears Today.
4. NLP `Позвонить врачу завтра в 11` cleans title.
5. complex temporal task.
6. blocking temporal conflict.
7. Today overdue vs missed plan.
8. fourth Focus replacement.
9. complete + Undo.
10. parent with incomplete subtasks completion prompt.
11. recurrence current/series.
12. recurring completed old occurrence copy behavior.
13. List↔Board preserves data.
14. search completed + restore normal task.
15. Todoist import preview + rollback.
16. local→account merge no loss.
17. offline edits → sync convergence.
18. notification permission just-in-time.
19. offline attachment → cloud sync.
20. Free 11th project paywall/no partial mutation.
21. full export → fresh workspace import restores graph.
22. local-only delete warns irrecoverability.
23. Light/Dark/System.
24. Windows command palette/global Quick Add.
25. Android Today/Focus/Quick Add widget paths.
26. Web local-only Reminder shows closed-browser reliability disclosure.
27. Android precise Reminder handles exact-alarm capability path.
28. Restore completed Subtask whose Parent is completed.
29. Restore completed Task whose Project is archived/deleted.
30. Move Parent across Project cascades children; moving child alone detaches only after confirmation.
31. Import >10 projects on Free preserves all data and gates only future create/reactivate.
32. Logout with unsynced changes never loses data.
33. Empty-workspace backup restore preserves IDs; non-empty import remaps collisions.
34. Archive Project cancels future reminders; unarchive reconciles without replay storm.
35. Delete Label removes relations only; Undo restores relations.
36. Multi-select parent+child completion uses one aggregate confirmation and no double-count.
37. `Когда будет время` clears Planned Time; assigning time clears Later.
38. Global time-only NLP resolves visible Today/Tomorrow date deterministically.
39. Todoist comments beyond Description limit survive in `Комментарии Todoist.txt`.

---

## 10. Visual acceptance

Golden states:
Welcome, Sign in, First Task, Today normal, Today missed/overdue, Quick Add parsed, Task detail simple/full, Inbox list/process, Plan, Project list/board, Data & Privacy, multi-select, Undo, context menu, command palette, Desktop Today/Board/Settings.

Production removes showcase chrome/device frames.

---

## 11. Backend acceptance

- OpenAPI valid;
- rate limits;
- refresh rotation;
- idempotency;
- sync cursor/paging;
- duplicate op no duplicate mutation;
- permission/IDOR tests;
- account delete;
- backup restore;
- attachment quota;
- billing webhook signatures;
- content-free logs.

---

## 12. Security release blockers

- secret committed/logged;
- user content telemetry/logging;
- exploitable critical/high dependency vuln;
- broken auth/session;
- IDOR;
- shared permission leak;
- ZIP slip/path traversal;
- XSS/unsafe HTML;
- PII primary storage outside approved RF infrastructure.

---

## 13. Epic Definition of Done

Epic only Done if:
- implementation;
- appropriate unit/integration/E2E;
- docs updated;
- telemetry reviewed;
- accessibility covered;
- design matched;
- migrations/backward compatibility tested;
- CI green;
- no unresolved user-behavior placeholders.

---

## 14. R1 final gate

- R1a + R1b complete/enabled;
- Android/Windows/Web release gates pass;
- iOS/macOS architecture/build not blocked;
- all critical E2E pass;
- visual review approved;
- 7-day staging soak without blocker;
- backup restore drill passed;
- no P0/P1;
- no unresolved data-loss bug any severity;
- legal/consent versions deployed;
- signed packages verified.

## 15. Future R3 Vector acceptance gate — based on design v2

These tests are not part of R1 release, but are mandatory before R3 enablement:

1. one utterance → 3 intents → 2 SHAGI + 1 ZAPISKI with stable intent IDs;
2. High reversible intent auto-commits once and Undo works;
3. High confidence + sensitive/destructive action still requires confirmation;
4. Medium supports preview/correction;
5. Low asks one minimal question, not a form;
6. hands-free Medium/Low can use voice response or defer to Review without screen tap;
7. SHAGI target failure + ZAPISKI success produces partial failure, retry does not duplicate success;
8. retry same intent/idempotency key cannot create duplicate object;
9. microphone denied → graceful Text fallback;
10. recording cancel deletes transient audio;
11. recognition success deletes raw audio;
12. ASR/server network loss does not silently persist recording;
13. no raw audio/transcript/entity text in logs/analytics;
14. provenance label exists but cannot open deleted audio;
15. parser exact dates derive from current locale/date; illustrative `5 сент` mock is never hardcoded;
16. contact disambiguation is not shown for simple SHAGI `create_task` unless target action truly has a contact entity;
17. app crash during recording cleans transient buffer on next start;
18. unresolved review item expires/clears according to retention;
19. real Android OS microphone permission is used; no fake permission dialog;
20. screenless/lock-screen mode does not read sensitive task content aloud by default.
21. partial transcript never creates a target object before finalization;
22. cross-app target unavailable/not authorized produces requires_open/deferred_review, not false success;
23. High action without reliable target Undo cannot auto-execute;
24. target capability schema/version mismatch fails safely;
25. session > configured voice/intents limit finalizes gracefully without silent truncation;
26. review queue stores no audio and expires minimum candidate text;
27. cross-app deep link cannot be replayed after expiry/redeem.


---

<!-- FILE: 07_RELEASES_FUTURE.md -->

# ШАГИ — RELEASES R1.1 → R3

---

# R1.1 PLANNING

## Scope
- Day/Week/Month calendar;
- task time blocks;
- unscheduled area;
- drag/resize;
- read-only Yandex/Google/Outlook calendar connections;
- multiple/relative reminders;
- custom filter builder;
- extended activity history.

Dropping Task creates planned date/time; if duration absent UI suggests 30m but user can change. Undo required.

External event is not completable Task; icon/shape as well as color differentiates it.

Overlaps allowed with warning.

---

# R1.2 SMART

## Local deterministic engine first

Realistic Day derives capacity from:
- user planning windows;
- external busy events;
- fixed time blocks;
- task durations.

Default planning-window suggestion after explicit setup:
- weekdays 09:00–18:00;
- weekends 10:00–16:00.

If user has not configured capacity source, Smart asks/setup before claiming `свободно X часов`.

Local scheduler candidate order:
1. Focus;
2. fixed planned time;
3. deadline urgency;
4. priority;
5. manual rank.

Constraints: Available From, deadline, duration, planning window, busy events. Tasks not split by default.

Everything shown as proposal preview; Apply mutates only after user confirmation.

Remote AI: Break into steps, Next step, Estimate duration. It never owns calendar silently.

---

# R1.3 SHARED

- explicit private→shared Project;
- Owner/Member;
- one assignee/task;
- text comments first;
- activity;
- per-shared-project notifications;
- requires account/sync;
- offline edits work, permission revocation reconciles on reconnect.

No enterprise workspace/departments/RBAC/timesheets/workload dashboards.

---

# R2 SIMPAS

Object links, not DB merger.

Examples Task↔ZAPISKI note; Task↔PRAKTIKA client/session; Task↔MOMENT.

Contract = opaque reference + scoped authorization + deep link. No content auto-copy.

PRAKTIKA: explicit selection, no fuzzy match, audit, sensitive-domain boundary.

---

# R3 VECTOR — approved CJM + production hardening

Design source: `VECTOR_CJM_HANDOFF_v2.html`.

## Journey

1. Trigger — shortcut/lock-screen/watch/future surface.
2. Capture — free-flow speech + live partial transcript.
3. Split/route — one utterance → N intents → potentially several SIMPAS apps.
4. Per-intent confidence/risk branch.
5. Target result + provenance.
6. Trust/repeat — user can rely on capture without maintaining a raw-audio inbox.

## Composer

R1 Composer architecture evolves, not replaced. Future tabs: Text / Voice / File. Image/document/share adapters feed the same Vector input contract.

## Per-intent confidence

- High → auto-execute **only reversible/low-risk** command + Undo.
- Medium → compact preview/correction.
- Low → one minimal clarification.
- Confidence is per intent, never per whole utterance.
- Risk gate is separate and can force confirmation regardless of confidence.

## Hands-free behavior

For driving/lock-screen/watch use, a visual tap is never required just to avoid losing the thought. Medium/Low may be resolved by short voice dialogue; if unsafe/unavailable, they enter a later Review queue. No multi-field form is demanded during hands-free capture.

## Finalization rule

Live partial transcript is feedback only. No target object is created from unstable partial text. Intent execution begins only after the relevant segment/final capture is finalized.

## Target execution boundary

- current app can call local domain command;
- cross-app silent creation requires authenticated target-service API/capability;
- OS sandbox is never bypassed;
- unavailable/not-authorized target → Deferred Review / Open target app, not false success;
- Target Capability Registry supplies action schema/risk/Undo/auth state.

## Batch semantics

A capture is a batch of independent intents, not a distributed transaction.

- each intent has stable ID/idempotency key;
- successful targets stay committed if another target fails;
- retry only failed intent;
- Undo is per committed reversible intent;
- partial failure is explicit.

## Provenance

Created objects store `source=vector`, channel, capture_batch_id, intent_id, timestamp. UI can show `Создано через ВЕКТОР · 09:14`. This is not an audio attachment. Raw recording is gone by default.

## ASR/privacy

- GigaAM baseline;
- local/on-device where benchmark allows, otherwise RF-hosted streaming path;
- no voiceprint;
- raw audio transient;
- no hidden offline queue of recordings by default;
- unresolved text review <=7 days by default; user can clear.

## Initial technical limits

Server-configurable R3 baseline: 120 s continuous voice session, 20 intents/capture, 20k final transcript chars. Reaching a limit finalizes current batch and offers another capture; no silent truncation.

## Observability without content

Allowed aggregate events: capture started/completed, intent count bucket, target service category, confidence class, correction/clarification/undo, partial failure, latency bucket. Never transcript/audio/entity names.

## R3 success metrics

- capture completion rate;
- median voice→first structured result latency;
- per-intent correction rate by confidence class;
- clarification rate;
- Undo rate after High auto-execute;
- partial-routing failure rate;
- share of captures completed hands-free;
- zero raw-audio retention violations.

---

# Future integration surface

Architecture-only until separately scheduled:
- Telegram capture;
- MAX capture;
- email→task;
- OS Share target;
- wearables;
- public API;
- webhooks/automation.

Every adapter produces normal domain command, never direct DB write.


---

<!-- FILE: 08_DEVOPS_CICD_OPERATIONS.md -->

# ШАГИ — DEVOPS, CI/CD & OPERATIONS

---

## 1. Environments

local / test-CI / staging / production.

Separate DBs, buckets, credentials. Production user data never copied to staging.

---

## 2. PR CI

1. locked install;
2. format/lint;
3. TS typecheck;
4. token/string lint;
5. unit;
6. integration;
7. OpenAPI contract;
8. web build;
9. server build;
10. secret/dependency/SAST scan;
11. selected E2E/visual.

Main/nightly adds full perf, evil sync, full visual, Android/Windows packages and future Apple smoke on macOS runner.

---

## 3. Runner split

Linux: web/server/Android/Docker.  
Windows: Windows native package/sign.  
macOS: iOS/macOS package/sign.

Scripts portable between GitHub/GitVerse/self-hosted runner providers; CI vendor not encoded in application.

---

## 3.1 Android exact-reminder policy check

Before each Android store release:
- re-verify current targetSdk requirement;
- re-verify `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` eligibility and store policy;
- test capability path (`canScheduleExactAlarms()` or current equivalent);
- use least-privileged permission model that still fulfills explicit user-selected reminder times;
- never add a restricted permission merely for implementation convenience.

If exact scheduling cannot be obtained on a device/channel, product behavior follows the disclosure/fallback contract from `01_PRODUCT_BEHAVIOR_R1.md`.

---

## 4. Signing

Android release key only secrets store/runner. Windows code-signing cert + timestamp. Apple signing/notarization future. Private signing materials never in repository/log.

---

## 5. Versioning

SemVer app/backend; build metadata includes git SHA. Client sends app/schema version.

Server maintains compatibility for at least 2 actively supported minor clients where safe. Forced upgrade only security/schema incompatible.

---

## 6. Deployment baseline

```text
Internet
  ↓
Nginx
  ├─ shagi-web PWA/static
  ├─ shagi-api x2
  └─ websocket/sync
        ↓
PostgreSQL 18
Redis
S3/MinIO RF
shagi-worker
```

Readiness/health. Rolling API deploy. DB migration: expand → deploy → contract later.

---

## 7. Backups

PostgreSQL:
- daily full;
- WAL/PITR target RPO <=15m;
- encrypted;
- baseline retention 30 daily + 12 monthly.

Object storage:
- versioning;
- second RF location/provider backup.

Repository:
- primary remote + mirrored backup remote under infrastructure policy.

Restore:
- weekly automated staging restore;
- quarterly production-like drill.

Target RTO <=2h.

---

## 8. Monitoring/SLO

Monitor API latency/error, DB pool/locks/storage, Redis, worker queue, sync lag, attachment errors, OTP failures, push errors, billing webhook backlog, backup state, TLS expiry.

Target account/sync API 99.9% monthly excluding announced maintenance. Data-loss incident is always severity P0.

---

## 9. Logs

Structured JSON. Operational retention baseline 30 days; auth/security audit 90 days unless policy/law changes. No user content. request_id end-to-end.

---

## 10. Feature flags

Typed registry:
- billing_enabled
- pro_paywall_enabled
- planning_r1_1
- smart_r1_2
- shared_r1_3
- simpas_links_r2
- vector_r3

Disabled flag must leave no broken nav/action. Dark migrations allowed, hidden UI not enough without backward compatibility.

---

## 11. Rollback

Server previous image + forward-compatible DB. Destructive contract migration only after old clients aged out.

Mobile previous build must remain sync-compatible within supported client window.

---

## 11.1 Supply chain

Every release:
- immutable lockfile in CI;
- SBOM (CycloneDX or SPDX);
- dependency vulnerability scan;
- dependency license scan;
- secret scan;
- build provenance/git SHA;
- third-party notices generation/review.

Dependencies with unresolved critical/high exploitability or unapproved reciprocal/network-copyleft obligations block release.

---

## 12. Production checklist

DNS/TLS; RF hosting; DB/object backups; secrets; email; OAuth IDs; push creds; billing webhook; legal docs; monitoring; alerts; support/status contact; restore drill; signed artifacts.


---

<!-- FILE: 09_IMPLEMENTATION_PLAN.md -->

# ШАГИ — IMPLEMENTATION PLAN / EPICS

План допускает параллельную разработку, но один product truth.

## E00 Repository & contracts
Monorepo, strict TS, packages, CI, i18n, DS tokens, platform ports. Exit: web/native shell smoke.

## E01 Domain/time/Task
Temporal, entities, commands, invariants, rank, tests.

## E02 Local persistence
SQLite/IndexedDB, migrations, query/event layer, FTS.

## E03 Design System productionization
Parallel: tokens, self-host fonts, components, responsive shell, visual/accessibility harness.

## E04 Navigation/onboarding/local mode
Mobile/desktop navigation, Welcome, First Task, local profile, safe areas.

## E05 Quick Add + NLP
Composer/draft/context inheritance/parser/chips/800-case corpus.

## E06 Today
Queries/groups/no-duplicate precedence/focus/missed/overdue/completion/virtualization.

## E07 Inbox
capture_state/list/process/Inbox Zero/gestures + accessible alternatives.

## E08 Temporal editors + reminders
Pickers/duration/deadline/available/conflicts/local scheduler/permissions.

## E09 Projects/List/Board
CRUD/sections/ranks/archive/delete/board/accessible moves.

## E10 Subtasks/checklist/labels/priority
Conversions, parent completion, indexes.

## E11 Recurrence
Series/occurrence; top-level-only R1 recurrence; deterministic UUIDv5 occurrence graph; scheduled/completion anchors; late-slot skip semantics; child templates/relative offsets; current/series scope; concurrent completion/delete convergence; undo/restore.

## E12 Plan/Search/Filters/Completed
Agenda/markers/FTS/system filters/history.

## E13 Desktop power UX
Command palette/global Quick Add/keyboard/context menus/inspector.

## E14 Attachments/Links/Import/Export
Local lifecycle/Todoist/CSV/backup/import rollback/security fixtures.

## E15 Account/Auth backend
Email OTP/Yandex/sessions/devices/legal registry.

## E16 Sync engine/backend
HLC/outbox/merge/oplog/bootstrap/evil sync.

## E17 Account merge + Data/Privacy
Local→cloud/sync UX/logout/device data/export/delete/telemetry toggles.

## E18 Cloud attachments
S3/quota/upload/retry/download.

## E19 Native widgets/notification hardening
Android widgets/background reconciliation/deep links/dedup.

## E20 Entitlements/Billing shell
Signed entitlement cache/project limit/contextual paywall/billing adapters under flags.

## E21 R1 QA/hardening
Full E2E/perf/accessibility/security/staging soak; no new feature work except blocker fixes.

### Public R1 gate
E00–E21 complete.

### Future
E30 R1.1 Planning  
E40 R1.2 Smart  
E50 R1.3 Shared  
E60 R2 SIMPAS  
E70 R3 Vector
- multimodal Composer + real microphone permission;
- GigaAM streaming adapter(s);
- final-vs-partial transcript contract;
- batch/intent split + Target Capability Registry;
- per-intent confidence + independent risk gate;
- idempotent cross-app commands, undo tokens and partial-failure recovery;
- requires_open/deferred Review for sandbox/auth gaps;
- hands-free confirmation and privacy-safe feedback;
- provenance metadata + raw-audio cleanup;
- V01–V14 future acceptance.

## Parallel lanes

- Domain: E01 → E08 → E11 → E12
- UI: E03 → E04 → E06/E07/E09 → E13
- Backend: E15 → E16 → E18/E20
- Data/migration: E02 → E14 → E17
- Native: shells → E19
- QA: begins E00, never waits for E21.

Checkpoints:
- CP1 E00–E05 foundation/capture
- CP2 E06–E12 local product
- CP3 E15–E18 cloud/sync
- CP4 full R1 release candidate


---

<!-- FILE: 10_FINAL_REVIEW_LOG.md -->

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


---

<!-- FILE: 11_REFERENCE_BASE.md -->

# ШАГИ — REFERENCE BASE / PROVENANCE

## Product/design sources

- `source/PRODUCT_SPEC_v4.0_FINAL.md` — утверждённая product/UX specification.
- `source/R1_DESIGN_HANDOFF_v2.html` — current Claude Design R1 reference implementation/mockup; visually supersedes the prior handoff.
- `source/VECTOR_CJM_HANDOFF_v2.html` — approved R3 VECTOR CJM + V01–V06 concept frames.
- `source/ШАГИ-handoff_design_v2.zip` — original new design handoff. Previous design ZIP is retained only as history if present.
- `source/design-system-v2/` — current bundled token/design-system snapshot.
- `source/ШАГИ-handoff_design_v2.zip` — current original design handoff.
- `source/history/` — previous handoff artifacts retained only for audit/history.

## Existing SIMPAS engineering precedent consulted

Для унификации подхода проверена текущая архитектура `compas-psy/zapiski`: pnpm monorepo, shared `packages/core/ui/app`, thin Tauri 2 Android/Windows shells, PWA/web shell, TypeScript/React/Vite и отдельный Fastify/PostgreSQL server. ШАГИ используют этот паттерн как baseline, но не наследуют domain-specific архитектуру ЗАПИСОК (file-over-app/Markdown/zero-knowledge claims).

## External facts verified 29.08.2026

- Node.js 24.x — current LTS line on review date; official download page reported **v24.20.0 LTS**. Specification uses Node 24 LTS+ rather than freezing a patch.
  Official: https://nodejs.org/en/download/
- PostgreSQL 18 is the current stable major; **18.6 released 13.08.2026** while PostgreSQL 19 was Beta 3. Specification uses PostgreSQL 18.x baseline.
  Official: https://www.postgresql.org/docs/release/
- Todoist project CSV documentation reviewed 29.08.2026 defines fields including TYPE, CONTENT, DESCRIPTION, PRIORITY, INDENT, AUTHOR, RESPONSIBLE, DATE, DATE_LANG, TIMEZONE, DURATION, DURATION_UNIT, meta, DEADLINE, DEADLINE_LANG and IS_COLLAPSED; ordinary project CSV excludes completed tasks.
  Official: https://www.todoist.com/ru/help/todoist/features/import-or-export-a-project-as-a-csv-file-in-todoist-YC8YvN
- Todoist Pro/Business backup ZIP contains CSV per active project and includes active tasks, date/time, duration, deadlines, recurrence (with limitation on recurrence start), up to 500 comments/task and attachment links; completed tasks and archived projects are excluded.
  Official: https://www.todoist.com/ru/help/todoist/features/download-or-restore-backups-in-todoist-ywaJeQbN
- RF localization requirement is treated as release compliance baseline under Federal Law 152-ФЗ, Article 18(5), using current legal text at implementation/release review.
  Reference: https://www.consultant.ru/document/cons_doc_LAW_61801/

## Rule

External versions, store requirements and legislation are re-verified immediately before production release. Product/domain behavior does not silently change because a dependency version changed; technical adaptation uses ADR where material.

- Android exact alarms: exact scheduling is intended for precisely timed user-facing operations; current capability/permission/store restrictions must be checked before release.
  Official: https://developer.android.com/develop/background-work/services/alarms
- 152-ФЗ Article 18(5) current legal text is rechecked before release; RF localization is a compliance baseline.
  Reference: https://www.consultant.ru/document/cons_doc_LAW_61801/cbf4e15b7c330f9372e876cdf2bc928bad7950ef/

## Design v2 delta reviewed 29.08.2026

- R1 functional layouts are materially unchanged; the design file replaces the old single `zapiski` comparator theme with ZAPISKI-family `Бумага / Графит / Чернила` showcase themes. SHAGI production theme scope remains System/Light/Dark.
- New handoff adds `ВЕКТОР - CJM.dc.html`: six-stage voice journey, live transcript, one utterance→multiple intents/apps, per-intent High/Medium/Low confidence, provenance, Android concept states and microphone permission concept.
- Illustrative mock values are not domain contracts: exact dates are computed at runtime and OS permission dialogs remain native.


---

<!-- FILE: 12_SCREEN_STATE_MATRIX.md -->

# ШАГИ — SCREEN / STATE IMPLEMENTATION MATRIX

This matrix connects Product Spec frame IDs to implementation acceptance. Visual values come from Claude handoff where shown; behavior comes from `01_PRODUCT_BEHAVIOR_R1.md`.

## Mobile R1

| ID | Route/state | Implementation acceptance |
|---|---|---|
| M01 | Launch | local/offline startup; no auth wall; no fake loader after local DB ready |
| M02 | Welcome | `Начать` local + `Войти`; no mandatory registration |
| M03 | Sign in | email OTP + Yandex; loading/error/rate-limit; continue local |
| M04 | First task | creates real processed Today task |
| M05 | NLP onboarding | demonstrates local Russian natural input, not AI marketing |
| M06 | Today Empty | date + Quick Add + calm empty state |
| M07 | Today Normal | precedence groups without duplicates |
| M08 | Today Dense | 20+/50 tasks manageable; virtualization/collapsible conditional groups |
| M09 | Missed Plan | neutral `Не по плану`, reschedule/bulk; separate from deadline |
| M10 | Deadline Missed | stronger `Просрочен срок`, no mixing with M09 |
| M11 | Focus | max 3, 4th replacement, focus_date semantics |
| M12 | Inbox | capture_state queue, not `project_id=null` derived view |
| M13 | Inbox Process | Today/Date/Project mark processed; Skip retains inbox |
| M14 | Plan Agenda | future day groups + available marker |
| M15 | Plan selected | selected date state |
| M16 | Projects | create/reorder/archive access; Free limit safe |
| M17 | Project List | sections + inline add + manual ranks |
| M18 | Project Board | same sections as columns; optional Без раздела |
| M19 | Project Empty | direct first-task CTA |
| M20 | Quick Add Empty | immediate focus; inherited chips visible; draft safe |
| M21 | NLP Parsed | editable/rejectable chips; accepted tokens removed from title |
| M22 | NLP Ambiguous | exact suggestion; no hidden guess |
| M23 | Quick Add Expanded | advanced metadata progressive disclosure |
| M24 | Task Detail Simple | title/complete/context + only frequent actions |
| M25 | Task Detail Full | temporal + org + subtasks/checklist + attachments/links |
| M26 | Recurring detail | current/series scope chooser |
| M27 | Date Picker | shortcuts + calendar |
| M28 | Advanced planning | time/duration/deadline/available; blocking vs warning conflict states |
| M29 | Recurrence Basic | common rules one tap |
| M30 | Recurrence Advanced | scheduled vs completion anchor explained |
| M31 | Reminder | distinct from planned time |
| M32 | Priority | P1–P4, no automatic list reorder |
| M33 | Labels | find/create/select |
| M34 | Search Empty | instant local search access |
| M35 | Search Results | tasks/projects/completed distinctions and ranking |
| M36 | Completed | normal restore; recurring historical copy rules |
| M37 | Multi-select | complete/date/project/priority/labels/delete |
| M38 | Context Menu | frequent first, destructive separated, Later action |
| M39 | Offline | explicitly local work continues |
| M40 | Sync Issue | no content lock; retry/status; attachment pending states |
| M41 | Settings Root | complete R1 information architecture |
| M42 | Appearance | System/Light/Dark; no Zapiski production theme |
| M43 | Notifications | explicit/reminder/deadline granular toggles |
| M44 | Account Local | local/cloud boundary clear |
| M45 | Enable Sync | account value not paywall; local merge safe |
| M46 | Import Source | Todoist CSV/backup ZIP + generic CSV |
| M47 | Import Preview | mapping/warnings/count before mutation |
| M48 | Import Result | imported/skipped/warnings + rollback action |
| M49 | Export | full backup + CSV; always free |
| M50 | Pro Contextual | value-specific paywall; no dark patterns |
| M51 | Data & Privacy | storage state/export/consents/legal/delete navigation |
| M52 | Delete Data/Account | local delete and account deletion clearly different |

## Desktop R1

| ID | Route/state | Acceptance |
|---|---|---|
| D01 | Today | Sidebar + content + optional Inspector |
| D02 | Compact Today | density changes spacing only, not capability |
| D03 | Focus | not confused with priority |
| D04 | Inbox | capture/process without navigation churn |
| D05 | Inbox Process | complete keyboard flow |
| D06 | Plan Agenda | scalable dense future list |
| D07 | Projects | sidebar/content hierarchy |
| D08 | Project List | section/reorder/inline add |
| D09 | Board | shared section model |
| D10 | Inspector Simple | current list context remains visible |
| D11 | Inspector Full | full temporal conflicts + attachment states |
| D12 | Global Quick Add | callable from any app route/global shortcut capability |
| D13 | Parsed Quick Add | keyboard-editable inherited/NLP chips |
| D14 | Search | overlay/no forced route loss |
| D15 | Command Palette | single command model |
| D16 | Multi-select | clear bulk actions |
| D17 | Completed | searchable/restorable rules |
| D18 | Import Preview | large dataset/table comparison |
| D19 | Settings | desktop-specific layout, not stretched mobile |
| D20 | Offline/Conflict | resolve without losing working context |

## Tablet validation

T01 Today portrait; T02 Today landscape; T03 Project+Inspector; T04 Board landscape; T05 Task Detail; T06 Plan. Tablet must use available area, not simply scale phone UI.

## System states

ST01 Loading; ST02 Empty; ST03 Offline; ST04 Reconnecting; ST05 Sync pending; ST06 Sync conflict; ST07 recoverable error; ST08 unrecoverable error/recovery; ST09 permission denied; ST10 notification permission; ST11 calendar permission future; ST12 account expired; ST13 partial import; ST14 long title; ST15 50 tasks Today; ST16 200 projects desktop; ST17 no search results; ST18 destructive confirmation; ST19 temporal conflict/warning; ST20 attachment pending/failed; ST21 local+existing account merge.

## Rule

A frame is not considered implemented merely because a screen visually exists. Its state transition, keyboard/touch/accessibility behavior, local/offline persistence, error recovery and relevant test from `06_TESTING_ACCEPTANCE.md` must also pass.

## Production-only edge states covered by behavior/tests

Use existing approved DS/sheets/toasts for:

- recurring Task cannot become Subtask until Repeat removed;
- generated recurring-child `Будущие повторения` scope;
- restore Subtask with completed Parent;
- restore from archived/deleted Project;
- move child to another Project → detach confirmation;
- Web closed-browser reminder disclosure;
- Android exact-alarm capability notice;
- logout with unsynced outbox;
- Todoist deep hierarchy / recurring-subtask import warning;
- backup restore/import ID-collision decision;
- local dormant workspace stash after login without merge.

## R3 VECTOR concept/production states — design v2

| ID | State | Acceptance |
|---|---|---|
| V01 | Composer / Multimodal | Existing Composer evolves to Text/Voice/File; no separate Vector app |
| V02 | Voice Listening | real recording state + live partial + Cancel/Finish; no fake OS chrome |
| V03 | Live Parsing | one capture shows N intents/target apps; per-intent state, not misleading all-or-nothing save |
| V04 | High confidence | reversible low-risk item may auto-commit + Undo |
| V05 | Medium | concise preview/correct; exact resolved date; no invented Contacts model |
| V06 | Low | one clarification only; can be voice in hands-free mode |
| V07 | Provenance/result | source label/capture correlation, no audio link |
| V08 | Partial routing failure | successes retained, failed intent Retry, no duplicates |
| V09 | Deferred Review | unresolved hands-free intents can be reviewed later; text-only retained by default |
| V10 | Microphone permission | actual OS dialog via platform; optional SHAGI pre-prompt only |
| V11 | Offline/no ASR path | Text fallback; no hidden persisted recording |
| V12 | Target unavailable/requires open | no false success; Review/Open target action |
| V13 | Review queue | minimal unresolved text, expiry, resolve/delete, no audio playback |
| V14 | Screenless acknowledgement | generic privacy-safe haptic/audio feedback; no sensitive spoken content by default |

### v2 theme showcase rule

The R1 v2 HTML contains `Бумага / Графит / Чернила` comparator themes for the ZAPISKI family. They are excluded from M42 SHAGI production Appearance, which remains System/Light/Dark.


---

<!-- FILE: 14_DESIGN_V2_DELTA.md -->

# ШАГИ — DESIGN V2 DELTA / IMPACT ON IMPLEMENTATION SPEC

**Источник:** `source/ШАГИ-handoff_design_v2.zip`  
**Дата review:** 29.08.2026  
**Статус:** изменения учтены в Implementation Specification 1.2.

## 1. Что изменилось в R1 Design

Функциональная структура R1 практически не изменилась. Основной diff текущего `R1_DESIGN_HANDOFF_v2.html` относительно handoff v1 касается showcase/theme-comparison слоя:

- старый единичный demo theme `zapiski` удалён;
- добавлены ZAPISKI-family showcase themes:
  - `Бумага` / `paper`;
  - `Графит` / `graphite`;
  - `Чернила` / `ink`;
- SIMPAS/SHAGI базовые light/dark tokens и основной R1 layout не получили продуктового изменения.
- bundled DS snapshot v2 byte-identical предыдущему DS snapshot (12/12 файлов по SHA256); значит, изменение не требует миграции базовых SHAGI design tokens.

### Нормативное решение

Эти три темы **не являются новыми production themes ШАГОВ**. Для R1 SHAGI по-прежнему обязательны:

- System;
- Light;
- Dark.

Showcase switcher, green device frame, fake status bar, comparison themes и Claude/DC runtime не переносятся в production.

## 2. Главное новое: `ВЕКТОР - CJM.dc.html`

Design v2 добавляет утверждённую future-концепцию R3 VECTOR.

CJM фиксирует шесть этапов:

1. Trigger — hands-busy / screenless capture surface.
2. Capture — natural speech + live partial transcript.
3. Intent/Entity/Router — одна фраза может стать несколькими independent intents и уйти в несколько SIMPAS apps.
4. Confidence branch — High / Medium / Low **по каждому intent**, не по всему utterance.
5. Result — готовые объекты в target apps + provenance.
6. Trust/repeat — voice становится быстрым capture surface, а не raw-audio inbox.

Concept screens:

- V01 Multimodal Composer;
- V02 Voice Listening;
- V03 Live Parsing;
- V04 High confidence;
- V05 Medium confidence;
- V06 Low confidence;
- provenance/result semantics from CJM stage 5.

## 3. Что в ТЗ было усилено после design v2

Новый дизайн потребовал не просто добавить экраны, а закрыть следующие production gaps:

### 3.1. Batch != transaction

Один voice capture — это batch independent intents. Cross-app all-or-nothing transaction запрещена.

Каждый intent имеет:

- stable `intent_id`;
- target service/action;
- confidence class;
- independent risk class;
- status;
- idempotency key;
- independent Retry/Undo where supported.

### 3.2. Confidence != authorization

High confidence разрешает auto-execute только reversible low-risk actions, если target реально поддерживает reliable Undo.

Sensitive, destructive, publish/send/payment/external-side-effect actions требуют confirmation независимо от confidence.

### 3.3. Partial transcript не мутирует данные

Streaming partial transcript — feedback only. Domain mutations допускаются только после final segment/capture.

### 3.4. Cross-app sandbox boundary

Separate Android/iOS/desktop apps не могут тихо писать в sandbox другого приложения.

Введён Target Capability Registry:

- same-app action → local domain command;
- cross-app target with authorized API → scoped target-service command;
- target unavailable/local-only/not authorized → `requires_open` / Deferred Review;
- direct foreign DB/filesystem access запрещён.

### 3.5. Partial failure

Если SHAGI task создан, а ZAPISKI note не создалась:

- task не откатывается автоматически;
- failed intent получает Retry;
- retry не создаёт дубль successful intent;
- batch показывает partial failure.

### 3.6. Hands-free / driving contradiction

CJM persona занята вождением, но Medium/Low mock показывает touch controls. Production rule:

- High reversible → generic audio/haptic acknowledgement;
- Medium → short voice confirmation where safe/capable;
- Low → one spoken clarification where safe/capable;
- otherwise unresolved item → Deferred Review;
- visual interaction не требуется, чтобы не потерять мысль.

### 3.7. Audio retention

Raw audio is transient by default:

- success → delete after final transcript;
- cancel → delete immediately;
- failure/session expiry/crash cleanup → delete;
- offline without local ASR → Text fallback, not hidden recording queue;
- logs/analytics/backups never contain raw audio.

Unresolved review may retain minimal text/candidate state <=7 days, never raw recording.

### 3.8. Provenance

Created object stores opaque origin metadata:

- source=vector;
- source channel;
- capture_batch_id;
- intent_id;
- timestamp.

`Голосовой ввод · 09:14` does **not** imply a retained/playable recording.

### 3.9. Native microphone permission

The styled Android permission screen in the prototype is conceptual. Production uses actual OS permission UI; SHAGI may only show a pre-permission explanation.

### 3.10. Illustrative mock data is not domain truth

The CJM says `пятницы, 5 сент`, but for 29.08.2026 the next Friday is 04.09.2026. Production derives exact dates from current locale/time/parser and never hardcodes mock dates.

Likewise `Иван П. — 2 контакта` is an ambiguity illustration, not a requirement for a SHAGI Contacts entity.

## 4. Files affected in the normative package

- `00_MASTER_IMPLEMENTATION_TZ.md`
- `02_DATA_MODEL_SYNC.md`
- `03_BACKEND_API.md`
- `04_UI_DESIGN_SYSTEM.md`
- `05_SECURITY_PRIVACY_LEGAL.md`
- `06_TESTING_ACCEPTANCE.md`
- `07_RELEASES_FUTURE.md`
- `09_IMPLEMENTATION_PLAN.md`
- `10_FINAL_REVIEW_LOG.md`
- `11_REFERENCE_BASE.md`
- `12_SCREEN_STATE_MATRIX.md`

Additionally, the reviewer pass corrected older review-log drift in recurrence, import, notifications, labels, i18n and bulk behavior.

## 5. Release impact

**R1 scope is not expanded by Vector.**

R1 remains:

- no voice;
- no Vector;
- no AI dependency;
- deterministic offline text NLP.

R3 contracts are present now only to prevent R1 architecture/Composer/domain from becoming a dead end.


---

<!-- FILE: 13_FINAL_VALIDATION_REPORT.md -->

# ШАГИ — FINAL VALIDATION REPORT · DESIGN V2

**Implementation Specification:** 1.2 DESIGN V2 REVIEWED / FROZEN  
**Дата:** 29.08.2026  
**Checks:** 89 · PASS 89 · FAIL 0

Проверка выполнена после включения `ШАГИ-handoff_design_v2.zip` и отдельного reviewer-pass. Проверяются не только наличие файлов, но и перенос решений review-log в нормативные behavior/data/API/security документы.

| Check | Result | Detail |
|---|---|---|
| Current R1 design v2 exists | PASS |  |
| Current VECTOR CJM v2 exists | PASS |  |
| Original design v2 ZIP exists | PASS |  |
| DS v2 exists | PASS |  |
| Design v2 ZIP CRC valid | PASS |  |
| Index version 1.2 | PASS |  |
| Master version 1.2 | PASS |  |
| No normative TBD/TODO/FIXME | PASS |  |
| No stale v1 source path | PASS |  |
| No stale old DS path | PASS |  |
| R1 voice-free red line | PASS |  |
| R1 production themes remain System/Light/Dark | PASS |  |
| Paper/Graphite/Ink excluded from SHAGI | PASS |  |
| Inbox uses capture_state | PASS |  |
| Today no-duplicate precedence | PASS |  |
| Later clears Planned Time | PASS |  |
| Assigning time resets Later | PASS |  |
| Time-only NLP rule exists | PASS |  |
| Temporal time requires date | PASS |  |
| Parent completion invariant | PASS |  |
| Label delete relation-only | PASS |  |
| Archive cancels notifications | PASS |  |
| Bulk hierarchy aggregate confirm | PASS |  |
| ru-RU CI contract | PASS |  |
| Todoist deep hierarchy policy | PASS |  |
| Todoist comment overflow preserved | PASS |  |
| Migration > project limit lossless | PASS |  |
| Backup collision modes | PASS |  |
| Recurrence top-level only | PASS |  |
| Deterministic UUIDv5 | PASS |  |
| Skip audit completion_kind | PASS |  |
| Remove-wins boundary | PASS |  |
| Template revision reconciliation | PASS |  |
| Late scheduled recurrence skips backlog | PASS |  |
| Restore hierarchy explicit | PASS |  |
| Analytics default OFF | PASS |  |
| Diagnostics default OFF | PASS |  |
| No user content logs | PASS |  |
| RF localization contract | PASS |  |
| SBOM/license gate | PASS |  |
| Web reminder limitation | PASS |  |
| Android exact alarm path | PASS |  |
| Logout unsynced no silent loss | PASS |  |
| Vector CJM source wired | PASS |  |
| Per-intent confidence | PASS |  |
| Independent risk gate | PASS |  |
| Partial transcript display-only | PASS |  |
| Target Capability Registry | PASS |  |
| Cross-app sandbox direct writes prohibited | PASS |  |
| Cross-app idempotency | PASS |  |
| Partial failure first-class | PASS |  |
| Reliable Undo required for High | PASS |  |
| No invented Contacts model | PASS |  |
| Provenance has no audio link | PASS |  |
| Audio deleted on all terminal paths | PASS |  |
| Offline without ASR does not persist audio | PASS |  |
| Deferred review retention | PASS |  |
| Hands-free flow | PASS |  |
| OS mic prompt is native | PASS |  |
| Mock wrong Friday date corrected | PASS |  |
| Batch Save-all contradiction corrected | PASS |  |
| Vector V01–V14 matrix | PASS |  |
| R3 future acceptance tests | PASS |  |
| Review queue no separate app | PASS |  |
| Vector session limits explicit | PASS |  |
| Vector content-free telemetry | PASS |  |
| Review log sequential 1..76 | PASS | found [1, 2, 3, 4, 5]..[72, 73, 74, 75, 76] |
| Review fix stop_after is normative | PASS |  |
| Review fix template_revision is normative | PASS |  |
| Review fix comment overflow is normative | PASS |  |
| Review fix archived notifications is normative | PASS |  |
| Review fix label lifecycle is normative | PASS |  |
| Review fix bulk completion is normative | PASS |  |
| Review fix Vector sandbox is normative | PASS |  |
| No duplicate headings: INDEX.md | PASS | [] |
| No duplicate headings: 00_MASTER_IMPLEMENTATION_TZ.md | PASS | [] |
| No duplicate headings: 01_PRODUCT_BEHAVIOR_R1.md | PASS | [] |
| No duplicate headings: 02_DATA_MODEL_SYNC.md | PASS | [] |
| No duplicate headings: 03_BACKEND_API.md | PASS | [] |
| No duplicate headings: 04_UI_DESIGN_SYSTEM.md | PASS | [] |
| No duplicate headings: 05_SECURITY_PRIVACY_LEGAL.md | PASS | [] |
| No duplicate headings: 06_TESTING_ACCEPTANCE.md | PASS | [] |
| No duplicate headings: 07_RELEASES_FUTURE.md | PASS | [] |
| No duplicate headings: 08_DEVOPS_CICD_OPERATIONS.md | PASS | [] |
| No duplicate headings: 09_IMPLEMENTATION_PLAN.md | PASS | [] |
| No duplicate headings: 10_FINAL_REVIEW_LOG.md | PASS | [] |
| No duplicate headings: 11_REFERENCE_BASE.md | PASS | [] |
| No duplicate headings: 12_SCREEN_STATE_MATRIX.md | PASS | [] |
| No duplicate headings: 14_DESIGN_V2_DELTA.md | PASS | [] |

## Design v2 source hashes

- `source/R1_DESIGN_HANDOFF_v2.html` SHA256: `3946318fe9a775aedcc93aba934a08cf31887bdd6821b91f33049a709f71a17f`
- `source/VECTOR_CJM_HANDOFF_v2.html` SHA256: `cc1d916519a252f6ec5728007de27310aed4f431b0109dfbca6743a8a3dd34d8`
- `source/ШАГИ-handoff_design_v2.zip` SHA256: `356459c1ac81a6ac246a7e0d6b1193ca698f2152364b3601219cccb6511e164c`
- `source/design-system-v2/styles.css` SHA256: `ee44a6f2df7f87ef43e993ff1865b8ab6435d12c9c07e5863d23910c60285790`

## Reviewer conclusion

R1 не получил скрытого расширения scope: voice/Vector остаются R3. Design v2 меняет showcase/theme comparison и добавляет утверждённый VECTOR CJM. Все обнаруженные противоречия между CJM, platform sandbox, confidence/risk, privacy, retry/idempotency и прежним ТЗ перенесены в нормативные документы.

Если любой check выше FAIL, пакет не считается frozen.
