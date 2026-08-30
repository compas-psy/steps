# ШАГИ — PRODUCTION UI / DESIGN SYSTEM

Основание: `source/R1_DESIGN_HANDOFF_v2.html` + `source/VECTOR_CJM_HANDOFF_v2.html` + bundled SIMPAS DS snapshot.

---

## 1. Что является source of truth

Production:
- SHAGI palette/tokens;
- typography hierarchy;
- spacing/radii/shadows;
- SHAGI ServiceMark;
- shown app layouts/states;
- mobile bottom navigation;
- desktop sidebar/list/inspector pattern;
- approved copy semantics;
- dark mode values;
- demonstrated interaction intent.

Not production:
- showcase sticky header/navigation;
- Light/Dark/Бумага/Графит/Чернила showcase theme switcher as product screen;
- green phone/device border;
- fake `9:41` status bars;
- Claude support runtime;
- `<x-import>`/DCLogic/HTML hierarchy;
- remote Google Fonts import;
- `paper`, `graphite`, `ink` ZAPISKI-family comparator themes;
- external frame labels `[R1][M]...`.

---

## 2. Fonts

- Geist 400/500/600/700 — UI.
- Geist Mono 400/500/600 — time/tabular/technical microcopy.

Fonts self-hosted/packaged. Runtime Google Fonts network dependency prohibited.

Fallback: `-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial`.

---

## 3. Light tokens

```css
--forest-900:#143D2F;
--forest-800:#1D4735;
--forest-700:#285B46;
--forest-600:#2F6A52;
--forest-500:#3B8F5A;
--sage-50:#F6FAF6;
--sage-100:#EEF4EF;
--sage-150:#E7F0EA;
--sage-200:#DDE9E1;
--sage-300:#C7D8CD;
--gold-500:#CC9E50;
--gold-400:#D8AE67;
--ink-900:#142018;
--ink-500:#5F6C64;
--cream:#F7F8F4;
--white:#FFFFFF;
--background:#F7F8F4;
--foreground:#142018;
--card:#FFFFFF;
--muted:#F2F4EF;
--muted-foreground:#5F6C64;
--border:#E4E9E3;
--primary:#1D4735;
--accent:#CC9E50;
--destructive:#E35D4F;
```

ServiceMark:
- bg `#3B8F5A`
- fg `#F7F8F4`.

---

## 4. Dark theme exact baseline

```css
--background:#10221A;
--foreground:#EAF3EC;
--card:#173326;
--card-foreground:#EAF3EC;
--popover:#173326;
--popover-foreground:#EAF3EC;
--muted:#1C3B2C;
--muted-foreground:#9FB3A6;
--secondary:#1C3B2C;
--secondary-foreground:#EAF3EC;
--border:#24452F;
--input:#1C3B2C;
--ring:#D8AE67;
--accent:#D8AE67;
--accent-foreground:#142018;
--primary:#3B8F5A;
--primary-foreground:#0E1E16;
--destructive:#E8695A;
--destructive-foreground:#1A0D0A;
--blue-soft:#12233A;
--blue-500:#6FA8FF;
--violet-soft:#241B3A;
--violet-500:#B39DFF;
--orange-soft:#3A2712;
--orange-500:#FFA75C;
--red-soft:#3A1512;
--red-500:#FF8A7A;
--success-soft:#123422;
--success-500:#5FBE84;
--amber-soft:#332708;
--amber-500:#E8B96A;
--sage-50:#16281F;
--sage-100:#1B3226;
--sage-150:#1F3A2B;
--sage-200:#254433;
--sage-300:#33573F;
```

`System` follows OS. SHAGI production ships System/Light/Dark only. The v2 handoff comparator themes `Бумага / Графит / Чернила` demonstrate ZAPISKI-family styling and are not SHAGI product themes.

---

## 4.1 Semantic state mapping from approved handoff

