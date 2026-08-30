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
