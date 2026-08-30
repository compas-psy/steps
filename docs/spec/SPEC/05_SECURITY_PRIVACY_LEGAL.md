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