- Deadline missed → `--red-soft` / `--red-500` + explicit `Просрочен срок`.
- Missed plan → `--orange-soft` / `--orange-500` + explicit `Не по плану`.
- Today Focus → `--gold-500`.
- normal navigation/completion → forest.
- muted/disabled → neutral/sage.

State meaning is never color-only.

### R1 Project marker palette

Controlled tokens only: forest, gold, blue, violet, orange, red, neutral/sage. Marker is a small dot/icon, not a full rainbow surface. Default forest. Labels have no arbitrary color picker in R1.

---

## 5. Typography

- Page title: 40/44 desktop.
- Hero: 24/30.
- Section title: 20/26.
- Body primary: 15/22.
- Body secondary: 14/20.
- Meta: 12/16.
- Caption: 11/14, uppercase, 700, tracking .04em.
- tabular numbers use `font-variant-numeric: tabular-nums`.

Mobile Today heading follows handoff ~22px rather than blindly using desktop page title.

---

## 6. Spacing / radius / shadow

Spacing: 4,8,12,16,20,24,32,40,48.

Radii: 8,12,16,20,24,999.

Touch target >=44×44 logical px.

Shadows:
- xs `0 1px 2px rgba(20,32,24,.04)`
- sm `0 2px 8px rgba(20,32,24,.04)`
- card `0 8px 30px rgba(20,32,24,.06)`
- hover `0 10px 34px rgba(20,32,24,.09)`
- floating `0 14px 34px rgba(20,32,24,.10)`

No harsh shadow/glassmorphism-driven UI.

---

## 7. Motion

150–300ms ease. Completion 150–250ms. No bounce/parallax. Reduced Motion removes translate/scale, preserving instant/fade <=100ms.

Press scale .97 allowed for buttons/cards where useful, not for text inputs/list rows.

---

## 8. Responsive

Breakpoints:
- mobile <600;
- tablet 600–1023;
- desktop >=1024.

Canonical:
- Mobile 390×844;
- validation 360×800, 412×915, 393×852;
- Tablet 834×1194, 1194×834;
- Desktop 1440×1024;
- minimum 1280×800;
- wide 1920×1080.

Mobile outer margin 16.

Desktop:
- sidebar baseline 240, allowed 240–280;
- inspector 360–440;
- list content readable width; no full-1920 stretched task row.

Native window minimum ~980×640; smaller switches compact/single-pane instead of clipping.

---

## 9. Navigation

Mobile bottom nav:
- Сегодня
- План
- center `+`
- Проекты
- Поиск

Inbox entry: Today header badge, Projects row, system shortcut.

Desktop sidebar:
- Сегодня
- План
- Входящие
- Проекты
- Фильтры
- Метки
- Завершённые

Task opens right Inspector desktop; mobile compact sheet → full detail.

---

## 10. Component hierarchy

### Foundations
Colors, type, spacing, radius, elevation, motion, icons, breakpoints.

### Primitives
Button, IconButton, Input, Textarea, Checkbox, Radio, Switch, Chip, Divider, Tooltip, Spinner.

### Navigation
BottomNav, Sidebar, TopBar, SegmentedControl, Tabs, Breadcrumb, CommandPalette.

### Task
TaskCheckbox, TaskRow, TaskMetadata, FocusMarker, TaskDetail, SubtaskRow, ChecklistRow, TaskMenu.

### Planning
DateChip, TimeChip, DurationChip, DeadlineChip, ReminderChip, RecurrenceChip, DatePicker, TimePicker, TemporalConflict, future CalendarTask/Event.

### Organization
ProjectRow, ProjectHeader, Section, BoardColumn/Card, Label, Priority, Filter.

### Capture
QuickAdd, Composer, NLPToken, InheritedContextChip, ParsingPreview, DraftIndicator.

### Overlay
BottomSheet, Modal, SideInspector, Menu, Popover.

### Feedback
Toast, UndoToast, EmptyState, Loading, Error, Offline, SyncState.

