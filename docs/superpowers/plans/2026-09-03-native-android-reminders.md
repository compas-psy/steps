# Native Android Reminders (NotificationSchedulerPort) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `Unavailable` stub of `notificationScheduler` in `apps/mobile/src/platform.ts` with a real, native, exact-alarm-capable Android implementation, and wire it into the reminder domain (fingerprint computation, reconciliation, cascading cancellation) so explicit/deadline reminders actually fire as OS notifications, survive force-stop and reboot, and never replay-storm.

**Architecture:** Two independent layers, built bottom-up.

1. **Domain/reconciliation layer** (`@shagi/core`, `@shagi/app`) — platform-agnostic. Computes `Reminder.scheduledFingerprint`, decides which reminders SHOULD be scheduled right now (active task, non-deleted, project not archived, `enabled:true`), and reconciles that "desired" set against whatever the platform reports as "actually scheduled" (`NotificationSchedulerPort.listScheduled` — a new port method this plan adds). This layer never touches Android/Kotlin and is fully unit-testable today.
2. **Native Android layer** (`apps/mobile/src-tauri`) — adopts the **official** `tauri-plugin-notification` 2.4.0 for the OS primitive (AlarmManager exact/inexact scheduling via `setExactAndAllowWhileIdle`/`setExact` with `canScheduleExactAlarms()` fallback, `PendingIntent`-based firing, and a `BOOT_COMPLETED`/`LOCKED_BOOT_COMPLETED`/`QUICKBOOT_POWERON` restore receiver — all already implemented and verified by reading its Kotlin source, see Task B1's ADR). That plugin does **not** expose an exact-alarm *capability query* or the Android 12+ "take me to settings" intent to JS — so a second, small, local Tauri mobile plugin (`alarm-capability`, our own Kotlin, ~40 lines) supplies exactly that one gap. `apps/mobile/src/platform.ts` implements `NotificationSchedulerPort` by calling both.

This is a deliberate departure from ADR-0005's SQLite precedent ("write our own native bridge from scratch") — here an official, actively maintained plugin already solves the hard, easy-to-get-wrong part (AlarmManager scheduling, boot receivers, PendingIntent lifecycle) correctly, and reinventing it would be pure risk with no benefit. Task B1 documents this as an ADR, verified by reading the plugin's actual Kotlin/Rust source (same rigor ADR-0005 applied when it *rejected* `@tauri-apps/plugin-sql`).

**Tech Stack:** TypeScript (`@shagi/core`, `@shagi/platform`, `@shagi/app`), Rust (`apps/mobile/src-tauri`, Tauri 2.11.5), Kotlin (Android, via Tauri's mobile-plugin `run_mobile_plugin`/`register_android_plugin` mechanism), `@tauri-apps/plugin-notification` 2.4.0 / `tauri-plugin-notification` 2.4.0.

**Spec:** `docs/spec/SPEC/01_PRODUCT_BEHAVIOR_R1.md` §18 (Reminders/notifications R1), §19 (Timezone); `docs/spec/SPEC/02_DATA_MODEL_SYNC.md` §14 (Notification reconciliation), reminders table shape; `docs/spec/SPEC/00_MASTER_IMPLEMENTATION_TZ.md` §7 (transaction pipeline step 5), §11.1 (Reminder platform capability matrix); `docs/spec/SPEC/05_SECURITY_PRIVACY_LEGAL.md` §3.1 (Android exact-reminder policy check); `.ultraplan/open-questions.md` `?28` (Android permission set — decided, do not revisit); `.ultraplan/research/04-android-release.md` §10.

## Global Constraints

- Permission set is **already decided** (`?28`): `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` (never `USE_EXACT_ALARM` — mutually exclusive choice, already reserved in `apps/mobile/android-permissions.txt`), `RECEIVE_BOOT_COMPLETED`, `VIBRATE`. Do not add `USE_EXACT_ALARM`.
- Never request notification permission at first launch — only just-in-time, when the first reminder is created (SPEC §18, `00_MASTER...` §11.1).
- Never silently present an inexact alarm as exact (SPEC §11.1, §3.1) — `getSchedulingCapability()`/the new capability check must be queried and disclosed BEFORE scheduling, not discovered after the fact.
- Complete/delete a task cancels **all** pending notifications for it (SPEC §18). Archiving a project cancels all future notifications for its tasks; unarchiving reconciles without replaying expired ones as a storm (SPEC §18, line 489; Testing Acceptance item 34).
- Timezone change reschedules local reminders preserving local wall-clock time (09:00 stays 09:00) — SPEC §19.
- Max 1 explicit reminder per task in R1 UI (SPEC §18 line 17) — already enforced by `createExplicitReminderCommand`, not this plan's concern.
- R1 excludes multiple/relative reminders (R1.1) and per-shared-project notifications (R1.3) — do not build either.
- `packages/core`/`packages/storage`/`packages/platform` must stay platform-neutral (CLAUDE.md package boundary) — no Android/Kotlin/Tauri knowledge outside `apps/mobile`.
- Native `Date` is forbidden in domain logic (CLAUDE.md, TZ §5) — use `@js-temporal/polyfill` exclusively; the only place raw epoch milliseconds may appear is inside the Android/Kotlin native layer (AlarmManager's own API), never in `@shagi/core`/`@shagi/app`.
- All user-facing strings go through `@shagi/i18n`; no Cyrillic literals in `apps/*`/`packages/platform`/`packages/core` (CLAUDE.md, architecture-boundary test).
- Comments and docs in Russian, explaining *why*, referencing the SPEC section (CLAUDE.md style rule) — this applies to all new code in this plan, including Kotlin.
- `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm format:check` must stay green after every task; `cargo test`/`cargo clippy` for every Rust change (`export PATH=/usr/local/bin:$PATH` first, per CLAUDE.md's environment trap).
- Do not touch SQLite/`eraseAllLocalData`/`classify_statement` in this plan — ADR-0005 is closed, no regression, don't reopen it (M52 must still cancel reminders per Task A5/scope item 13, but that's calling the *reconciliation* module, not touching storage internals).
- Do not build Undo (ST §58) or any new screen/UI beyond what §18/§19/ST10/the exact-alarm capability notice require — explicitly out of scope per the user's own instruction.

---

## Phase A — Domain/reconciliation layer (platform-agnostic, no Android needed)

### Task A1: `NotificationSchedulerPort.listScheduled` + web adapter

**Why:** SPEC §14 reconciliation compares "desired schedule fingerprints" against "OS scheduled notification IDs." The current port (`schedule`/`cancel`/`getSchedulingCapability`) has no way to ask "what's actually scheduled right now" — without it, reconciliation logic would have to guess or duplicate itself per-platform inside `apps/*`, violating the package boundary (CLAUDE.md: all product behavior lives in `packages/app`, not `apps/*`). Adding this method keeps reconciliation logic in one place (`packages/app`) and lets every platform (web, Android, future desktop/iOS) answer the same question uniformly.

**Files:**
- Modify: `packages/platform/src/index.ts` (the `NotificationSchedulerPort` interface, around line 199-238 — read current line numbers before editing, other tasks may have shifted them)
- Modify: `apps/web/src/platform.ts` (`createNotificationScheduler`, ~line 74-116)
- Modify: `apps/desktop/src/platform.ts` (stays `Unavailable`, no code change needed — confirm via test that `Unavailable` capability still type-checks against the extended interface)
- Test: `packages/platform/test/index.test.ts`
- Test: `apps/web/test/platform.test.ts` (find the actual current test file for `createNotificationScheduler` via `grep -rl createNotificationScheduler apps/web/test`)

**Interfaces:**
- Produces: `NotificationSchedulerPort.listScheduled(): Promise<readonly string[]>` — returns the `id`s (same string ids passed to `schedule`) currently scheduled on this platform, in any order.

- [ ] **Step 1: Read the current interface and web adapter verbatim**

Run `sed -n '190,240p' packages/platform/src/index.ts` and `sed -n '60,120p' apps/web/src/platform.ts` to get exact current line numbers and surrounding code before editing (both may have moved since this plan was written).

- [ ] **Step 2: Add `listScheduled` to the port interface**

In `packages/platform/src/index.ts`, inside `NotificationSchedulerPort`, after the `cancel` method and before `getSchedulingCapability`, add:

```ts
  /**
   * Список `id`, реально запланированных на этой платформе прямо сейчас —
   * основа reconciliation (`02§14`): вызывающий код сравнивает это с тем,
   * что должно быть запланировано по состоянию домена, и решает, что
   * досоздать, а что отменить. Порядок не гарантирован.
   */
  listScheduled(): Promise<readonly string[]>;
```

- [ ] **Step 3: Implement in the web adapter**

In `apps/web/src/platform.ts`, inside `createNotificationScheduler()`, add to the returned object (after `cancel`):

```ts
    async listScheduled() {
      return Array.from(timers.keys());
    },
```

- [ ] **Step 4: Write the failing test for the port contract**

Add to `packages/platform/test/index.test.ts` (find the existing `notificationScheduler`-related test block first via `grep -n notificationScheduler packages/platform/test/index.test.ts` and place near it):

```ts
it('createUnavailablePlatform().notificationScheduler остаётся Unavailable после расширения порта listScheduled', () => {
  const registry = createUnavailablePlatform();
  expect(isAvailable(registry.notificationScheduler)).toBe(false);
});
```

- [ ] **Step 5: Write the failing test for the web adapter**

In `apps/web/test/platform.test.ts` (exact file found in Step 1), add:

```ts
it('listScheduled возвращает id всех запланированных, не отменённых уведомлений', async () => {
  const scheduler = createNotificationScheduler();
  await scheduler.schedule(
    'r1',
    'Заголовок',
    Temporal.PlainDate.from('2099-01-01'),
    null,
    'UTC',
  );
  await scheduler.schedule(
    'r2',
    'Заголовок 2',
    Temporal.PlainDate.from('2099-01-02'),
    null,
    'UTC',
  );
  await scheduler.cancel('r1');
  expect(await scheduler.listScheduled()).toEqual(['r2']);
});
```
(Adapt the exact `import`/setup boilerplate — Temporal import, test file's existing `describe` block — to match what's already in that file; don't duplicate an existing `describe('createNotificationScheduler'`.)

- [ ] **Step 6: Run tests, verify they fail (method doesn't exist yet — should already pass after Steps 2-3; if you did Steps 2-3 first, this validates instead of red/green — either order is fine, but confirm both are internally consistent: TS compile error if `listScheduled` referenced before Step 2/3 land)**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/platform test && pnpm --filter @shagi/web test`
Expected: PASS (if Steps 2-3 already done) — if you prefer strict TDD red-green, write Steps 4-5 BEFORE Steps 2-3 and confirm a TS compile failure first.

- [ ] **Step 7: Typecheck everything that implements/consumes the port**

Run: `export PATH=/usr/local/bin:$PATH && pnpm -r typecheck`
Expected: PASS — this will catch any other `NotificationSchedulerPort` implementation (there are only three: web, desktop-as-Unavailable, mobile-as-Unavailable/to-be-built in Phase B) missing the new method. `Unavailable` itself doesn't need `listScheduled` (it's a marker type, not an implementation) — confirm `packages/platform/src/index.ts`'s `Unavailable`/`isAvailable` types are structured so this is automatically true (they should already be, since `Unavailable` isn't a `NotificationSchedulerPort` at all, just a tagged incompatible type).

- [ ] **Step 8: Commit**

```bash
git add packages/platform/src/index.ts apps/web/src/platform.ts packages/platform/test/index.test.ts apps/web/test/platform.test.ts
git commit -m "feat(platform): NotificationSchedulerPort.listScheduled — основа reconciliation (02§14)"
```

---

### Task A2: `computeReminderFingerprint` — replace the `''` placeholder

**Why:** `Reminder.scheduledFingerprint` exists in the schema and type but is hardcoded to `''` in all three creation commands (`reminder-explicit.ts:105`, `reminder-deadline.ts:130,175` — verify exact lines before editing). Reconciliation (Task A3) needs a REAL value here: something that changes if and only if what should be scheduled actually changed (title doesn't matter for re-scheduling decisions — only `kind` + the resolved fire moment + `enabled` do, since editing a reminder's time must trigger reschedule, but nothing else does).

**Files:**
- Create: `packages/core/src/commands/reminder-fingerprint.ts`
- Modify: `packages/core/src/commands/reminder-explicit.ts` (replace `scheduledFingerprint: ''`)
- Modify: `packages/core/src/commands/reminder-deadline.ts` (replace both `scheduledFingerprint: ''` occurrences)
- Modify: `packages/core/src/commands/index.ts` (export the new function/type if other packages need it — `packages/app`'s reconciliation module, Task A3, will need to recompute the fingerprint for existing reminders too, to detect drift, so this must be exported)
- Test: `packages/core/test/commands/reminder-fingerprint.test.ts`

**Interfaces:**
- Consumes: `Reminder['kind']`, `Reminder['localRuleJson']` (has a `firesAt: string` key per the doc comment in `reminder-explicit.ts` — a `PlainDateTime`-shaped ISO string, same field name across all three kinds), `Reminder['enabled']`.
- Produces: `computeReminderFingerprint(reminder: Pick<Reminder, 'kind' | 'localRuleJson' | 'enabled'>): string` — deterministic, pure.

- [ ] **Step 1: Read the current `''` call sites verbatim**

Run: `grep -n "scheduledFingerprint" packages/core/src/commands/reminder-explicit.ts packages/core/src/commands/reminder-deadline.ts` — confirm exact lines and confirm `localRuleJson.firesAt` is indeed the shared key (re-read the surrounding ~15 lines of each to see how `localRuleJson` is built).

- [ ] **Step 2: Write the failing test**

```ts
// packages/core/test/commands/reminder-fingerprint.test.ts
import { describe, expect, it } from 'vitest';
import { computeReminderFingerprint } from '../../src/commands/reminder-fingerprint.js';

describe('computeReminderFingerprint', () => {
  it('одинаковый kind/firesAt/enabled даёт одинаковый отпечаток', () => {
    const a = computeReminderFingerprint({
      kind: 'explicit',
      localRuleJson: { firesAt: '2026-09-10T09:00:00' },
      enabled: true,
    });
    const b = computeReminderFingerprint({
      kind: 'explicit',
      localRuleJson: { firesAt: '2026-09-10T09:00:00' },
      enabled: true,
    });
    expect(a).toBe(b);
  });

  it('другое firesAt даёт другой отпечаток', () => {
    const a = computeReminderFingerprint({
      kind: 'explicit',
      localRuleJson: { firesAt: '2026-09-10T09:00:00' },
      enabled: true,
    });
    const b = computeReminderFingerprint({
      kind: 'explicit',
      localRuleJson: { firesAt: '2026-09-10T10:00:00' },
      enabled: true,
    });
    expect(a).not.toBe(b);
  });

  it('enabled:false даёт другой отпечаток, чем enabled:true при прочих равных', () => {
    const enabled = computeReminderFingerprint({
      kind: 'explicit',
      localRuleJson: { firesAt: '2026-09-10T09:00:00' },
      enabled: true,
    });
    const disabled = computeReminderFingerprint({
      kind: 'explicit',
      localRuleJson: { firesAt: '2026-09-10T09:00:00' },
      enabled: false,
    });
    expect(enabled).not.toBe(disabled);
  });

  it('разный kind при одинаковом firesAt даёт разный отпечаток', () => {
    const explicit = computeReminderFingerprint({
      kind: 'explicit',
      localRuleJson: { firesAt: '2026-09-10T09:00:00' },
      enabled: true,
    });
    const missed = computeReminderFingerprint({
      kind: 'deadline_missed',
      localRuleJson: { firesAt: '2026-09-10T09:00:00' },
      enabled: true,
    });
    expect(explicit).not.toBe(missed);
  });

  it('отсутствующий firesAt не бросает — отпечаток всё равно детерминирован', () => {
    expect(() =>
      computeReminderFingerprint({ kind: 'explicit', localRuleJson: {}, enabled: true }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/core test -- reminder-fingerprint`
Expected: FAIL — `Cannot find module '../../src/commands/reminder-fingerprint.js'`

- [ ] **Step 3: Implement**

```ts
// packages/core/src/commands/reminder-fingerprint.ts
import type { Reminder } from '../entities/reminder.js';

/**
 * Отпечаток желаемого расписания одного напоминания (`02§14`
 * "notification reconciliation": каждый запуск/wake сравнивает отпечатки
 * желаемого с тем, что реально запланировано на ОС, отменяет лишнее и
 * досоздаёт недостающее).
 *
 * Меняется тогда и только тогда, когда меняется то, что ДОЛЖНО произойти
 * в системном планировщике: `kind` (разный кулдаун/логика доставки),
 * `localRuleJson.firesAt` (момент срабатывания — общее поле всех трёх
 * `kind`, см. `reminder-explicit.ts`) и `enabled` (выключенное напоминание
 * не должно быть запланировано вовсе). `title`/`taskId` НЕ входят: смена
 * заголовка задачи не обязана пересобирать alarm — заголовок читается
 * заново в момент фактической доставки нативным слоем, не на этапе
 * планирования (см. Task B, Kotlin-приёмник читает актуальный заголовок
 * из SQLite перед показом уведомления, а не то, что было на момент
 * schedule()).
 *
 * Не криптографический хэш — отпечаток сравнивается только с самим собой
 * (предыдущим значением того же напоминания), коллизии между РАЗНЫМИ
 * напоминаниями не имеют значения (id напоминания — отдельное поле,
 * reconciliation сравнивает по id, отпечаток только внутри одного id).
 */
export function computeReminderFingerprint(
  reminder: Pick<Reminder, 'kind' | 'localRuleJson' | 'enabled'>,
): string {
  const firesAt =
    typeof reminder.localRuleJson.firesAt === 'string' ? reminder.localRuleJson.firesAt : '';
  return `${reminder.kind}|${firesAt}|${reminder.enabled ? '1' : '0'}`;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/core test -- reminder-fingerprint`
Expected: PASS, all 5 cases.

- [ ] **Step 5: Wire into the three creation commands**

In `reminder-explicit.ts`, replace `scheduledFingerprint: ''` with `scheduledFingerprint: computeReminderFingerprint({ kind: 'explicit', localRuleJson, enabled: true })` (use the actual local variable name for the rule JSON object at that call site — re-read the function body first, it's built a few lines above the `Reminder` object literal). Same pattern for both commands in `reminder-deadline.ts` (`kind: 'deadline_approaching'` / `kind: 'deadline_missed'` respectively), and add the import (`import { computeReminderFingerprint } from './reminder-fingerprint.js';`) to both files.

- [ ] **Step 6: Export from the package index**

In `packages/core/src/commands/index.ts`, add near the other reminder command exports:
```ts
export { computeReminderFingerprint } from './reminder-fingerprint.js';
```

- [ ] **Step 7: Update existing reminder command tests that asserted `scheduledFingerprint === ''`**

Run: `grep -rn "scheduledFingerprint.*''" packages/core/test/` and fix any assertion that hardcoded the old placeholder to instead assert the new computed value (or just check it's non-empty/matches the new function's output) — do not leave a stale assertion that happens to still pass by coincidence.

- [ ] **Step 8: Run full core test suite**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/core test && pnpm --filter @shagi/core typecheck && pnpm --filter @shagi/core lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/commands/reminder-fingerprint.ts packages/core/src/commands/reminder-explicit.ts packages/core/src/commands/reminder-deadline.ts packages/core/src/commands/index.ts packages/core/test/commands/reminder-fingerprint.test.ts
git commit -m "feat(core): computeReminderFingerprint — заменяет placeholder '' (02§14)"
```

---

### Task A3: Reconciliation module — `reconcileReminderSchedule`

**Why:** This is the actual engine behind SPEC §14 and the transaction-pipeline step 5 (`00_MASTER...` §7: "5. notification reconciliation"). It answers: given the current DB state and what's actually scheduled on the platform, what needs to change? Two entry points: a full scan (boot/wake/timezone-change — §14's "every startup/background wake") and a per-task scan (called right after any command that changes a task's/reminder's schedulability — cheaper, avoids rescanning the whole workspace on every edit).

**Files:**
- Create: `packages/app/src/state/reminder-reconciliation.ts`
- Test: `packages/app/test/state/reminder-reconciliation.test.ts`

**Interfaces:**
- Consumes: `StoragePort` (from `@shagi/storage` — `storage.reminders`/`storage.tasks`/`storage.projects` repositories, all already exist), `NotificationSchedulerPort` (from `@shagi/platform`, extended in Task A1 with `listScheduled`), `Temporal.PlainDateTime` "now local", IANA timezone string.
- Produces:
  - `reconcileReminderSchedule(storage: StoragePort, scheduler: NotificationSchedulerPort, nowLocal: Temporal.PlainDateTime, timezone: string): Promise<ReconciliationSummary>` — full scan.
  - `reconcileReminderScheduleForTask(storage: StoragePort, scheduler: NotificationSchedulerPort, taskId: Uuid, nowLocal: Temporal.PlainDateTime, timezone: string): Promise<ReconciliationSummary>` — single-task scan (used after task/reminder commands — cheap, no `listScheduled()` full diff, just schedules/cancels exactly this task's reminders based on current desired state).
  - `interface ReconciliationSummary { readonly scheduled: readonly string[]; readonly cancelled: readonly string[] }` — for tests and for the M52/reboot smoke assertions the user asked for ("scheduler снова пригоден для работы" after wipe — an empty `ReconciliationSummary` after a full wipe is the observable proof).

- [ ] **Step 1: Read the real repository/entity shapes before writing anything**

Run these to get exact current signatures (do not guess):
```
grep -n "interface ReminderRepository" -A5 packages/storage/src/ports/reminder-repository.ts
grep -n "interface TaskRepository" -A30 packages/storage/src/ports/task-repository.ts
grep -n "interface ProjectRepository" -A15 packages/storage/src/ports/project-repository.ts
grep -n "^export interface Task " -A50 packages/core/src/entities/task.ts
grep -n "^export interface Project " -A20 packages/core/src/entities/project.ts
```
Confirm: how to enumerate ALL tasks (is there a `listAll`/`listByCaptureStateAndStatus`-only API? — if there's no "list every non-deleted task" method, this task must add one to `TaskRepository`/`StoragePort` first, as a sub-step here, matching the existing repository pattern file-for-file). Confirm `Task.status` values (`'active'` confirmed elsewhere in this codebase), `Task.deletedAt`, `Task.projectId`, `Project.archivedAt`/`Project.deletedAt`.

- [ ] **Step 2: If no "list all reminders with their owning task" query exists, add it**

If Step 1 shows there's no way to get "every reminder whose task still needs it considered" without an N+1 (one `listByTask` per task), add a `ReminderRepository.listAllEnabled(): Promise<readonly Reminder[]>` method (mirroring how `LabelRepository.listAll()` already works — same pattern, `WHERE enabled = 1` or equivalent per-backend) to `packages/storage/src/ports/reminder-repository.ts`, implement it in `packages/storage/src/sqlite/repositories.ts` (SQL: `SELECT * FROM "reminders" WHERE enabled = ?` — `enabled` stored as the DB's boolean encoding, check `mappers.ts` `reminderToRow`/`rowToReminder` for the exact boolean codec function to reuse) and `packages/storage/src/indexeddb/`, and `packages/storage/src/memory/in-memory-storage.ts`, plus the shared contract test in `packages/storage/src/contract/storage-contract.ts` (mirror an existing `listAll`-style contract test verbatim in structure). This sub-step needs its own red/green cycle before continuing — do not skip testing it in isolation just because it's nested inside Task A3.

- [ ] **Step 3: Write the failing test for `reconcileReminderSchedule` (full scan)**

```ts
// packages/app/test/state/reminder-reconciliation.test.ts
import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';
import { createInMemoryStorage } from '@shagi/storage'; // confirm exact export name/path first
import type { NotificationSchedulerPort, NotificationPrecision } from '@shagi/platform';
import { reconcileReminderSchedule } from '../../src/state/reminder-reconciliation.js';
// + createTaskCommand / createExplicitReminderCommand fixtures per Task A5's pattern

function fakeScheduler(): NotificationSchedulerPort & { calls: { scheduled: string[]; cancelled: string[] } } {
  const scheduled = new Set<string>();
  const calls = { scheduled: [] as string[], cancelled: [] as string[] };
  return {
    calls,
    async schedule(id) {
      scheduled.add(id);
      calls.scheduled.push(id);
    },
    async cancel(id) {
      scheduled.delete(id);
      calls.cancelled.push(id);
    },
    async listScheduled() {
      return Array.from(scheduled);
    },
    async getSchedulingCapability(): Promise<NotificationPrecision> {
      return 'exact';
    },
  };
}

describe('reconcileReminderSchedule', () => {
  it('планирует напоминание активной задачи, которого ещё нет в listScheduled', async () => {
    const storage = createInMemoryStorage();
    const scheduler = fakeScheduler();
    // ... seed: create a task via createTaskCommand, create an explicit
    // reminder via createExplicitReminderCommand, both against `storage`
    const summary = await reconcileReminderSchedule(
      storage,
      scheduler,
      Temporal.PlainDateTime.from('2026-09-03T08:00:00'),
      'Europe/Moscow',
    );
    expect(summary.scheduled).toHaveLength(1);
    expect(scheduler.calls.scheduled).toHaveLength(1);
  });

  it('отменяет напоминание, чья задача завершена/удалена/в архивном проекте', async () => {
    // seed a reminder, mark scheduler.listScheduled() to already report it
    // scheduled, mark the owning task completed/deleted OR its project
    // archived, run reconcile, assert scheduler.cancel was called with
    // that reminder's id and summary.cancelled contains it
  });

  it('не трогает то, что уже согласовано (fingerprint не изменился, уже запланировано)', async () => {
    // seed a reminder already correctly scheduled — assert NEITHER
    // schedule NOR cancel is called (idempotent — this is the anti-replay-storm assertion)
  });

  it('пересобирает напоминание, если fingerprint разошёлся (время изменилось)', async () => {
    // seed a reminder scheduled under an OLD fingerprint's id-derived
    // schedule; change its firesAt via updateReminder-equivalent; assert
    // cancel(oldId-or-same-id) THEN schedule(id) both happen — reschedule,
    // not accumulation
  });
});
```
(This is a skeleton with real assertions on the observable behavior — fill in the exact seeding calls by reading `packages/app/test/screens/QuickAdd.test.tsx` and `packages/core/test/commands/create-recurring-task.test.ts` for the established fixture patterns already used elsewhere in this codebase, and `packages/storage/src/index.ts` for the real `createInMemoryStorage` export name before running.)

- [ ] **Step 4: Run tests, verify they fail**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/app test -- reminder-reconciliation`
Expected: FAIL — module doesn't exist.

- [ ] **Step 5: Implement `reconcileReminderSchedule`**

```ts
// packages/app/src/state/reminder-reconciliation.ts
import { Temporal } from '@js-temporal/polyfill';
import type { NotificationSchedulerPort } from '@shagi/platform';
import type { StoragePort } from '@shagi/storage';
import type { Reminder } from '@shagi/core';

export interface ReconciliationSummary {
  readonly scheduled: readonly string[];
  readonly cancelled: readonly string[];
}

/**
 * Реконсиляция желаемого расписания напоминаний с тем, что реально
 * запланировано на платформе (`02§14`). Источник истины — SQLite/
 * IndexedDB (через `storage`), НЕ то, что помнит нативный слой: если ОС
 * потеряла alarm (например, между `RECEIVE_BOOT_COMPLETED` и тем, как этот
 * код успел отреагировать), это функция обнаружит и пересоздаст.
 *
 * "Должно быть запланировано" = напоминание `enabled`, его задача жива
 * (`deletedAt === null`), активна (`status === 'active'` — завершённая
 * задача не должна звонить), и её проект (если есть) не архивирован
 * (`archivedAt === null`) — ровно правило из `01§18` "Complete/delete
 * cancels all pending task notifications" плюс архивация проекта.
 *
 * Не создаёт replay storm для просроченных напоминаний (`01§18` line 489,
 * Testing Acceptance #34): если желаемый момент уже в прошлом относительно
 * `nowLocal`, эта функция НЕ вызывает `schedule` для него — платформенный
 * `schedule()` сам обязан быть no-op для прошлого (веб-адаптер уже это
 * делает, `apps/web/src/platform.ts` `delayMs <= 0 return`; Android-адаптер
 * из Phase B обязан вести себя так же — проверяется в Task B-теста).
 */
export async function reconcileReminderSchedule(
  storage: StoragePort,
  scheduler: NotificationSchedulerPort,
  nowLocal: Temporal.PlainDateTime,
  timezone: string,
): Promise<ReconciliationSummary> {
  const desired = await desiredReminders(storage);
  const currentlyScheduled = new Set(await scheduler.listScheduled());
  return applyReconciliation(scheduler, desired, currentlyScheduled, nowLocal, timezone);
}

/** Та же логика, только для ОДНОЙ задачи — дешёвый путь, вызываемый сразу
 * после команд, меняющих расписание (Task A5), без полного `listScheduled()`. */
export async function reconcileReminderScheduleForTask(
  storage: StoragePort,
  scheduler: NotificationSchedulerPort,
  taskId: string,
  nowLocal: Temporal.PlainDateTime,
  timezone: string,
): Promise<ReconciliationSummary> {
  const allDesired = await desiredReminders(storage);
  const desired = allDesired.filter((entry) => entry.reminder.taskId === taskId);
  const taskReminders = await storage.reminders.listByTask(taskId as never); // см. Шаг 1 — привести к реальному Uuid-типу
  const currentlyScheduled = new Set(taskReminders.map((r) => r.id));
  return applyReconciliation(scheduler, desired, currentlyScheduled, nowLocal, timezone);
}

interface DesiredEntry {
  readonly reminder: Reminder;
  readonly title: string;
}

async function desiredReminders(storage: StoragePort): Promise<readonly DesiredEntry[]> {
  // См. Task A3 Шаг 1-2: заменить на реальный listAllEnabled()/эквивалент,
  // и реальные поля Task/Project — это каркас, не финальный код.
  throw new Error('см. план — реализовать после Шага 1-2 (реальные репозитории)');
}

async function applyReconciliation(
  scheduler: NotificationSchedulerPort,
  desired: readonly DesiredEntry[],
  currentlyScheduled: ReadonlySet<string>,
  nowLocal: Temporal.PlainDateTime,
  timezone: string,
): Promise<ReconciliationSummary> {
  const scheduled: string[] = [];
  const cancelled: string[] = [];
  const desiredIds = new Set(desired.map((entry) => entry.reminder.id));

  for (const id of currentlyScheduled) {
    if (!desiredIds.has(id)) {
      // eslint-disable-next-line no-await-in-loop -- реконсиляция по сути последовательна, малое число напоминаний
      await scheduler.cancel(id);
      cancelled.push(id);
    }
  }

  for (const entry of desired) {
    const rule = entry.reminder.localRuleJson;
    const firesAt = typeof rule.firesAt === 'string' ? rule.firesAt : null;
    if (firesAt === null) continue;
    const target = Temporal.PlainDateTime.from(firesAt);
    if (Temporal.PlainDateTime.compare(target, nowLocal) <= 0) continue; // не реплеим просроченное
    // eslint-disable-next-line no-await-in-loop -- см. выше
    await scheduler.schedule(
      entry.reminder.id,
      entry.title,
      target.toPlainDate(),
      target.toPlainTime(),
      timezone,
    );
    scheduled.push(entry.reminder.id);
  }

  return { scheduled, cancelled };
}
```

**Note for the implementer:** `desiredReminders` is deliberately left throwing — Step 1's research determines its real body (which repository calls, which `Task`/`Project` fields). Do not proceed past this step with a placeholder committed; finish the real implementation before Step 6. This plan cannot hand you the exact field names with 100% certainty without you re-reading the live schema first (per Step 1) — that is the one legitimate exception to "no placeholders" in this document: a scaffold explicitly marked to be completed using Step 1's findings, not a TODO left for later.

- [ ] **Step 6: Complete `desiredReminders` using Step 1's real findings, then run tests until green**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/app test -- reminder-reconciliation`
Expected: PASS, all cases from Step 3 plus the per-task variant.

- [ ] **Step 6b: Add a SQLite-backed variant of the same tests (not just in-memory)**

`reconcileReminderSchedule`/`reconcileReminderScheduleForTask` must work identically against the real SQLite adapter — `createInMemoryStorage` alone doesn't prove the repository calls this task added in Step 2 (`listAllEnabled` etc.) actually work against real SQL. Create `packages/storage/test/sqlite/reminder-reconciliation-native.test.ts`, mirroring the exact pattern already established by `packages/storage/test/sqlite/quick-add-recurring-label-native.test.ts` and `erase-all-local-data-native.test.ts` from the ADR-0005 work (`openNativeSqliteStorage(createFakeNativeBridge(), 'reminder-reconciliation.db')`, real domain commands, no `relaxForeignKeysAfterOpen`). Re-run at minimum the first and third test cases from Step 3 (schedules what's missing; is idempotent when already correct) against this real backend. This is the "интеграционные tests adapter ↔ SQLite ↔ native scheduler" layer the user explicitly asked for — the "native scheduler" side is the same `fakeScheduler()` helper from Step 3 (SQLite is real, the OS scheduler is faked here; Task B8 is where the OS scheduler side becomes real too, on the emulator).

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/storage test -- reminder-reconciliation`
Expected: PASS.

- [ ] **Step 7: Typecheck/lint**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/app typecheck && pnpm --filter @shagi/app lint`

- [ ] **Step 8: Commit**

```bash
git add packages/app/src/state/reminder-reconciliation.ts packages/app/test/state/reminder-reconciliation.test.ts packages/storage/src/ports/reminder-repository.ts packages/storage/src/sqlite/repositories.ts packages/storage/src/indexeddb packages/storage/src/memory/in-memory-storage.ts packages/storage/src/contract/storage-contract.ts
git commit -m "feat(app): reconcileReminderSchedule — движок 02§14, без replay storm просроченных"
```

---

### Task A4: Wire reconciliation into call sites (create/cancel reminder, app startup, cascading cancellation)

**Why:** Task A3 built the engine; nothing calls it yet. This task is the "5. notification reconciliation" pipeline step from `00_MASTER...` §7 made real: after any reminder-affecting command, and on every app startup/wake.

**Files:**
- Modify: `packages/app/src/screens/TaskDetail.tsx` (`handleSubmitReminder`/`handleCancelReminder`, exact lines found via `grep -n "handleSubmitReminder\|handleCancelReminder" packages/app/src/screens/TaskDetail.tsx`)
- Modify: `packages/core/src/commands/complete-task.ts` — NO code change for scheduling itself (core stays platform-neutral), but confirm/verify this command's result gives the caller (`packages/app`) enough to know which task completed, so `packages/app` can call `reconcileReminderScheduleForTask` right after. Same for `delete-task.ts`, `project-archive.ts`.
- Modify: every `packages/app` call site that currently calls `completeTaskCommand`/`deleteTaskCommand`/`projectArchiveCommand` (grep for each) — add a `void reconcileReminderScheduleForTask(...)` call after a successful result. Enumerate exact call sites via `grep -rn "completeTaskCommand\|deleteTaskCommand\|projectArchiveCommand" packages/app/src` before editing — there may be several screens (Today, TaskDetail, Plan, Project, Search, bulk actions).
- Modify: `packages/app/src/App.tsx` (or wherever the app-level startup effect lives — find via `grep -n "useEffect" packages/app/src/App.tsx`) — add a one-time startup call to `reconcileReminderSchedule` (full scan).
- Test: extend `packages/app/test/screens/TaskDetail.test.tsx` and each modified call site's existing test file.

**Interfaces:**
- Consumes: `reconcileReminderScheduleForTask`/`reconcileReminderSchedule` from Task A3, `platform.notificationScheduler` from `AppHostContext` (confirm the exact hook name — likely `usePlatform()`/`useAppHost()`, grep `packages/app/src/state/context.tsx`).

- [ ] **Step 1: Enumerate every call site**

Run:
```
grep -rn "completeTaskCommand(" packages/app/src
grep -rn "deleteTaskCommand(" packages/app/src
grep -rn "createProjectArchiveCommand\|projectArchiveCommand" packages/app/src
grep -n "handleSubmitReminder\|handleCancelReminder" packages/app/src/screens/TaskDetail.tsx
grep -n "usePlatform\|useAppHost\|AppHostContext" packages/app/src/state/context.tsx
```
Write down the exact file:line list — this determines how many near-identical edits Steps 3-4 make.

- [ ] **Step 2: Write a failing test for the TaskDetail reminder call site**

In `packages/app/test/screens/TaskDetail.test.tsx`, add a test using a fake `notificationScheduler` (same shape as Task A3's `fakeScheduler`) injected via the test's existing `AppProvider`/`testHost()` harness (check `QuickAdd.test.tsx` for the pattern — `testHost()` likely builds a `PlatformCapabilitiesRegistry`; extend it or pass an override), asserting that creating an explicit reminder through the UI results in `scheduler.schedule` being called once with the right id, and cancelling it results in `scheduler.cancel`.

- [ ] **Step 3: Run test, verify it fails**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/app test -- TaskDetail`

- [ ] **Step 4: Add the call after `createExplicitReminderCommand`/`cancelReminderCommand` in `TaskDetail.tsx`**

After a successful `createExplicitReminderCommand`/`cancelReminderCommand` result inside `handleSubmitReminder`/`handleCancelReminder`, add (adapt variable names to what's actually in scope at that point — `platform`, `storage`, current local-time values already computed for `reminderDeps()`):
```ts
if (isAvailable(platform.notificationScheduler)) {
  await reconcileReminderScheduleForTask(
    storage,
    platform.notificationScheduler,
    task.id,
    nowLocal,
    timezone, // confirm how the current IANA timezone string is already obtained elsewhere in this file/host — do not invent a new source
  );
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/app test -- TaskDetail`

- [ ] **Step 6: Repeat Steps 2-5 for every other call site found in Step 1** (complete/delete/archive)

Each gets its own failing-test-then-implementation cycle — do not batch-edit all call sites and test once at the end; each is its own reviewable increment per the skill's task-sizing rule, but since they're small and mechanical, group them as sub-steps of this one task (not separate top-level tasks) since none is independently meaningful without the others.

- [ ] **Step 7: Add the startup full-reconciliation call**

In `packages/app/src/App.tsx`'s top-level mount effect, add (guard with `isAvailable`):
```ts
useEffect(() => {
  if (!isAvailable(host.platform.notificationScheduler)) return;
  void reconcileReminderSchedule(
    storage,
    host.platform.notificationScheduler,
    Temporal.Now.plainDateTimeISO(),
    Temporal.Now.timeZoneId(),
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- один раз на монтирование хоста, не на каждый рендер
}, []);
```
(Confirm `Temporal.Now.timeZoneId()` — or whatever this codebase's established "current IANA timezone" accessor already is; grep `Temporal.Now.timeZone` across `packages/app/src` first, since native `Intl`/`Date` are forbidden and there may already be a wrapped accessor.)

- [ ] **Step 8: Write a test for the startup reconciliation call**

Add to `packages/app/test/App.test.tsx` (or create if it doesn't exist — check first) a test asserting `notificationScheduler.listScheduled`/`schedule`/`cancel` get called once on mount when the platform has an available scheduler, and NOT called when `Unavailable`.

- [ ] **Step 9: Run full app test suite**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/app test && pnpm --filter @shagi/app typecheck && pnpm --filter @shagi/app lint`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/app/src packages/app/test
git commit -m "feat(app): подключить reconcileReminderSchedule к командам и старту приложения (00§7 шаг 5)"
```

---

### Task A5: Timezone-change detection

**Why:** SPEC §19: "On timezone change app reschedules local reminders preserving 09:00 as local 09:00." Nothing currently detects a timezone change. Detection is comparison-based (persist last-known tz, compare on foreground/resume), not a native OS event listener (none of the three platforms expose one uniformly through `PlatformCapabilitiesRegistry` today, and adding one is out of scope — comparison on resume is sufficient per spec, which only requires correctness "on timezone change," not sub-second reaction).

**Files:**
- Modify: `packages/app/src/App.tsx` (extend the Task A4 Step 7 startup effect, and add a visibility/resume listener if one already exists in this codebase — check `grep -rn "visibilitychange\|onResume\|AppState" packages/app/src apps/mobile/src apps/web/src` first; if nothing exists, a foreground-detection primitive is itself out of scope for THIS plan — fall back to "check on every app startup/cold launch only," documented as a known limitation, not invented from scratch here)
- Modify: wherever app preferences/local-only settings are persisted (find via `grep -rn "localStorage\|preferences" packages/app/src/state` — the existing `shagi.preferences.onboardingDone` key from earlier ADR-0005 work is the established pattern to follow for a new `shagi.preferences.lastKnownTimezone` key)
- Test: extend `packages/app/test/App.test.tsx`

- [ ] **Step 1: Check for an existing foreground/resume signal**

Run: `grep -rn "visibilitychange\|onResume\|AppState\|document.hidden" packages/app/src apps/mobile/src apps/web/src apps/desktop/src`. If nothing exists, proceed with startup-only detection (documented limitation) rather than building a new cross-platform foreground-detection port — that is a separate, larger port addition out of this plan's scope (flag it to the user in the final report as a known gap, do not silently skip the whole task).

- [ ] **Step 2: Write the failing test**

In `packages/app/test/App.test.tsx`, add a test that seeds `localStorage['shagi.preferences.lastKnownTimezone']` to a DIFFERENT value than the fake platform's current `Temporal.Now.timeZoneId()` (or an injected override, if that's how the test harness handles time — check how other tests fake "now"), mounts `<App>`, and asserts a full `reconcileReminderSchedule` call happened (reuse Task A4 Step 8's fake scheduler and assertion shape) AND that `localStorage['shagi.preferences.lastKnownTimezone']` was updated to the current value afterward.

- [ ] **Step 3: Run test, verify it fails**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/app test -- App`

- [ ] **Step 4: Implement in the Task A4 Step 7 startup effect**

Extend it to read/compare/write the persisted timezone before/after the reconciliation call — the reconciliation call itself is unconditional on startup (Task A4 already does this), but this task ensures the STARTUP reconciliation happens with the CURRENT (possibly changed) timezone, and persists it for next time, so a future foreground-detection addition has something to compare against already in place.

- [ ] **Step 5: Run test, verify it passes; typecheck/lint**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/app test -- App && pnpm --filter @shagi/app typecheck && pnpm --filter @shagi/app lint`

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/App.tsx packages/app/test/App.test.tsx
git commit -m "feat(app): пересчёт напоминаний при смене таймзоны на старте (01§19)"
```

---

## Phase B — Native Android layer

### Task B1: ADR — adopt `tauri-plugin-notification`, document the port extension

**Why:** CLAUDE.md requires every architecture deviation to get an ADR in the same change as the implementation. Adopting a third-party plugin after ADR-0005 explicitly rejected one (`@tauri-apps/plugin-sql`) needs the same rigor: prove it by reading the actual source, not by reputation.

**Files:**
- Create: `docs/adr/0007-android-napominaniya-tauri-plugin-notification.md` (confirm next free ADR number via `ls docs/adr/` first — may not be 0007 if something landed since)

**Content the ADR must state, each backed by what this plan's own research already verified (cite file paths inside the plugin's source tree by name, same as ADR-0005 cites `tauri-plugin-sql`'s source):**
- `tauri-plugin-notification` 2.4.0's Android Kotlin (`TauriNotificationManager.kt`) already implements `AlarmManager.setExactAndAllowWhileIdle`/`setExact` with a `canScheduleExactAlarms()` check and graceful degrade (`setExactIfPossible`), `PendingIntent`-based firing via `TimedNotificationPublisher: BroadcastReceiver`, and `BOOT_COMPLETED`/`LOCKED_BOOT_COMPLETED`/`QUICKBOOT_POWERON` restore via `LocalNotificationRestoreReceiver` (its manifest fragment, merged automatically by Android Gradle manifest merging — no manual manifest edits needed for these receivers).
- Gap: it does NOT expose the exact-alarm capability check or the Android 12+ settings-redirect intent (`ACTION_REQUEST_SCHEDULE_EXACT_ALARM`) to JS/Rust — only uses it internally at schedule-time to silently degrade. SPEC §11.1/§3.1 forbid silently presenting inexact as exact — the app must know BEFORE scheduling. This is why Task B3 adds one small local plugin for exactly this.
- The plugin's own notification IDs are 32-bit integers, not UUIDs — Task B4's adapter must map `Reminder.id` (UUID string) to a stable `i32` internally (document the exact hash choice — Task B4 uses a deterministic UUID→i32 via the low 31 bits of a stable hash, never negative, never colliding within practical reminder counts per device).
- `NotificationSchedulerPort.listScheduled` (Task A1) is implemented for Android by calling the plugin's `pending()` (returns `PendingNotification[]` with the same `i32` ids) and mapping back through the same id table.
- Firing-time re-check of task-active status (per `reminder-deadline.ts`'s own documented deferral) happens in the Kotlin receiver, reading the current task state from the pulled SQLite file path — NOT from what was true when `schedule()` was called. Document exactly how (Task B5).

- [ ] **Step 1: Confirm the next ADR number**

Run: `ls docs/adr/`

- [ ] **Step 2: Write the ADR**

Follow the exact structure of `docs/adr/0005-sqlite-driver-port-node-sqlite-i-tauri-plugin-sql.md` (Статус/Дата/Автор header, "Что выяснилось" section with concrete evidence, "Что вместо" section) — this plan's own research (this document's Architecture section, and everything Task B1 states above) is the evidence; cite it the same way ADR-0005 cited `tauri-plugin-sql`'s source line numbers.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/000X-android-napominaniya-tauri-plugin-notification.md
git commit -m "docs(adr): решение — tauri-plugin-notification для Android-напоминаний"
```

---

### Task B2: Add `tauri-plugin-notification` dependency, register, grant capability

**Files:**
- Modify: `apps/mobile/src-tauri/Cargo.toml` (add `tauri-plugin-notification = "2.4.0"` under `[dependencies]`)
- Modify: `apps/mobile/package.json` (add `"@tauri-apps/plugin-notification": "2.4.0"` — pinned exact, matching this repo's ADR-0001 "pin exact versions" convention, no `^`)
- Modify: `apps/mobile/src-tauri/src/lib.rs` (`.plugin(tauri_plugin_notification::init())` alongside the existing `.plugin(tauri_plugin_deep_link::init())`)
- Modify: `apps/mobile/src-tauri/capabilities/default.json` (add `"notification:default"` to the `"permissions"` array)
- Test: `apps/mobile/src-tauri` — `cargo test` (no new Rust logic yet, this task is pure wiring; the test is "does it still compile and do existing tests still pass")

- [ ] **Step 1: Read the exact current contents of all four files**

Run: `cat apps/mobile/src-tauri/Cargo.toml apps/mobile/package.json apps/mobile/src-tauri/src/lib.rs apps/mobile/src-tauri/capabilities/default.json`

- [ ] **Step 2: Add the Rust dependency**

In `Cargo.toml`, add to `[dependencies]` (alongside `rusqlite`, alphabetical if the file is already sorted — check first):
```toml
tauri-plugin-notification = "2.4.0"
```

- [ ] **Step 3: Add the npm dependency**

In `apps/mobile/package.json`, add to `dependencies` (alongside `@tauri-apps/plugin-deep-link`):
```json
"@tauri-apps/plugin-notification": "2.4.0",
```

- [ ] **Step 4: Register the plugin**

In `apps/mobile/src-tauri/src/lib.rs`, add `.plugin(tauri_plugin_notification::init())` in the builder chain, next to `.plugin(tauri_plugin_deep_link::init())`.

- [ ] **Step 5: Grant the capability**

In `apps/mobile/src-tauri/capabilities/default.json`, add `"notification:default"` to the `"permissions"` array (alongside `"deep-link:default"`).

- [ ] **Step 6: Install and verify it builds**

Run: `export PATH=/usr/local/bin:$PATH && pnpm install --frozen-lockfile && cd apps/mobile/src-tauri && cargo check`
Expected: succeeds, `Cargo.lock` gains `tauri-plugin-notification` and its transitive deps (this WILL add new crates to `Cargo.lock` — Security CI's `osv-scanner` (P1 fix from the earlier security-review work) will scan them on the next push; do not add a blanket ignore preemptively, only if a real, verified, unfixable finding shows up, following the exact per-crate verification discipline already established in `.osv-scanner.toml`).

- [ ] **Step 7: Run existing full local verification**

Run: `export PATH=/usr/local/bin:$PATH && pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm format:check && cd apps/mobile/src-tauri && cargo test && cargo clippy`
Expected: all green — this task adds no new logic, so nothing should behaviorally change yet.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src-tauri/Cargo.toml apps/mobile/package.json apps/mobile/src-tauri/src/lib.rs apps/mobile/src-tauri/capabilities/default.json pnpm-lock.yaml apps/mobile/src-tauri/Cargo.lock
git commit -m "build(mobile): подключить tauri-plugin-notification 2.4.0 (ADR-000X)"
```

---

### Task B3: `alarm-capability` local plugin — exact-alarm capability check + settings redirect

**Why:** The one verified gap in Task B2's plugin (see Task B1's ADR). Must be its own small Tauri plugin crate — Tauri's mobile command dispatch (`register_android_plugin`/`run_mobile_plugin`) only exists for plugins built via `tauri_plugin::Builder` + an `android_path`, not for arbitrary code inside the app's own root crate.

**Files:**
- Create: `apps/mobile/src-tauri/plugins/alarm-capability/Cargo.toml`
- Create: `apps/mobile/src-tauri/plugins/alarm-capability/build.rs`
- Create: `apps/mobile/src-tauri/plugins/alarm-capability/src/lib.rs`
- Create: `apps/mobile/src-tauri/plugins/alarm-capability/src/commands.rs`
- Create: `apps/mobile/src-tauri/plugins/alarm-capability/src/mobile.rs`
- Create: `apps/mobile/src-tauri/plugins/alarm-capability/src/desktop.rs` (stub — desktop always "unavailable", this plugin is Android-only, but the crate must compile on desktop CI targets too if any exist; mirror how `tauri-plugin-notification` itself splits `desktop.rs`/`mobile.rs` via `#[cfg(...)]`)
- Create: `apps/mobile/src-tauri/plugins/alarm-capability/android/build.gradle.kts`
- Create: `apps/mobile/src-tauri/plugins/alarm-capability/android/src/main/AndroidManifest.xml`
- Create: `apps/mobile/src-tauri/plugins/alarm-capability/android/src/main/java/ru/cmpas/shagi/alarmcapability/AlarmCapabilityPlugin.kt`
- Modify: `apps/mobile/src-tauri/Cargo.toml` (path dependency on the new local plugin crate)
- Modify: `apps/mobile/src-tauri/src/lib.rs` (register it)
- Test: `apps/mobile/src-tauri/plugins/alarm-capability/src/commands.rs` unit tests (host-testable parts only — the actual `canScheduleExactAlarms()` JNI call is only exercisable on-device/emulator, covered by Task B7's emulator smoke, not here)

**Interfaces:**
- Produces (Rust, callable from `apps/mobile/src/platform.ts` via `invoke`): `alarm_can_schedule_exact() -> Result<bool, String>`, `alarm_open_exact_alarm_settings() -> Result<(), String>`.

- [ ] **Step 1: Scaffold the crate manifest**

`apps/mobile/src-tauri/plugins/alarm-capability/Cargo.toml`:
```toml
[package]
name = "tauri-plugin-alarm-capability"
version = "0.1.0"
edition = "2021"
# Только Android — точный alarm capability check имеет смысл только там
# (00§11.1: Windows/Web не имеют этого механизма вовсе).

[lib]
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-plugin = { version = "2", features = ["build"] }

[dependencies]
tauri = { version = "2" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
```

- [ ] **Step 2: Write `build.rs`**

```rust
const COMMANDS: &[&str] = &["can_schedule_exact", "open_exact_alarm_settings"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .try_build()
        .expect("не собрать tauri-plugin-alarm-capability: см. вывод выше");
}
```

- [ ] **Step 3: Write `src/commands.rs`**

```rust
use tauri::{command, AppHandle, Runtime, State};

use crate::{AlarmCapability, Result};

#[command]
pub(crate) async fn can_schedule_exact<R: Runtime>(
    _app: AppHandle<R>,
    capability: State<'_, AlarmCapability<R>>,
) -> Result<bool> {
    capability.can_schedule_exact()
}

#[command]
pub(crate) async fn open_exact_alarm_settings<R: Runtime>(
    _app: AppHandle<R>,
    capability: State<'_, AlarmCapability<R>>,
) -> Result<()> {
    capability.open_exact_alarm_settings()
}
```

- [ ] **Step 4: Write `src/mobile.rs`**

```rust
use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

const PLUGIN_IDENTIFIER: &str = "ru.cmpas.shagi.alarmcapability";

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<AlarmCapability<R>> {
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "AlarmCapabilityPlugin")?;
    Ok(AlarmCapability(handle))
}

pub struct AlarmCapability<R: Runtime>(PluginHandle<R>);

#[derive(serde::Deserialize)]
struct BoolResponse {
    value: bool,
}

impl<R: Runtime> AlarmCapability<R> {
    pub fn can_schedule_exact(&self) -> crate::Result<bool> {
        self.0
            .run_mobile_plugin::<BoolResponse>("canScheduleExact", ())
            .map(|r| r.value)
            .map_err(Into::into)
    }

    pub fn open_exact_alarm_settings(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<()>("openExactAlarmSettings", ())
            .map_err(Into::into)
    }
}
```

- [ ] **Step 5: Write `src/desktop.rs`**

```rust
use tauri::{AppHandle, Runtime};

pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: tauri::plugin::PluginApi<R, C>,
) -> crate::Result<AlarmCapability<R>> {
    Ok(AlarmCapability(std::marker::PhantomData))
}

pub struct AlarmCapability<R: Runtime>(std::marker::PhantomData<R>);

impl<R: Runtime> AlarmCapability<R> {
    /// Десктоп не имеет этого механизма (`00§11.1`) — всегда `false`, а не
    /// паника: команда должна отвечать, а не быть недостижимой на этой
    /// платформе, раз уж крейт вообще собирается кросс-платформенно.
    pub fn can_schedule_exact(&self) -> crate::Result<bool> {
        Ok(false)
    }

    pub fn open_exact_alarm_settings(&self) -> crate::Result<()> {
        Err(crate::Error::UnsupportedPlatform)
    }
}
```

- [ ] **Step 6: Write `src/lib.rs`**

```rust
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

mod commands;
#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

#[cfg(desktop)]
use desktop::AlarmCapability;
#[cfg(mobile)]
use mobile::AlarmCapability;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
    #[error("SCHEDULE_EXACT_ALARM capability не поддержана на этой платформе")]
    UnsupportedPlatform,
}

impl serde::Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

pub type Result<T> = std::result::Result<T, Error>;

pub trait AlarmCapabilityExt<R: Runtime> {
    fn alarm_capability(&self) -> &AlarmCapability<R>;
}

impl<R: Runtime, T: Manager<R>> AlarmCapabilityExt<R> for T {
    fn alarm_capability(&self) -> &AlarmCapability<R> {
        self.state::<AlarmCapability<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("alarm-capability")
        .invoke_handler(tauri::generate_handler![
            commands::can_schedule_exact,
            commands::open_exact_alarm_settings
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let capability = mobile::init(app, api)?;
            #[cfg(desktop)]
            let capability = desktop::init(app, api)?;
            app.manage(capability);
            Ok(())
        })
        .build()
}
```

- [ ] **Step 7: Write the Android Gradle scaffold**

`apps/mobile/src-tauri/plugins/alarm-capability/android/build.gradle.kts` — copy the structure verified from `@tauri-apps/plugin-notification`'s own `android/build.gradle.kts` (same `com.android.library`/`org.jetbrains.kotlin.android` plugins, same `compileSdk`/`minSdk` — match `apps/mobile/src-tauri/tauri.conf.json`'s `bundle.android.minSdkVersion: 26`, NOT the notification plugin's own `minSdk = 24` — use this app's actual floor):
```kotlin
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ru.cmpas.shagi.alarmcapability"
    compileSdk = 36

    defaultConfig {
        minSdk = 26
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.9.0")
    implementation(project(":tauri-android"))
}
```
Also create an empty `apps/mobile/src-tauri/plugins/alarm-capability/android/consumer-rules.pro` (touch an empty file — matches the notification plugin's own scaffold) and `apps/mobile/src-tauri/plugins/alarm-capability/android/.gitignore` with `build/` (standard Gradle build-output ignore, same as any Android module).

- [ ] **Step 8: Write the plugin's own `AndroidManifest.xml`**

`apps/mobile/src-tauri/plugins/alarm-capability/android/src/main/AndroidManifest.xml`:
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- SCHEDULE_EXACT_ALARM объявлен в apps/mobile/android-permissions.txt
         и патчится в манифест приложения отдельным CI-шагом (android-release-gate.mjs)
         — здесь НЕ дублируется, чтобы не разойтись с единственным источником истины. -->
</manifest>
```

- [ ] **Step 9: Write the Kotlin plugin class**

`apps/mobile/src-tauri/plugins/alarm-capability/android/src/main/java/ru/cmpas/shagi/alarmcapability/AlarmCapabilityPlugin.kt`:
```kotlin
package ru.cmpas.shagi.alarmcapability

import android.app.Activity
import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * Единственная задача этого плагина: то, чего нет в tauri-plugin-notification
 * (ADR-000X) — узнать ДО планирования, доступен ли точный alarm
 * (`canScheduleExactAlarms()`, Android 12+/API 31+), и открыть системные
 * настройки, если нет (`ACTION_REQUEST_SCHEDULE_EXACT_ALARM`).
 * На API < 31 точные alarm разрешены безусловно — SCHEDULE_EXACT_ALARM
 * появился именно в 31 (`05§3.1`).
 */
@TauriPlugin
class AlarmCapabilityPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun canScheduleExact(invoke: Invoke) {
        val result = JSObject()
        result.put("value", canScheduleExactInternal())
        invoke.resolve(result)
    }

    @Command
    fun openExactAlarmSettings(invoke: Invoke) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                data = Uri.fromParts("package", activity.packageName, null)
            }
            activity.startActivity(intent)
        }
        invoke.resolve()
    }

    private fun canScheduleExactInternal(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val alarmManager = activity.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return alarmManager.canScheduleExactAlarms()
    }
}
```

- [ ] **Step 10: Wire the local plugin into the app crate**

In `apps/mobile/src-tauri/Cargo.toml`, add:
```toml
tauri-plugin-alarm-capability = { path = "plugins/alarm-capability" }
```
In `apps/mobile/src-tauri/src/lib.rs`, add `.plugin(tauri_plugin_alarm_capability::init())`.

- [ ] **Step 11: Verify it compiles on host (Rust side only — Kotlin is CI/emulator-only, no Android SDK here per `?22`)**

Run: `export PATH=/usr/local/bin:$PATH && cd apps/mobile/src-tauri && cargo check`
Expected: succeeds for the `desktop.rs` cfg path at minimum (this sandbox has no `mobile` cfg target configured — `cargo check` without `--target aarch64-linux-android` compiles the desktop branch; full Android compilation including the Kotlin is verified by CI's existing "APK" job, which already has the Android SDK/NDK per `build-android.yml`).

- [ ] **Step 12: Commit**

```bash
git add apps/mobile/src-tauri/plugins/alarm-capability apps/mobile/src-tauri/Cargo.toml apps/mobile/src-tauri/Cargo.lock apps/mobile/src-tauri/src/lib.rs
git commit -m "feat(mobile): tauri-plugin-alarm-capability — canScheduleExactAlarms()+настройки (05§3.1)"
```

---

### Task B4: TS adapter — implement `NotificationSchedulerPort` for Android

**Files:**
- Create: `apps/mobile/src/notification-bridge.ts`
- Modify: `apps/mobile/src/platform.ts` (replace the `Unavailable` stub for `notificationScheduler`)
- Modify: `apps/mobile/package.json` if any new transitive TS types are needed (unlikely — `@tauri-apps/plugin-notification`'s guest-js is already a dependency from Task B2)
- Test: `apps/mobile/test/notification-bridge.test.ts` (mock `invoke`/the plugin's guest-js functions, same pattern as any existing mobile bridge test — check `apps/mobile/test/sqlite-bridge.test.ts` if it exists for the established mocking convention)

**Interfaces:**
- Consumes: `@tauri-apps/plugin-notification`'s `sendNotification`/`cancel`/`pending`/`requestPermission`/`isPermissionGranted` (guest-js, Task B2), `invoke('plugin:alarm-capability|can_schedule_exact')`/`invoke('plugin:alarm-capability|open_exact_alarm_settings')` (Task B3 — confirm the exact Tauri-generated invoke command name format, likely `plugin:alarm-capability|can_schedule_exact`, by reading how `@tauri-apps/plugin-deep-link`'s guest-js calls its own commands, e.g. `apps/mobile/node_modules/@tauri-apps/plugin-deep-link/dist-js/index.js` after `pnpm install`, for the exact naming convention this Tauri version uses).
- Produces: `createNotificationBridge(): NotificationSchedulerPort`.

- [ ] **Step 1: Confirm the exact plugin command invocation names**

Run (after Task B2/B3's `pnpm install`): `cat apps/mobile/node_modules/@tauri-apps/plugin-notification/dist-js/index.js | grep -n "invoke("` and the same for the deep-link plugin, to get the literal `invoke('plugin:xyz|command', ...)` string format this Tauri version generates.

- [ ] **Step 2: Write the failing test**

```ts
// apps/mobile/test/notification-bridge.test.ts
import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-notification', () => ({
  sendNotification: vi.fn(),
  cancel: vi.fn(),
  pending: vi.fn().mockResolvedValue([]),
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue('granted'),
}));

