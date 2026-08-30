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