### Account/Data
SignIn, OtpInput, SyncStatus, DataPrivacyRow, Entitlement/Paywall.

---

## 11. Component states

Every interactive component where applicable:
Default / Hover / Pressed / Focus / Selected / Disabled / Loading / Error.

Task:
Normal / Focus / MissedPlan / DeadlineSoon / DeadlineMissed / Recurring / Completed / Selected / Dragging.

State never color-only: overdue has text/icon; focus grouping/marker; selected has structural affordance.

---

## 11.1 Additional production components not fully shown in handoff

Use the same Design System for:
- ProjectCreateEditSheet;
- SectionCreateRename;
- ProjectArchive/Delete;
- RestoreContextSheet;
- RecurringSubtaskScopeSheet;
- WebReminderCapabilityNotice;
- AndroidExactAlarmCapabilityNotice;
- LocalWorkspaceStash;
- BackupRestoreModeSheet.

These are required states of approved behavior, not a new visual direction.

---

## 12. Icons

One coherent line family; generic icons may use Lucide-equivalent style:
- 24 viewBox;
- 1.75 stroke;
- currentColor;
- round caps/joins.

Use supplied custom SIMPAS/service icons where applicable. No emoji icon system.

---

## 13. Key handoff screens to reproduce

- Welcome: forest brand hero, ServiceMark, `Начать`, `Войти`, offline promise.
- Sign in: Email/OTP + Yandex + continue local.
- First Task: creates real task.
- Today normal: Focus/Timed/Today/Later hierarchy.
- Today missed/overdue: two clearly distinct sections.
- Quick Add parsed.
- Task Detail simple/full + recurring edit scope.
- Inbox list + Process mode.
- Plan Agenda.
- Project List/Board.
- Data & Privacy.
- notifications/multi-select/undo/context menu/command palette.
- Desktop Today/Board/Settings.

Unshown edge states follow DS and behavioral spec, not visual invention that conflicts with product principles.

---

## 14. Platform adaptation

No fake status bar; use real safe area.

Android Back closes overlay/sheet first, then navigation; root Today follows OS exit behavior.

iOS future swipe-back only on route stack; must not conflict with horizontal Board.

Desktop has hover/keyboard/context menus/inspector. Web supports pointer + keyboard + installable responsive UI.

---

## 15. Accessibility

Release blocker:
- WCAG 2.2 AA Web;
- AA text contrast;
- keyboard complete desktop/web;
- logical focus order;
- modal focus trap/restore;
- icon button accessible names;
- semantic headings/landmarks;
- polite aria-live completion/sync, not noisy reorder announcements;
- drag alternative;
- reduced motion;
- 200% zoom without loss;
- field errors associated programmatically;
- no swipe-only critical action.

---

## 16. Token/string enforcement

CI scans code. Outside token files forbidden:
- literal product hex/rgb/hsl;
- magic radii/shadows unless explicitly component token;
- user-facing literal strings in reusable component implementation.

---

## 16.1 Localization acceptance

- `ru-RU` is complete in R1; missing key is a build/test failure.
- Components accept copy via i18n keys/slots; no literal production copy in reusable primitives.
- Layout validation includes long Russian strings and 200% zoom.

---

## 17. Visual regression

Production components generate canonical screenshots. Key geometry >2px unexpected divergence or token/color mismatch fails review. Font rasterization platform tolerance allowed, metrics/layout must match.

Golden states include handoff states + production-only edge states (temporal conflict, attachment pending, account merge, offline).

---

## 18. Copy, empty states, brand character

Tone: adult, concise, calm, human; no infantilization, hype, corporate jargon or gamification language.

Examples:
- `На сегодня всё.`
- `Входящие разобраны.`
- `Здесь пока нет задач.`
- `Нет соединения. Изменения сохранятся на устройстве.`
- `Перенести на завтра?`

Avoid technical error text and English implementation terminology in Russian UI.

Empty state may use subtle graphic only if it does not compete with CTA. Never add decorative illustration to every empty view.

