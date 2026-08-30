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