import { invoke } from '@tauri-apps/api/core';
import * as plugin from '@tauri-apps/plugin-notification';
import { createNotificationBridge } from '../src/notification-bridge.js';

describe('createNotificationBridge', () => {
  it('schedule запрашивает разрешение just-in-time и планирует через плагин', async () => {
    const bridge = createNotificationBridge();
    await bridge.schedule(
      'reminder-1',
      'Напомнить',
      Temporal.PlainDate.from('2099-01-01'),
      Temporal.PlainTime.from('09:00:00'),
      'Europe/Moscow',
    );
    expect(plugin.requestPermission).toHaveBeenCalled();
    expect(plugin.sendNotification).toHaveBeenCalled();
  });

  it('cancel вызывает плагин с числовым id, стабильно выведенным из строкового', async () => {
    const bridge = createNotificationBridge();
    await bridge.cancel('reminder-1');
    expect(plugin.cancel).toHaveBeenCalledWith([expect.any(Number)]);
  });

  it('listScheduled переводит pending() обратно в исходные строковые id', async () => {
    vi.mocked(plugin.pending).mockResolvedValueOnce([{ id: 123 } as never]);
    const bridge = createNotificationBridge();
    // расписать сначала, чтобы таблица id была заполнена — реализация
    // обязана помнить обратное отображение int32 → исходный string id
    await bridge.schedule(
      'reminder-1',
      'Напомнить',
      Temporal.PlainDate.from('2099-01-01'),
      null,
      'UTC',
    );
    const idMap = vi.mocked(plugin.sendNotification).mock.calls[0][0] as { id: number };
    vi.mocked(plugin.pending).mockResolvedValueOnce([{ id: idMap.id } as never]);
    expect(await bridge.listScheduled()).toEqual(['reminder-1']);
  });

  it('getSchedulingCapability спрашивает нативный canScheduleExact', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ value: true });
    const bridge = createNotificationBridge();
    expect(await bridge.getSchedulingCapability()).toBe('exact');
  });

  it('getSchedulingCapability возвращает inexact, если canScheduleExact лжёт false', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ value: false });
    const bridge = createNotificationBridge();
    expect(await bridge.getSchedulingCapability()).toBe('inexact');
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/mobile test -- notification-bridge`

- [ ] **Step 4: Implement**

```ts
// apps/mobile/src/notification-bridge.ts
/**
 * Реализация `NotificationSchedulerPort` (`@shagi/platform`) поверх
 * `tauri-plugin-notification` (доставка/AlarmManager/boot-restore, ADR-000X)
 * и локального `tauri-plugin-alarm-capability` (единственное, чего нет в
 * официальном плагине — capability-проверка ДО планирования, `05§3.1`).
 *
 * Здесь НЕТ ни одного знания о задачах/метках/domain — только перевод
 * между `NotificationSchedulerPort`'s строковыми id/Temporal-значениями и
 * тем, что ждут два нативных моста (SPEC/00 §3 — в apps/* нет
 * бизнес-логики).
 */
