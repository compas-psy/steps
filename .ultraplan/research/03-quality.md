# Исследование: качество, инфраструктура, безопасность, будущие релизы

Источники (прочитаны полностью, если не указано иное): `docs/spec/SPEC/06_TESTING_ACCEPTANCE.md`, `08_DEVOPS_CICD_OPERATIONS.md`, `05_SECURITY_PRIVACY_LEGAL.md`, `07_RELEASES_FUTURE.md`, `10_FINAL_REVIEW_LOG.md`, `docs/spec/VALIDATION/13_FINAL_VALIDATION_REPORT.md`, `03_BACKEND_API.md`. Дополнительно точечно сверено: `00_MASTER_IMPLEMENTATION_TZ.md` §11.1, §12, §13, §13.1 (перф-бюджеты, документация, i18n — числа отсутствовали в `06_TESTING_ACCEPTANCE.md` и были найдены здесь).

Контекст: первая волна — E00–E12, локальный офлайн-продукт без облака/аккаунта. Бэкенд E15–E18 вне первой волны, но архитектура не должна его блокировать. Платформы R1: Android (Tauri 2 Mobile, minSdk 26), Windows 10 22H2+/11 x64, Web/PWA.

---

## 1. Пирамида тестов

`06_TESTING_ACCEPTANCE.md` §1–§10.

- **Unit** — domain/time/recurrence/rank/NLP/import/entitlement/merge (§1).
- **Integration** — SQLite, IndexedDB, Postgres API, sync, auth, attachments (§1). Postgres/auth/attachments/sync относятся к backend-волне (E15+), но домен интеграции с SQLite/IndexedDB актуален уже в первой волне.
- **E2E** — Web Playwright; Android Maestro/Appium-equivalent; Windows Tauri/WebDriver harness; future iOS/macOS smoke (§1).
- **Визуальная регрессия** — «production screenshots against approved handoff semantics» (§1, §10). Golden states перечислены поимённо в §10: Welcome, Sign in, First Task, Today normal, Today missed/overdue, Quick Add parsed, Task detail simple/full, Inbox list/process, Plan, Project list/board, Data & Privacy, multi-select, Undo, context menu, command palette, Desktop Today/Board/Settings. Production убирает showcase chrome/device frames.
- **Property-based/фаззинг** — явно не выделены как отдельный уровень пирамиды в спецификации; ближайший эквивалент — обязательные исчерпывающие suites (temporal, recurrence, evil sync — см. ниже), которые де-факто покрывают комбинаторные случаи вручную перечисленными кейсами, а не генеративно. Это **дыра/открытый вопрос** — см. раздел 9.

### Обязательные тестовые корпуса и их размер

