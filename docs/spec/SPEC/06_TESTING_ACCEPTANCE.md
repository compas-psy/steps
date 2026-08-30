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