import { invoke } from '@tauri-apps/api/core';
import {
  cancel as pluginCancel,
  isPermissionGranted,
  pending as pluginPending,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import type { NotificationPrecision, NotificationSchedulerPort } from '@shagi/app';
import type { Temporal } from '@js-temporal/polyfill';

/**
 * `tauri-plugin-notification` требует 32-битный id, `Reminder.id` — UUID.
 * Хэш детерминированный и однонаправленный: reconciliation (`02§14`)
 * сравнивает id туда-обратно только в пределах одного запуска процесса —
 * таблица `idByReminderId` ниже держит связь, а `reminderIdById` даёт
 * обратный путь для `listScheduled()`. FNV-1a (32-бит, простая, без
 * зависимостей) обрезается до 31 бита (`& 0x7fffffff`), чтобы гарантированно
 * остаться положительным — `tauri-plugin-notification` трактует id как Int.
 */
function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & 0x7fffffff;
}

export function createNotificationBridge(): NotificationSchedulerPort {
  const idByReminderId = new Map<string, number>();
  const reminderIdById = new Map<number, string>();

  function nativeId(reminderId: string): number {
    const existing = idByReminderId.get(reminderId);
    if (existing !== undefined) return existing;
    const id = fnv1a32(reminderId);
    idByReminderId.set(reminderId, id);
    reminderIdById.set(id, reminderId);
    return id;
  }

  return {
    async schedule(
      id: string,
      title: string,
      date: Temporal.PlainDate,
      time: Temporal.PlainTime | null,
      _timezone: string,
    ): Promise<void> {
      const granted = await isPermissionGranted();
      if (!granted) {
        const state = await requestPermission();
        if (state !== 'granted') return; // ST10 — молча не планировать без разрешения, экран сам сообщает об отказе
      }
      const plainDateTime =
        time === null
          ? date.toPlainDateTime({ hour: 9, minute: 0 })
          : date.toPlainDateTime(time);
      const jsDate = new Date(
        plainDateTime.year,
        plainDateTime.month - 1,
        plainDateTime.day,
        plainDateTime.hour,
        plainDateTime.minute,
        plainDateTime.second,
      );
      await sendNotification({
        id: nativeId(id),
        title,
        schedule: { at: jsDate, repeating: false, allowWhileIdle: true },
      });
    },

    async cancel(id: string): Promise<void> {
      await pluginCancel([nativeId(id)]);
    },

    async listScheduled(): Promise<readonly string[]> {
      const scheduled = await pluginPending();
      const result: string[] = [];
      for (const entry of scheduled) {
        const reminderId = reminderIdById.get(entry.id);
        if (reminderId !== undefined) result.push(reminderId);
      }
      return result;
    },

    async getSchedulingCapability(): Promise<NotificationPrecision> {
      const response = await invoke<{ value: boolean }>(
        'plugin:alarm-capability|can_schedule_exact',
      );
      return response.value ? 'exact' : 'inexact';
    },
  };
}
```
(Confirm the literal `invoke('plugin:alarm-capability|can_schedule_exact')` string against Step 1's finding before committing — this plan's guess follows the pattern seen in every other Tauri 2 plugin, but verify against this exact version.)

- [ ] **Step 5: Wire into `platform.ts`**

Replace the `notificationScheduler: unavailable(...)` stub in `apps/mobile/src/platform.ts` with `notificationScheduler: createNotificationBridge()`, and add the import.

- [ ] **Step 6: Run tests, verify green; typecheck/lint**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/mobile test && pnpm --filter @shagi/mobile typecheck && pnpm --filter @shagi/mobile lint`

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/notification-bridge.ts apps/mobile/src/platform.ts apps/mobile/test/notification-bridge.test.ts
git commit -m "feat(mobile): NotificationSchedulerPort через tauri-plugin-notification + alarm-capability"
```

---

### Task B5: Firing-time active-task re-check (deadline reminders)

**Why:** `reminder-deadline.ts`'s own doc comment (verified in research) explicitly defers the "+15 min **if active**" check to delivery time. `tauri-plugin-notification`'s `TimedNotificationPublisher` fires with whatever title/body were captured at `schedule()` time — it has no concept of "check SQLite before showing." Scope item 5 ("создание/обновление/отмена reminder") and the deadline-missed/approaching semantics require this.

**Files:**
- Modify: `apps/mobile/src-tauri/plugins/alarm-capability/` — reconsider: this check needs DB access (SQLite), which lives in the MAIN app crate (`sqlite.rs`), not the small capability plugin. Two viable designs, pick one and document the choice in this task's own commit message (do not silently default):
  - **(a)** Extend `tauri-plugin-notification`'s own `notify` call to happen from Rust (not directly from TS `sendNotification`) — Rust reads SQLite via the existing `sqlite.rs` bridge synchronously before calling the plugin's Rust API (`Notification::builder()...show()` — but this only fires immediately, not on a schedule, so it doesn't fit a scheduled alarm firing later while the app is closed).
  - **(b)** Accept that `tauri-plugin-notification`'s own scheduled firing (via its `TimedNotificationPublisher`, which runs even with the app fully closed) shows the notification with the STALE title/body captured at schedule time, and instead rely on `enabled:false` + reconciliation's `cancel()` (Task A3/A4) to remove the alarm the MOMENT a task completes/is deleted — since reconciliation is called synchronously right after `completeTaskCommand`/`deleteTaskCommand` (Task A4), the alarm is normally cancelled well before it would fire. The residual risk is narrow: task completed by a DIFFERENT device (sync, out of R1 scope — no backend yet) or completed while this device was fully powered off with the alarm still pending — in both cases the notification fires with stale content once, which is a materially different (much smaller) risk than a full replay storm, and matches this repo's already-documented pattern of deferring the check rather than guaranteeing DB access from inside a `BroadcastReceiver` with no async runtime.
  - **This plan picks (b)**: no on-device sync exists yet (backend is wave 2, per CLAUDE.md), so "a different device completed the task" cannot happen in R1 at all — the only residual case is "phone was off past the fire time," which is already the correct, spec-compliant "deliver while main UI closed" behavior (SPEC §18), just possibly a few minutes stale if the task was ALSO completed in that same offline window, which is an edge case not covered by any Testing Acceptance item — do not over-engineer a Kotlin→SQLite JNI bridge for it now. Document this explicitly as a known, accepted, narrow limitation in the ADR from Task B1 (add a short "Аддендум" section, do not silently leave it unstated).
- Modify: `docs/adr/000X-android-napominaniya-tauri-plugin-notification.md` (add the addendum described above)

- [ ] **Step 1: Add the addendum to the Task B1 ADR**

Append a dated addendum section explaining the (a)/(b) tradeoff above verbatim, and the decision, referencing `reminder-deadline.ts`'s own deferral comment by file/line.

- [ ] **Step 2: Confirm Task A4's cancellation IS synchronous and fires before any plausible alarm delay**

No new code — re-read Task A4's implementation once complete and confirm `reconcileReminderScheduleForTask` is `await`-ed (not fire-and-forget) in `completeTaskCommand`/`deleteTaskCommand` call sites, so the cancel() call to the native layer has actually round-tripped through Tauri IPC before the UI considers the action done. If any call site made it fire-and-forget for UI responsiveness, flag this specifically — a fire-and-forget cancel racing a same-second alarm fire is the one case this task's chosen design does NOT cover, and must be called out to the user rather than silently accepted.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/000X-android-napominaniya-tauri-plugin-notification.md
git commit -m "docs(adr): аддендум — firing-time active-check полагается на синхронную отмену (Task A4), не на Kotlin→SQLite"
```

