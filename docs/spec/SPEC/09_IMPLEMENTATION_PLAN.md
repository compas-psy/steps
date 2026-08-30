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
