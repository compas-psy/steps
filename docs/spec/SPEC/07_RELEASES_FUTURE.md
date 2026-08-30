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