Brand metaphor «шаг/движение» is expressed via progression/motion/sequence, not literal footprints/stairs everywhere.

---

## 18.1 VECTOR CJM / R3 design contract — design v2

R3 is future scope; these components remain behind release flags and do not appear in R1.

Approved conceptual frames:
- **V01 Composer / Multimodal:** same Composer evolves to tabs `Текст / Голос / Файл`; Voice is not a separate app. `Файл` may accept image/PDF/text document through the future input adapter rather than proliferating tabs.
- **V02 Voice Listening:** visible recording state, live partial transcript, Stop/Готово and Cancel.
- **V03 Live Parsing:** one utterance may split into multiple independent intents and target apps.
- **V04 High:** committed reversible item + Undo.
- **V05 Medium:** compact preview + `Верно / Исправить`.
- **V06 Low:** one minimal clarification.
- **V07 Provenance:** created object shows source `Создано через ВЕКТОР / Голосовой ввод`, timestamp and, where useful, same-capture correlation; there is no audio playback if raw audio was deleted.

### Important production corrections to illustrative mock text

1. The V03 mock button `Сохранить все 3` is **not** a universal batch transaction. Confidence is per-intent. Production batch UI shows each item's state and a CTA such as `Продолжить / Завершить`, while High reversible intents may already be committed. Unresolved Medium/Low items cannot be silently force-saved by one batch button.
2. The CJM example `до пятницы, 5 сент` is illustrative and date-inconsistent for 29.08.2026 (the next Friday is 04.09.2026). Production always renders the parser-resolved exact local date; never hardcode example dates.
3. `Иван П. — 2 контакта` is an illustration of entity ambiguity, **not** a requirement to add Contacts to SHAGI. Use only when the routed target/action has a contact entity.
4. The Android microphone-permission frame is conceptual. Production invokes the real OS permission dialog; it must not render a fake custom system dialog. Optional pre-permission explanation may use SHAGI DS.
5. Fake `9:41`, device chrome and outer frame remain showcase-only.

### Hands-free / eyes-free mode

The CJM persona may be driving. Production must not require a tap to preserve captured content:
- High reversible intent → audio/haptic acknowledgement + Undo available later;
- Medium → short voice confirmation when voice interaction is permitted, otherwise queue for later review;
- Low → one spoken clarification when permitted, otherwise queue for later review;
- no multi-field visual form while in screenless/lock-screen/watch mode;
- user can finish capture and continue the current activity without looking at the screen.

### Deferred Review surface

Vector does not become a fifth bottom-nav destination. Unresolved voice intents are surfaced as:
- post-capture sheet/badge in the invoking Composer;
- optional `Нужно разобрать` entry in Settings/Data & Privacy while items exist;
- deep-link notification when safe/allowed.

The queue shows minimal transcript snippet + target/action candidate, expiry and `Исправить / Удалить`. No audio playback.

### Screenless acknowledgement

Default screenless feedback is generic and privacy-safe (`Готово`, `Нужно уточнить позже`) through haptic/short tone/TTS as platform allows. Do not speak task/client/note content aloud by default from lock screen/watch.

### Vector visual feedback

- listening: red recording dot is acceptable only as recording-state semantic, not destructive/overdue semantics within the normal task UI; it also has text `Слушаю…`;
- parsing delay must have visible/audible progress; no silent pause;
- per-intent states must be distinguishable by label/icon, not color alone;
- partial failure displays successful and failed items separately; never imply the whole utterance failed if only one target failed.

---

## 19. Legal/IP design boundary

Common UX patterns (Today, Inbox, Board, Calendar, Quick Add, NLP chips, drag-and-drop) can be used, but production must not be pixel-perfect clone of Todoist/Things/TickTick/Singularity, copy their proprietary iconography, branded animation or distinctive branded terminology.

Acceptance heuristic: experienced Todoist user understands SHAGI immediately, but an independent reviewer does not perceive it as recolored Todoist.