---

### Task B6: Just-in-time permission UI (ST10) + exact-alarm capability notice

**Why:** SPEC §18/§11.1 forbid asking permission at first launch; Screen State Matrix names `ST10 notification permission` and "Android exact-alarm capability notice" as approved edge states needing DS treatment, not ad-hoc UI.

**Files:**
- Modify: `packages/app/src/screens/TaskDetail.tsx` (the reminder creation flow — after Task A4's `reconcileReminderScheduleForTask` call, if `getSchedulingCapability()` returns `'inexact'`, show the disclosure)
- Modify: `packages/i18n` catalog (`ru-RU` — add the exact strings; check `check-i18n-catalog.mjs` gate requirements first, every key used must exist)
- Test: extend `packages/app/test/screens/TaskDetail.test.tsx`

**Copy (Russian, adult/calm tone per CLAUDE.md — exact wording is a product decision; this plan gives placeholder-free but reviewable draft text, the implementer should treat the literal wording as a proposal, not gospel, and can request final copy sign-off if unsure — this is the one place where "no placeholders" means "real, usable text," not "text nobody may ever revise"):**
- Capability notice (Android, `inexact`): `«Точное время сейчас недоступно — Android ограничивает его для этого приложения. Открыть настройки?»` with a button that calls `platform.notificationScheduler`-adjacent settings-open (need to also expose `openExactAlarmSettings` through the port or call it directly via the mobile-only bridge — since `NotificationSchedulerPort` is platform-neutral and other platforms have no equivalent settings screen, add this as an EXTRA method only mobile's concrete type has, invoked via a capability-specific escape hatch already established elsewhere in this codebase for platform-specific extras — check `grep -rn "platform-specific\|as unknown as" packages/app/src` for the precedent before inventing a new one).

- [ ] **Step 1: Find the established pattern for platform-specific extras beyond the generic port**

Run: `grep -rn "isAvailable(platform\." packages/app/src/screens/*.tsx | head -20` to see how other screens already handle "this capability might not exist" — follow the exact same conditional-render idiom.

- [ ] **Step 2: Write the failing test**

In `TaskDetail.test.tsx`, add a test with a fake scheduler whose `getSchedulingCapability` resolves `'inexact'`, asserting the disclosure text renders after creating a reminder.

- [ ] **Step 3: Add the i18n keys**

Run `node scripts/check-i18n-catalog.mjs` first (baseline), then add the new keys to the `ru-RU` catalog under a `reminders`/`taskDetail` namespace matching this file's existing key convention (check `t('quickAdd', ...)` usage elsewhere for the exact `t(namespace, key)` call shape already used in `TaskDetail.tsx`).

- [ ] **Step 4: Implement the disclosure UI**

Conditionally render the notice + settings button after a successful reminder creation, using the capability value already available from Task A4's wiring (call `getSchedulingCapability()` once when the reminder editor opens, not on every keystroke).

- [ ] **Step 5: Run tests, i18n gate, typecheck, lint**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/app test -- TaskDetail && node scripts/check-i18n-catalog.mjs && pnpm --filter @shagi/app typecheck && pnpm --filter @shagi/app lint`

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/screens/TaskDetail.tsx packages/i18n packages/app/test/screens/TaskDetail.test.tsx
git commit -m "feat(app): ST10 just-in-time permission + уведомление о неточном alarm (01§18, 00§11.1)"
```

---

### Task B7: CI — permission recheck already covers this; add Rust native tests for the two new crates

**Why:** `apps/mobile/src-tauri`'s existing CI step "Тесты Rust-части оболочки" (`build-android.yml`) already runs `cargo test` for the whole workspace including path-dependency crates — no new CI job needed, only new `#[cfg(test)]` coverage inside the two crates from Task B3, matching the rigor `sqlite.rs` already established (host-testable pure logic, real assertions, not mocks-all-the-way-down).

**Files:**
- Modify: `apps/mobile/src-tauri/plugins/alarm-capability/src/desktop.rs` (add `#[cfg(test)] mod tests` — the `can_schedule_exact() == Ok(false)` desktop behavior IS host-testable, unlike the Kotlin path)

- [ ] **Step 1: Write the failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_vsegda_otvechaet_false_a_ne_panikuet() {
        // Прямая конструкция AlarmCapability(PhantomData) — desktop::init
        // требует Tauri AppHandle/PluginApi, которых в юнит-тесте нет;
        // тестируем то, что реально тестируемо без рантайма (та же граница,
        // что sqlite.rs проводит между командой и чистой функцией под ней).
        let capability: AlarmCapability<tauri::test::MockRuntime> =
            AlarmCapability(std::marker::PhantomData);
        assert_eq!(capability.can_schedule_exact().unwrap(), false);
    }
}
```
(Confirm `tauri::test::MockRuntime` is the right type — check whether `tauri` needs a `test` feature flag added to `[dev-dependencies]` in this new crate's `Cargo.toml`, mirroring how the main `shagi-mobile` crate's own tests are set up, if it does anything similar — grep `apps/mobile/src-tauri/Cargo.toml` for `[dev-dependencies]`.)

- [ ] **Step 2: Run, verify it passes (or adjust the mock-runtime approach per Step 1's finding)**

Run: `export PATH=/usr/local/bin:$PATH && cd apps/mobile/src-tauri && cargo test -p tauri-plugin-alarm-capability`

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src-tauri/plugins/alarm-capability/src/desktop.rs apps/mobile/src-tauri/plugins/alarm-capability/Cargo.toml
git commit -m "test(mobile): юнит-тест desktop-заглушки alarm-capability"
```

---

### Task B8: Emulator smoke — extend `android-smoke.mjs`

**Why:** Everything above is real but unverified end-to-end until it runs on an actual Android emulator with a real `AlarmManager`. This is the acceptance gate the user explicitly asked for.

**Files:**
- Modify: `apps/mobile/scripts/android-smoke.mjs`
- Modify: `apps/mobile/scripts/page-actions.mjs` (any new UI-reading expressions the reminder flow needs — reuse `READ_APP_TEXT`/`READ_TASK_ROW_TITLES` where possible before adding new ones)
- Modify: `apps/mobile/scripts/verify-page-actions.mjs` (mirror any new page-action expression against the web build first, per this repo's own established convention — catches selector bugs in seconds instead of a 10-minute emulator cycle)

**What "real alarm exists in Android" means operationally** (for the implementer): `adb shell dumpsys alarm` lists every registered `AlarmManagerService` alarm with its package and trigger time — grep its output for `ru.cmpas.shagi` to prove a real OS-level alarm exists, not just a `Reminder` row in SQLite. This is the concrete mechanism behind every "существует/отменён" assertion below.

- [ ] **Step 1: Add a `dumpsys alarm` helper**

In `android-smoke.mjs`, add a function analogous to the existing `pullDatabase`/`inspectDatabase` pair:
```js
function listSystemAlarms() {
  const output = adb(['shell', 'dumpsys', 'alarm'], { encoding: 'utf8' });
  const lines = output.split('\n').filter((line) => line.includes(APPLICATION_ID));
  return lines;
}
```

- [ ] **Step 2: Extend the scenario — reminder scheduled**

After the existing "Проверка сборки" task creation step, add: open the task, set an explicit reminder for a near-future time via the UI (reuse `typeIntoLabeled`/`clickByText` per the established page-action pattern), assert via `inspectDatabase` (extend it, per the existing `count('reminders')` pattern already used for other tables) that a `reminders` row exists with `enabled=1`, THEN assert `listSystemAlarms().length > 0` — a real OS alarm, not just a DB row.

- [ ] **Step 3: Extend the scenario — update replaces the old alarm**

Change the reminder's time via the UI, capture `listSystemAlarms()` before/after, assert the trigger time in the dump changed (parse the printed trigger timestamp from the `dumpsys alarm` line — its exact text format must be read from a real run's output first, do not guess the regex blind) and the count of matching alarms for `ru.cmpas.shagi` did NOT grow (proving replace, not accumulate).

- [ ] **Step 4: Extend the scenario — delete cancels the alarm**

Cancel/delete the reminder via UI, assert `listSystemAlarms()` no longer contains it.

- [ ] **Step 5: Extend the scenario — force-stop does not remove the OS alarm**

Immediately after scheduling (before force-stop, reusing the existing force-stop step later in the script), assert `listSystemAlarms()` still shows the alarm right after `am force-stop` (AlarmManager entries survive process death by design — this assertion is the whole point of using AlarmManager over an in-process timer).

- [ ] **Step 6: Extend the scenario — reboot reconciliation**

`adb reboot` is too slow/flaky for a CI smoke test (full device reboot can take minutes and the existing smoke budget is ~10 minutes total) — instead, simulate the boot-completed broadcast directly, which is the actual mechanism both `tauri-plugin-notification`'s own restore receiver AND this app's reconciliation startup call (Task A4 Step 7) respond to:
```js
adb(['shell', 'am', 'broadcast', '-a', 'android.intent.action.BOOT_COMPLETED', '-p', APPLICATION_ID]);
```
Then relaunch the app (already an existing step later in the script) and assert `listSystemAlarms()` still/again shows the expected alarm, and `inspectDatabase()`'s reminder count is unchanged (reconciliation restored state, didn't duplicate or lose it).

