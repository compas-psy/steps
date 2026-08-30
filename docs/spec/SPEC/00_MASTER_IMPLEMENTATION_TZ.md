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