- **NLP golden corpus** (§3): **>=800 cases** — даты, время, длительность, дедлайн, повторение, приоритет, проект/метка, комбинированные фразы, пунктуация, кавычки, false positives, границы месяца/года/високосного, malformed input, Unicode/ё, неоднозначность. Golden expected = cleaned title + extracted chips + ambiguity/conflict state.
- **Temporal mandatory tests** (§2, список из 10 пунктов): leap year; Dec/Jan; timezone change/DST; available_from conflicts; planned > deadline warning; duration crossing deadline; date-only deadline end-of-day; midnight Today rollover; focus_date not carrying forward; reminder reschedule after timezone.
- **Recurrence suite** (§4, 12 пунктов): daily/weekly/monthly/yearly; every N; weekdays; 29/30/31 в коротких месяцах; scheduled completed late; completion anchor; current vs series edit/delete; deadline/reminder offsets; subtask/checklist clone incomplete; completion Undo; old occurrence restore/copy; dual-device completion convergence.
- **Evil sync suite** (§5, 12 сценариев, backend-волна) — все должны детерминированно конвергировать без тихой потери данных.
- **Import fixtures** (§6, 16 пунктов, versioned) — Todoist single CSV; Todoist backup ZIP; unknown extra columns; Cyrillic; malformed dates; recurrence; INDENT 1/2/3/4 flatten policy; recurring Subtask promotion; AUTHOR/RESPONSIBLE preservation; TIMEZONE wall-clock preservation; comments; `Комментарии Todoist.txt` overflow preservation; attachment URLs; large archive; malicious zip path; formula-injection CSV. Правило: «No mapped content silently lost».
- **Критические R1 E2E-флоу** (§9) — **39 именованных сценариев**, актуальны для первой волны почти целиком (кроме нескольких sync/cloud-specific, например #16 local→account merge, #19 offline attachment → cloud sync, которые зависят от backend). Это готовый список приёмочных сценариев для декомпозиции задач E00–E12.
- **Accessibility** (§7): автоматический axe + ручная клавиатура + TalkBack + NVDA; future VoiceOver. 200% zoom, reduced motion, dark/light contrast, alternative to drag.
- **Performance profiles / датасеты** (§8): 10k/100k tasks, 500 board cards, 200 projects, 50 Today, 50 labels/task edge, 10k completed. «Master budgets are assertions in CI/nightly, not aspirations» — сами числа budgets находятся не в этом файле, а в `00_MASTER_IMPLEMENTATION_TZ.md` §12 (см. раздел 3 ниже).
- **Backend acceptance** (§11) — вне первой волны (OpenAPI, rate limits, refresh rotation, idempotency, sync cursor, IDOR, account delete, backup restore, attachment quota, billing webhook signatures, content-free logs).
- **Будущий R3 Vector acceptance gate** (§15) — 27 пунктов, mandatory только перед включением R3, не входит в R1, но задаёт архитектурные швы (см. раздел 7).

---

## 2. Definition of Done

**Дословный Epic DoD** (`06_TESTING_ACCEPTANCE.md` §13 «Epic Definition of Done» — эпик считается Done только если):
- implementation;
- appropriate unit/integration/E2E;
- docs updated;
- telemetry reviewed;
- accessibility covered;
- design matched;
- migrations/backward compatibility tested;
- CI green;
- no unresolved user-behavior placeholders.

**Дополняющие требования из `00_MASTER_IMPLEMENTATION_TZ.md` §13 «Documentation»** (применимы к каждому PR, не только к эпику целиком):
- `docs/spec/` — frozen source specs (не редактировать);
- Stack/architecture deviation → **ADR before implementation**;
- user-visible change обновляет `docs/user/` и **changelog в том же PR**;
- API change обновляет OpenAPI + server docs (backend-волна);
- DB migration включает upgrade test и recovery/rollback strategy;
- Feature flag без enabled/disabled тестов считается неполным.

**§13.1 Localization contract**: R1 production locale `ru-RU` обязателен и полон (детали ниже в разделе 8, дыра #46).

Итого DoD для задач первой волны фактически объединяет: implementation + tests (unit/integration/E2E по применимости) + доки/changelog + a11y + design match + migration/backcompat test + CI green + i18n ключи полны + (при отклонении от стека) ADR.

---

## 3. Релизные гейты

### R1 Final Gate (`06_TESTING_ACCEPTANCE.md` §14, дословно)
- R1a + R1b complete/enabled;
- Android/Windows/Web release gates pass;
- iOS/macOS architecture/build not blocked;
- all critical E2E pass;
- visual review approved;
- **7-day staging soak without blocker**;
- backup restore drill passed;
- **no P0/P1**;
- no unresolved data-loss bug any severity;
- legal/consent versions deployed;
- signed packages verified.

### Security release blockers (§12, дословно)
- secret committed/logged;
- user content telemetry/logging;
- exploitable critical/high dependency vuln;
- broken auth/session;
- IDOR;
- shared permission leak;
- ZIP slip/path traversal;
- XSS/unsafe HTML;
- **PII primary storage outside approved RF infrastructure**.

### Перф-бюджеты (числа — `00_MASTER_IMPLEMENTATION_TZ.md` §12; per §11.1 там же и §8 `06_TESTING_ACCEPTANCE.md` для метода измерения)

| Метрика | Бюджет релиза | Как/чем измеряется (из спецификации) |
|---|---|---|
| local create/complete commit | p95 <50 ms | CI/nightly assertion (инструмент не назван — открытый вопрос) |
| Today query, 50 visible | p95 <80 ms | датасет "50 Today" из §8 06_TESTING_ACCEPTANCE.md |
| Today from 500 candidates | p95 <150 ms | — |
| search 10k tasks | p95 <80 ms | датасет "10k/100k tasks" |
| search 100k tasks | p95 <250 ms | датасет "10k/100k tasks" |
| Quick Add main-thread keystroke | <16 ms | — |
| NLP typical parse | p95 <30 ms | NLP golden corpus (800+ cases) как источник входных данных |
| Android usable cold/local | p95 <2.5 s mid-range | «mid-range» устройство упомянуто, конкретная модель/стенд не определены |
| Windows warm launch | p95 <1.5 s | — |
| PWA warm/offline | p95 <1.5 s | — |
| apply 1000 sync mutations excluding RTT | <1 s | backend-волна |
| Board 500 cards | virtualization; 60fps target | датасет "500 board cards" §8 |
| Android working-set target | <180 MB | — |
| Windows target | <250 MB | — |

**Важно (дыра для планирования):** спецификация задаёт числа бюджетов и говорит «Master budgets are assertions in CI/nightly, not aspirations», но НЕ называет конкретный инструмент измерения (Lighthouse/Vitest bench/custom harness/perf trace), НЕ называет конкретный эталонный стенд («mid-range Android» без модели), и НЕ определяет метод расчёта p95 (сколько прогонов, какая среда CI-раннера). Это открытый вопрос, требующий ADR/решения (см. раздел 9).

Дополнительное правило (00_MASTER §12): «Existing local data screen must never await remote API to render» — жёсткий архитектурный гейт для первой волны (offline-first).

---

## 4. CI/CD

`08_DEVOPS_CICD_OPERATIONS.md`.

### PR CI pipeline (§2, порядок как в списке, предполагается последовательно-блокирующий до E2E/visual этапа)
1. locked install;
2. format/lint;
3. TS typecheck;
4. token/string lint;
5. unit;
6. integration;
7. OpenAPI contract (backend-волна);
8. web build;
9. server build (backend-волна);
10. secret/dependency/SAST scan;
11. selected E2E/visual.

Main/nightly добавляет: full perf, evil sync, full visual, Android/Windows packages, future Apple smoke on macOS runner.

### Матрица раннеров (§3)
- **Linux**: web/server/Android/Docker.
- **Windows**: Windows native package/sign.
- **macOS**: iOS/macOS package/sign (future).
- Требование: скрипты портируемы между GitHub/GitVerse/self-hosted — CI-вендор не должен быть закодирован в приложении.

### Android exact-reminder policy check (§3.1) — обязательная предрелизная проверка
Перед каждым Android store-релизом: re-verify current targetSdk requirement; re-verify `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` eligibility и store policy; протестировать `canScheduleExactAlarms()` (или эквивалент); least-privileged permission model; никогда не добавлять restricted permission ради удобства реализации. При невозможности exact scheduling — fallback по контракту из `01_PRODUCT_BEHAVIOR_R1.md`.

### Signing (§4)
Android release key — только secrets store/runner. Windows code-signing cert + timestamp. Apple signing/notarization — future. Приватные signing-материалы никогда не в repo/логах.

### Versioning (§5)
SemVer для app/backend; build metadata включает git SHA. Клиент отправляет app/schema version. Сервер поддерживает совместимость минимум 2 активно поддерживаемых minor-клиентов, где безопасно. Forced upgrade — только при security или schema incompatibility.

### Требования к сборкам платформ (из §3 + §6)
- **Android**: пакетируется/подписывается на Linux-раннере (Tauri 2 Mobile).
- **Windows**: native package/sign на Windows-раннере, code-signing cert + timestamp.
- **PWA/Web**: web build на Linux-раннере, деплой за Nginx как shagi-web PWA/static (baseline deployment из §6, backend-волна).

### Supply chain / SBOM / подписи (§11.1 — обязательно на каждый релиз)
- immutable lockfile в CI;
- **SBOM (CycloneDX or SPDX)**;
- dependency vulnerability scan;
- dependency license scan;
- secret scan;
- build provenance/git SHA;
- third-party notices generation/review.

Зависимости с неразрешённой critical/high exploitability или неодобренными reciprocal/network-copyleft обязательствами **блокируют релиз**.

### Feature flags (§10) — typed registry
`billing_enabled`, `pro_paywall_enabled`, `planning_r1_1`, `smart_r1_2`, `shared_r1_3`, `simpas_links_r2`, `vector_r3`. Правило: выключенный флаг не должен оставлять сломанную навигацию/действие; dark migrations разрешены, скрытый UI сам по себе недостаточен без backward compatibility.

### Rollback (§11)
Server — предыдущий образ + forward-compatible DB. Деструктивная contract migration — только после старения старых клиентов. Mobile — предыдущая сборка должна оставаться sync-compatible в поддерживаемом окне клиентов.

### Прочее операционное (частично backend-волна, но полезно для контекста)
Environments (§1): local/test-CI/staging/production, отдельные БД/бакеты/credentials, production данные никогда не копируются в staging. Backups (§7): Postgres daily full + WAL/PITR RPO<=15m, 30 daily + 12 monthly retention; RTO<=2h. Monitoring/SLO (§8): 99.9% monthly для account/sync API; data-loss incident всегда P0. Логи (§9): structured JSON, retention 30d операционные / 90d auth-security, request_id end-to-end, без user content.

---

## 5. Безопасность и приватность

`05_SECURITY_PRIVACY_LEGAL.md`. Применимость к первой волне помечена явно.

### Применимо уже в первой волне (локальный продукт, без облака)
- **Запрет на логирование контента** (§6): никогда не логировать task title/description, project/section/label names, subtask/checklist text, attachment filename, CSV/import body, Smart prompt, transcript/audio. Разрешено: opaque IDs, route, error code, latency, byte count, app/schema version. **Redaction tests mandatory** — актуально уже для локальных логов клиента.
- **Analytics** (§7): отдельный opt-in toggle, **OFF by default**, без raw content. Разрешённый список событий (app_open, task_created{source,has_date,has_deadline,nlp_token_count}, task_completed{age_bucket}, task_rescheduled{direction}, inbox_processed, project_created, quick_add_opened, reminder_set, recurrence_set, import_completed{source,count,warning_count}, sync_enabled, sync_error{code}, paywall_viewed{feature}, subscription_activated{channel}). Запрещённые свойства: title/project name/label/email/freeform text/attachment name. Применимо к клиентской телеметрии первой волны, даже если backend её ещё не собирает.
- **Diagnostics** (§8): отдельный toggle от analytics, **OFF by default**. Crash report: stack, build, OS/device family, technical breadcrumbs — никогда content.
- **Local secrets** (§5): нативные refresh/auth secrets — Android Keystore / Windows Credential Manager (в R1 нет облачного аккаунта, но паттерн secure storage закладывается архитектурно уже сейчас для будущего auth). Web: HttpOnly Secure cookie для сессии, никогда токен в localStorage; IndexedDB только для application data.
- **Import/export security** (§11): ZIP bomb limits; никаких `../`; никакого выполнения кода; CSV — только данные. Generic CSV export экранирует spreadsheet formula injection для ячеек, начинающихся с `=`, `+`, `-`, `@`.
- **Local-data deletion** (§13): local-only delete — явное предупреждение «нет облачного восстановления». (Synced-часть — backend-волна.)
- **Legal documents/consents** (§14): immutable document versions/hashes; отдельные User Agreement, Privacy Policy, analytics consent, diagnostics consent (marketing/R1.2 AI/R3 voice — будущие волны). **No prechecked optional consent** — применимо к любому consent UI уже в R1.
- **User content как potentially sensitive UGC** (§1.1): продукт не профилирует чувствительные категории, не переиспользует контент для рекламы, не показывает контент в admin по умолчанию — принцип актуален для архитектуры хранения с первой волны.
- **Security baseline** (§19): target OWASP ASVS L2 где применимо, OWASP MASVS mobile controls, SAST, dependency/SBOM/secret scanning — общий процессный гейт, применим уже к CI первой волны.
- **IP/dependency compliance** (§18.1): SBOM + dependency license scan — release requirement уже для первой волны.

### Применимо начиная с backend-волны (E15+), но архитектура не должна блокировать
- Domain isolation Account Core ≠ SHAGI ≠ PRAKTIKA ≠ ZAPISKI (§1) — отдельные БД/credentials, no cross-domain SQL joins, service API/scoped token only.
- **RF personal-data localization (152-ФЗ ст.18(5))** (§2): для граждан РФ первичная server-side запись/систематизация/накопление/хранение/обновление/извлечение персональных данных — в базах на территории РФ. Production account email, account IDs, subscription info, synced task data — RF-hosted primary stores; иностранный CDN/провайдер не может стать primary PII database. **Это backend/инфраструктурное требование, но архитектурно важно не проектировать sync-протокол так, чтобы он предполагал не-RF primary storage.**
- Transport (§3): TLS 1.2 min/1.3 preferred, HSTS, secure cookies, monitored cert renewal.
- At rest (§4): encrypted server volumes/backups/object storage; **R1 явно не рекламируется как zero-knowledge** — sync-сервер технически может обрабатывать synced task data.
- Auth security (§9): OTP hash only, TTL/rate limits, enumeration resistance, Yandex PKCE, rotating refresh + reuse detection, session/device revoke, CSRF, strict CORS/CSP, brute-force alerts.
- Attachments (§10): MIME sniff, extension untrusted, no path traversal, short-lived signed download, unsafe type → Content-Disposition attachment, size/quota/checksum, malware-scan hook, opaque object path.
- Logout / local account cache (§11.1): unsynced данные должны синхроваться/экспортироваться/явно сохраниться до logout; silent loss запрещён.
- Account deletion (§12): explicit destructive UX + re-auth, sessions revoked immediately, active data purged within 24h, backups age out <=30 days.
- Shared privacy R1.3 (§15): project private by default, revoke немедленно ревокирует server rights; offline-cached data не может быть remote-wiped до следующего контакта — задокументированный лимит угрозы.
- PRAKTIKA R2 (§16): explicit object selection, no fuzzy auto-match, no analytics reuse of sensitive data, cross-service access auditable.
- AI R1.2 (§17): user initiates/enables, minimum context, provider allowlist, no training on user data, no prompt logs by default, RF gateway baseline, foreign transfer только после legal review + consent, preview before mutation.
- Vector R3 (§18) — полный voice-privacy контракт (см. раздел 7 ниже, extension points).

---

## 6. Юридические и IP-гейты

- **Лицензии зависимостей**: SBOM + dependency license scan — обязательный release gate (`08_DEVOPS...` §11.1, `05_SECURITY...` §18.1, §19). **Reciprocal/network-copyleft зависимости требуют явного approval** — не запрещены абсолютно, но блокируют релиз без approval gate.
- **SBOM**: CycloneDX или SPDX формат, генерируется на каждый релиз (§11.1 08_DEVOPS).
- **Шрифты/иконки**: bundled fonts/icons требуют redistribution rights/notices (`05_SECURITY...` §18.1). Конкретика из review log #17: runtime Google Fonts запрещены как противоречащие offline/privacy/perf целям — используется self-hosted/packaged Geist/Geist Mono.
- **Todoist-импорт**: использует только public documented formats (§18.1); нет копирования competitor source/assets/pixel-perfect воспроизведения.
- **Third-party notices**: generation/review — обязательный шаг релиза (§11.1 08_DEVOPS).
- **No copied competitor source/assets** — общий принцип §18.1.

---

## 7. Extension points (контракты для будущих R1.1/R1.2/R1.3/R2/R3)

Из `03_BACKEND_API.md` и `07_RELEASES_FUTURE.md`. Это то, что архитектура первой волны обязана заложить как швы, не блокируя backend/будущие релизы.

### Общий архитектурный принцип
- «Every adapter produces normal domain command, never direct DB write» (`07_RELEASES_FUTURE.md`, Future integration surface) — Telegram/MAX/email→task/OS Share/wearables/public API/webhooks — все будущие входные каналы обязаны проходить через один и тот же domain-command слой, что и Quick Add/Composer. Это прямо требует, чтобы Composer/Quick Add в R1 уже был реализован как вызов доменных команд, а не как отдельная UI-логика.
- «Vector calls normal target commands» (`03_BACKEND_API.md` §17.9): SHAGI-intent из будущего Vector вызывает тот же `CreateTaskCommand`/validation/capture semantics, что и текстовый Quick Add. **Значит: команда создания задачи (`CreateTaskCommand` или её аналог) должна быть единой точкой входа уже в R1**, чтобы её можно было переиспользовать без переписывания.

### Task-модель / данные (швы, которые нельзя ломать позже)
- **`capture_state=inbox|processed`** на Task (review log #1) — обязателен уже в R1 модели данных.
- **Subtask/recurrence data model должна быть future-safe при one-level UI** (review log #24, #29): «R1 UI one-level, data model future-safe»; recurrence разрешён только top-level, но схема не должна блокировать будущую иерархию.
- **Provenance-поля на созданных объектах** для будущего Vector (`03_BACKEND_API.md` §17.7): `source=vector`, `source_channel`, `source_capture_batch_id`, `source_intent_id`, creation timestamp — **это подсказывает, что Task-модель уже в R1 должна иметь generic `source`/provenance поле(я)**, расширяемое для будущих каналов ввода (не только Vector, но и Quick Add/Import/Telegram и т.д.), чтобы не потребовалась миграция схемы.
- **R2 SIMPAS-ссылки — opaque ref, не FK**: `{"service":"zapiski|praktika|momenty","object_id":"opaque","link_scope":"user-explicit"}` (`03_BACKEND_API.md` §16). Архитектура задач/связей в R1 не должна проектировать межсервисные связи как прямые foreign keys — только opaque reference slot.
- **Entitlements как typed key registry**, не hardcoded paywall-логика: `projects_limit`, `advanced_calendar`, `external_calendars`, `advanced_filters`, `advanced_reminders`, `extended_history`, `advanced_widgets`, `smart_features`, `advanced_themes`, `attachment_quota_bytes`, `attachment_max_file_bytes` (`03_BACKEND_API.md` §11). В R1 без биллинга это подсказывает: Free/Pro-гейтинг (лимит проектов и т.д.) должен читаться из единого entitlements-реестра/конфига, а не быть захардкожен по месту.

### Composer / Navigation
- Composer в R1 обязан быть спроектирован так, чтобы позже добавились табы **Текст / Голос / Файл** без замены архитектуры (`07_RELEASES_FUTURE.md` R3 Composer раздел; `04_UI_DESIGN_SYSTEM.md` V01). «Файл» — мультимодальный адаптер (image/PDF/document), а не отдельная вкладка на каждый тип.
- **Vector не становится пятым nav-таргетом** (`04_UI_DESIGN_SYSTEM.md` §"Vector does not become a fifth bottom-nav destination"): неразрешённые voice-intents всплывают как sheet/badge в вызывающем Composer или optional entry в Settings/Data & Privacy — значит навигационная структура R1 не должна резервировать отдельный root для будущих модальностей ввода, но Composer/Settings должны уметь принимать pluggable "unresolved items" surface.
- **`GlobalShortcutPort`** для Windows (review log #49): in-app shortcut (Ctrl/Cmd+N) отделён от configurable OS-global capture; Web явно не имеет OS-global capture. Значит нужен абстрактный порт для global-shortcut, реализуемый только на Windows.

### Sync-протокол (для будущих E15+, но контракт формы данных важен уже сейчас)
- **`op_id`/idempotency**: каждая sync-операция имеет уникальный `op_id`, повторный push не создаёт дублирующую мутацию (`03_BACKEND_API.md` §5). Локальная domain-command слой в R1 должна уже генерировать стабильные op-идентификаторы (или готовую к этому структуру), чтобы позже подключить sync без переписывания command-слоя.
- **HLC/clocks на полях** (`patch.clocks`, пример `{"planned_date":"hlc"}`, §5) — подразумевает per-field conflict resolution (LWW/HLC), что требует уже в R1 хранить структуру данных, допускающую позже поле-уровневые часы (а не просто updated_at на всю запись).
- **`base_revision`** на операциях — версионирование сущностей нужно закладывать в схему уже в R1 (монотонно растущий revision/version per entity), даже без сервера.
- **Recurrence deterministic UUIDv5** от series/sequence/template IDs (review log #30) вместо UUIDv7 — необходимо для будущей multi-device конвергенции; это должно быть реализовано уже в R1 recurrence-движке (не sync-специфично, но критично для будущего sync).
- **`stop_after_occurrence_seq`** remove-wins граница (review log #51) и **`template_revision` + occurrence `override_fields`** (review log #52) — конкретные поля модели повторений, обязательные уже в R1 для корректной будущей sync-конвергенции.
- **Tombstone retention 90 дней** (review log #26) — soft-delete модель должна поддерживать tombstone уже в R1, а не жёсткое удаление, ради будущей sync stale-resurrection защиты.
- **Билинг**: единый `BillingPort` интерфейс, реализуемый разными адаптерами (Т-Касса/RuStore Billing/StoreKit2) (`03_BACKEND_API.md` §11 Billing adapters) — не требуется в R1 (нет биллинга ещё), но если Free/Pro гейтинг появляется в R1, entitlement-проверка должна быть за портом, совместимым с будущими адаптерами.

### Import/Export
- Import формирует **`import_batch`** с 10-минутным rollback-окном, пока не тронуто (review log #9) — должно быть частью архитектуры импорта уже в R1.
- Backup/restore ID-модель: empty restore сохраняет IDs; non-empty import remaps коллизии (review log #40) — влияет на дизайн ID-генерации/экспорт-формата в R1.

### R1.1/R1.2 конкретные контракты (не в первой волне, но задают форму)
- External Calendar (`03_BACKEND_API.md` §13): read-only ingestion, provider tokens encrypted server-side, SHAGI Tasks не пишутся во внешний календарь по умолчанию — Task/time-block модель R1 должна отличать "внешнее событие" (не completable, другая иконка/цвет) от Task уже на уровне данных (`07_RELEASES_FUTURE.md` R1.1: "External event is not completable Task").
- Smart R1.2 (`03_BACKEND_API.md` §14, `07_RELEASES_FUTURE.md` R1.2): «Local deterministic engine first» — capacity/scheduling полностью локальны и детерминированы; Remote AI используется только для Break into steps/Next step/Estimate duration и возвращает `proposal`, никогда не мутирует данные напрямую. **Значит: любая будущая "AI"-функция обязана проходить через тот же apply/confirm UI-паттерн, что и остальные предложения (preview → Apply), и такой паттерн стоит спроектировать в R1 уже для не-AI предложений (если есть).**

---

## 8. Найденные ранее дыры (из независимого review, 76 пунктов) — где легко ошибиться повторно

`10_FINAL_REVIEW_LOG.md` содержит 76 найденных и исправленных дыр; `13_FINAL_VALIDATION_REPORT.md` подтверждает 89/89 PASS проверок, включая, что все 76 фиксов перенесены в нормативные документы (не только зафиксированы в review log). Наиболее релевантные для декомпозиции первой волны (E00–E12):

1. **Inbox Zero логически невозможен** без `capture_state=inbox|processed` (#1) — обязательное поле на Task с первого дня.
2. **Today дублирование задачи** в нескольких категориях — нужна единая precedence: `DeadlineMissed > MissedPlan > Focus > Timed > Today > Later` (#2), должна быть реализована как единая функция ранжирования, не разрозненные if-ы.
3. **Parent completion с незавершёнными subtasks** — не была определена; сейчас: prompt «Завершить всё / Отмена», completed parent с active direct child запрещён (#3).
4. **Recurrence с относительными offset'ами**, а не абсолютными датами для дедлайнов/напоминаний (#4) — легко случайно закодировать абсолютно.
5. **Recurrence Undo** должен атомарно откатывать сгенерированный occurrence, если он не тронут (#5) — иначе дубли.
6. **Floating time представление**: домен обязан использовать PlainDate/PlainTime, а НЕ JS Date, иначе после путешествия/смены timezone семантика ломается (#13) — критично для реализации на TypeScript/Temporal-подобных типах.
7. **Account merge dedupe** — только stable UUID, никакого fuzzy title/date matching (#14) — легко скатиться в "умный" дедуп, что запрещено.
8. **CSV formula injection** — экранирование `=`, `+`, `-`, `@` в export (#27) — конкретная security-деталь, легко забыть при реализации экспорта.
9. **Domain/service database mixing** — жёсткая граница сервисов + opaque refs (#28) — актуально при проектировании будущих SIMPAS-связей уже сейчас, чтобы не тянуть прямые SQL join.
10. **Recurrence разрешён только top-level** (#29) — Subtask не может рекуррировать сама по себе; recurring Todoist child при импорте повышается до top-level с warning.
11. **Recurrence multi-device duplicate** — deterministic UUIDv5 вместо UUIDv7 для generated occurrences (#30) — нужно реализовать в recurrence-движке R1, даже без sync, чтобы не переделывать позже.
12. **Late scheduled recurrence backlog** — при завершении occurrence через несколько интервалов создаётся только первый следующий слот, промежуточные не материализуются (#31).
13. **Completion-anchor skip** — `Пропустить это повторение` становится anchor следующего интервала (#32).
14. **Restore hierarchy** (parent/project deleted/archived) — явные restore-context choices (#33).
15. **Parent/Subtask move invariant** — перенос parent каскадирует subtasks; перенос child отдельно сначала detach after confirmation (#34).
16. **Todoist deep hierarchy** (INDENT до 4, AUTHOR/RESPONSIBLE/TIMEZONE метаданные) при поддержке только одного уровня subtask в R1 (#35) — конкретная логика flatten с preview-warning нужна в импортере с первого дня.
17. **Browser reminder reliability** — local-only PWA не может гарантировать доставку при полностью закрытом браузере; нужен явный disclosure UI уже в R1 Web (#36).
18. **Android exact-alarm capability** — just-in-time запрос + release-time recheck политики стора (#37).
19. **Free-лимит проектов не должен блокировать миграцию/восстановление** — ограничение действует только на будущий create/reactivate (#39) — важно даже если биллинг придёт позже, но лимит проектов уже может существовать в R1 (Free-режим по умолчанию).
20. **Backup restore ID collision**: empty restore сохраняет IDs, non-empty import remaps коллизии графа (#40) — архитектурная деталь backup/export формата R1.
21. **Optional telemetry defaults** — оба toggle (analytics/diagnostics) OFF по умолчанию; design-скриншот ON — не источник дефолта (#41, #50) — легко случайно унаследовать дефолт из handoff-макета.
22. **Localization contract** — ru-RU обязателен, отсутствующий production-ключ = CI failure (#46) — нужен CI-чек на completeness ключей i18n с первого дня.
23. **`Когда будет время` vs Planned Time precedence** — конкретное правило взаимного сброса полей (#47).
24. **Global Quick Add platform boundary** — `Ctrl/Cmd+N` только in-app shortcut; OS-global — отдельный `GlobalShortcutPort` только для Windows; Web явно не может (#49).
25. **Labels deletion** — relation-only delete + Undo, Tasks не удаляются (#44).
26. **Bulk parent completion** — один aggregate confirm, не N confirmations, без double-count при выборе parent+child одновременно (#45).
27. **Completed history / project deletion** — completed record хранит snapshot имени проекта, чтобы не терять контекст истории (#25).

Общий вывод review-log/validation-report: на дату заморозки (29.08.2026) все 76 находок перенесены в нормативные документы, известных открытых product/behavior placeholder'ов не осталось (`10_FINAL_REVIEW_LOG.md` §55, §69, §76; `13_FINAL_VALIDATION_REPORT.md` — 89/89 PASS). Runtime-секреты (OAuth ID, ключи подписи, DNS) остаются operations-secrets вне спецификации, но их контракты определены.

---

## 9. Открытые вопросы (требуют ADR/решения владельца)

1. **Инструмент и метод измерения перф-бюджетов** (раздел 3): числа заданы (`00_MASTER_IMPLEMENTATION_TZ.md` §12), но не назван конкретный harness (Vitest bench / Lighthouse CI / custom perf trace), не определён эталонный "mid-range Android" стенд, не описана методология подсчёта p95 (число прогонов, CI-окружение vs реальное устройство). Нужен ADR перед тем, как писать perf-CI job.
2. **Property-based/фаззинг тестирование** — не выделено как отдельный уровень пирамиды; корпуса перечислены как conkретные ручные кейсы (NLP >=800, temporal 10 пунктов, recurrence 12 пунктов). Стоит решить, дополнять ли ручные suites генеративным фаззингом (например, для NLP-парсера или recurrence-движка) — спецификация этого не требует явно, поэтому это решение сверху, а не изобретённое требование.
3. **CI-инструменты конкретно** (`08_DEVOPS_CICD_OPERATIONS.md` §2) называет шаги пайплайна (format/lint, typecheck, unit, integration, secret/dependency/SAST scan), но не называет конкретные инструменты (ESLint/Biome? Trivy/Snyk/OSV-Scanner? какой SAST?) — выбор инструментов делегирован реализации, стек в задании (pnpm/TS/Vitest/Playwright) покрывает часть, но SAST/dependency-scan/secret-scan/license-scan инструменты не названы нигде в ТЗ.
4. **Раннер для Android/Windows/PWA билдов**: `08_DEVOPS...` §3 говорит "Linux: web/server/Android/Docker; Windows: Windows native package/sign", но не уточняет, требуется ли самостоятельный self-hosted runner для Android SDK/NDK/Tauri Mobile toolchain, или это решается позже — стоит ADR по CI-инфраструктуре под Tauri 2 Mobile сборки.
5. **"Master budgets are assertions in CI/nightly"** — неясно, входят ли perf-тесты в блокирующий PR CI (список §2 08_DEVOPS не включает perf explicitly, только nightly добавляет "full perf"), т.е. PR CI не блокируется перф-бюджетами, только nightly/main — это стоит явно зафиксировать в декомпозиции задач CI.
6. **Redaction tests** (`05_SECURITY...` §6) названы mandatory, но конкретный формат/фреймворк для проверки "не логируется контент" не определён — нужно спроектировать (например: линт по паттернам полей, или property-test на logger).
7. **ADR-процесс** сам по себе не формализован (нет шаблона/директории ADR в прочитанных файлах) — для декомпозиции стоит завести `docs/adr/` и процесс с первой же архитектурной задачи (Task-модель, sync-протокол-заготовка).
