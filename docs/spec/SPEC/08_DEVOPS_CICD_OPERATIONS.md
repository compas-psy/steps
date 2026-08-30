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