- [ ] **Step 7: Extend the scenario — overdue reminder does not storm**

Create a reminder with a time already in the past relative to device time (or force-advance device time via `adb shell date` if the emulator image allows it — check feasibility first; if not settable, seed a reminder whose `firesAt` is in the past directly via a debug-only path is NOT available in production code, so instead: rely on Task A3's own unit test for this exact case — full storm-prevention coverage lives in `reminder-reconciliation.test.ts`, Step 3's third test case — and on the emulator only assert that triggering `BOOT_COMPLETED`/app-restart reconciliation does NOT create a burst of `listSystemAlarms()` entries beyond what's expected from the smoke's own seeded reminders). Document in a comment why this step is narrower than the unit test coverage, not a gap — the unit test is the actual proof, the emulator step is a sanity check that the wiring doesn't visibly misbehave.

- [ ] **Step 8: Extend the M52 section**

After the existing M52 wipe assertions (Task from the ADR-0005 work — `tasks:0, tombstones:0, labels:0, taskLabels:0, recurrenceSeries:0, outbox:0`), add `reminders:0` to the same zero-count assertion list (extend `inspectDatabase`'s returned object with a `reminders: count('reminders')` field first, mirroring the existing `labels`/`taskLabels` pattern), AND assert `listSystemAlarms()` is empty for `ru.cmpas.shagi` after the wipe — this is the "M52 удаляет alarms" requirement. This means `eraseAllLocalData` alone is NOT sufficient (it only clears the DB) — the M52 UI flow (`packages/app`'s "Удалить всё" handler) must ALSO call `scheduler.cancel()` for every reminder BEFORE/AFTER the DB wipe. Add that call (find the M52 handler via `grep -rn "eraseAllLocalData" packages/app/src`) as part of THIS task, with its own unit test in whichever screen/state file owns that handler, before touching the emulator script.

- [ ] **Step 9: Extend the "usable after wipe" scenario**

After M52, create a NEW reminder via the UI (same pattern as the existing "creates a new task after wipe" check), assert it produces both a new `reminders` row AND a new `listSystemAlarms()` entry — "scheduler снова пригоден для работы" made concrete.

- [ ] **Step 10: Run `verify-page-actions.mjs` against the web build first**

Run: `export PATH=/usr/local/bin:$PATH && pnpm --filter @shagi/web build && (pnpm --filter @shagi/web preview --host 127.0.0.1 --port 4320 &) && sleep 2 && node apps/mobile/scripts/verify-page-actions.mjs http://127.0.0.1:4320/`
Expected: every new page-action expression this task added passes on the web build, catching selector bugs before spending an emulator cycle — note that `dumpsys alarm`/system-alarm assertions have NO web equivalent (only exercised on the real emulator step, not this script) — that's expected, not a gap.

- [ ] **Step 11: Trigger the real Android workflow and read the results**

This step cannot run in this sandbox (no Android SDK/emulator, per `?22`) — push the branch and read the `Сборка Android` workflow run's `Дымовой тест на эмуляторе` job logs via the GitHub MCP tools, the same way every prior Android verification in this session was done. Do not claim success without reading the actual run's log output.

- [ ] **Step 12: Commit**

```bash
git add apps/mobile/scripts/android-smoke.mjs apps/mobile/scripts/page-actions.mjs apps/mobile/scripts/verify-page-actions.mjs packages/app/src
git commit -m "test(mobile): emulator smoke — реальный dumpsys alarm на каждом сценарии напоминаний, M52 отменяет alarms"
```

---

## Self-Review

**1. Spec coverage** — checked against the user's 15-item scope list:
1. Runtime `POST_NOTIFICATIONS` — Task B4 (`isPermissionGranted`/`requestPermission` via the official plugin, just-in-time per Task B6).
2. `SCHEDULE_EXACT_ALARM` — already reserved (`?28`), used by Task B3/B2's plugin internally; not re-litigated.
3. `canScheduleExactAlarms()` check — Task B3 (`alarm-capability` plugin), surfaced via Task B4's `getSchedulingCapability`.
4. Exact scheduling via native mechanism — Task B2 (`tauri-plugin-notification`'s verified `AlarmManager` usage).
5. Create/update/cancel reminder — Task A4 (call sites) + Task B4 (adapter); update = cancel+reschedule via Task A3's fingerprint diff.
6. Устойчивый dedupe — Task A2 (fingerprint) + Task A3 (idempotent reconciliation, third test case).
7. Пересчёт при смене timezone — Task A5.
8. Корректный reschedule — Task A3's fourth test case + Task B8 Step 3.
9. `RECEIVE_BOOT_COMPLETED` + reconciliation — already reserved permission; native restore via Task B2's plugin; app-level reconciliation via Task A4 Step 7, verified on-device by Task B8 Step 6.
10. No replay storm for overdue — Task A3's `applyReconciliation` (skips past `firesAt`), tested in Task A3 Step 3/Task B8 Step 7.
11. Recurring tasks schedule only next occurrence, not backlog — already true by construction: `createRecurringTaskCommand` only ever materializes ONE occurrence Task at a time (per ADR-0005-era research, `nextOccurrenceSeq` tracks the NEXT ungenerated one) — this plan's reconciliation only ever sees the one materialized Task's reminder, never a backlog, so no extra code needed; flagged here so the user sees it was checked, not skipped silently.
12. Task change/delete cancels or rebuilds alarms — Task A4 (all call sites), Task A3 (reconciliation logic itself).
13. M52 cancels all native notifications — Task B8 Step 8.
14. Force-stop doesn't kill the alarm — Task B8 Step 5 (this is AlarmManager's own guarantee, verified not re-implemented).
15. Restart reconciles DB + system scheduler — Task A4 Step 7 (app-level) + Task B2's plugin (native restore) + Task B8 Step 6 (verified together).

Test layers requested: pure/domain tests (Tasks A2/A3), Android native tests (Task B7 + the host-testable parts of B3), integration adapter↔SQLite↔native-scheduler tests (Task A3's reconciliation tests run against `createInMemoryStorage`; a SQLite-backed variant should be added mirroring the `erase-all-local-data-native.test.ts` pattern from the ADR-0005 work — **gap**, add as Task A3 Step 6b: a `packages/storage`-level or `packages/app`-level test running `reconcileReminderSchedule` against `openNativeSqliteStorage`+the fake native bridge, not just in-memory storage, before calling Task A3 done), emulator smoke (Task B8).

**2. Placeholder scan** — `desiredReminders` in Task A3 Step 5 is an intentional, explicitly-flagged scaffold (per the note directly under it) completed in Step 6 using Step 1's research findings — this is the one deliberate exception, not an oversight. Task B6's copy is flagged as a reviewable draft, not final, per its own note. No other TBD/"add appropriate"/"similar to Task N" patterns found on re-scan.

**3. Type consistency** — `NotificationSchedulerPort.listScheduled` (Task A1) is used identically in Task A3 (`scheduler.listScheduled()`), Task B4 (implements it), and Task B8 (verifies its Android-side effect). `computeReminderFingerprint` (Task A2) signature matches its one call site pattern (object literal matching `Pick<Reminder, 'kind'|'localRuleJson'|'enabled'>`) in Task A3's `desiredReminders` scaffold note. `reconcileReminderScheduleForTask`/`reconcileReminderSchedule` signatures match between Task A3 (definition) and Task A4 (call sites) and Task A5 (startup usage).
