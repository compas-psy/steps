# ШАГИ — DESIGN V2 DELTA / IMPACT ON IMPLEMENTATION SPEC

**Источник:** `source/ШАГИ-handoff_design_v2.zip`  
**Дата review:** 29.08.2026  
**Статус:** изменения учтены в Implementation Specification 1.2.

## 1. Что изменилось в R1 Design

Функциональная структура R1 практически не изменилась. Основной diff текущего `R1_DESIGN_HANDOFF_v2.html` относительно handoff v1 касается showcase/theme-comparison слоя:

- старый единичный demo theme `zapiski` удалён;
- добавлены ZAPISKI-family showcase themes:
  - `Бумага` / `paper`;
  - `Графит` / `graphite`;
  - `Чернила` / `ink`;
- SIMPAS/SHAGI базовые light/dark tokens и основной R1 layout не получили продуктового изменения.
- bundled DS snapshot v2 byte-identical предыдущему DS snapshot (12/12 файлов по SHA256); значит, изменение не требует миграции базовых SHAGI design tokens.

### Нормативное решение

Эти три темы **не являются новыми production themes ШАГОВ**. Для R1 SHAGI по-прежнему обязательны:

- System;
- Light;
- Dark.

Showcase switcher, green device frame, fake status bar, comparison themes и Claude/DC runtime не переносятся в production.

## 2. Главное новое: `ВЕКТОР - CJM.dc.html`

Design v2 добавляет утверждённую future-концепцию R3 VECTOR.

CJM фиксирует шесть этапов:

1. Trigger — hands-busy / screenless capture surface.
2. Capture — natural speech + live partial transcript.
3. Intent/Entity/Router — одна фраза может стать несколькими independent intents и уйти в несколько SIMPAS apps.
4. Confidence branch — High / Medium / Low **по каждому intent**, не по всему utterance.
5. Result — готовые объекты в target apps + provenance.
6. Trust/repeat — voice становится быстрым capture surface, а не raw-audio inbox.

Concept screens:

- V01 Multimodal Composer;
- V02 Voice Listening;
- V03 Live Parsing;
- V04 High confidence;
- V05 Medium confidence;
- V06 Low confidence;
- provenance/result semantics from CJM stage 5.

## 3. Что в ТЗ было усилено после design v2

Новый дизайн потребовал не просто добавить экраны, а закрыть следующие production gaps:

### 3.1. Batch != transaction

Один voice capture — это batch independent intents. Cross-app all-or-nothing transaction запрещена.

Каждый intent имеет:

- stable `intent_id`;
- target service/action;
- confidence class;
- independent risk class;
- status;
- idempotency key;
- independent Retry/Undo where supported.

### 3.2. Confidence != authorization

High confidence разрешает auto-execute только reversible low-risk actions, если target реально поддерживает reliable Undo.

Sensitive, destructive, publish/send/payment/external-side-effect actions требуют confirmation независимо от confidence.

### 3.3. Partial transcript не мутирует данные

Streaming partial transcript — feedback only. Domain mutations допускаются только после final segment/capture.

### 3.4. Cross-app sandbox boundary

Separate Android/iOS/desktop apps не могут тихо писать в sandbox другого приложения.

Введён Target Capability Registry:

- same-app action → local domain command;
- cross-app target with authorized API → scoped target-service command;
- target unavailable/local-only/not authorized → `requires_open` / Deferred Review;
- direct foreign DB/filesystem access запрещён.

### 3.5. Partial failure

Если SHAGI task создан, а ZAPISKI note не создалась:

- task не откатывается автоматически;
- failed intent получает Retry;
- retry не создаёт дубль successful intent;
- batch показывает partial failure.

### 3.6. Hands-free / driving contradiction

CJM persona занята вождением, но Medium/Low mock показывает touch controls. Production rule:

- High reversible → generic audio/haptic acknowledgement;
- Medium → short voice confirmation where safe/capable;
- Low → one spoken clarification where safe/capable;
- otherwise unresolved item → Deferred Review;
- visual interaction не требуется, чтобы не потерять мысль.

### 3.7. Audio retention

Raw audio is transient by default:

- success → delete after final transcript;
- cancel → delete immediately;
- failure/session expiry/crash cleanup → delete;
- offline without local ASR → Text fallback, not hidden recording queue;
- logs/analytics/backups never contain raw audio.

Unresolved review may retain minimal text/candidate state <=7 days, never raw recording.

### 3.8. Provenance

Created object stores opaque origin metadata:

- source=vector;
- source channel;
- capture_batch_id;
- intent_id;
- timestamp.

`Голосовой ввод · 09:14` does **not** imply a retained/playable recording.

### 3.9. Native microphone permission

The styled Android permission screen in the prototype is conceptual. Production uses actual OS permission UI; SHAGI may only show a pre-permission explanation.

### 3.10. Illustrative mock data is not domain truth

The CJM says `пятницы, 5 сент`, but for 29.08.2026 the next Friday is 04.09.2026. Production derives exact dates from current locale/time/parser and never hardcodes mock dates.

Likewise `Иван П. — 2 контакта` is an ambiguity illustration, not a requirement for a SHAGI Contacts entity.

## 4. Files affected in the normative package

- `00_MASTER_IMPLEMENTATION_TZ.md`
- `02_DATA_MODEL_SYNC.md`
- `03_BACKEND_API.md`
- `04_UI_DESIGN_SYSTEM.md`
- `05_SECURITY_PRIVACY_LEGAL.md`
- `06_TESTING_ACCEPTANCE.md`
- `07_RELEASES_FUTURE.md`
- `09_IMPLEMENTATION_PLAN.md`
- `10_FINAL_REVIEW_LOG.md`
- `11_REFERENCE_BASE.md`
- `12_SCREEN_STATE_MATRIX.md`

Additionally, the reviewer pass corrected older review-log drift in recurrence, import, notifications, labels, i18n and bulk behavior.

## 5. Release impact

**R1 scope is not expanded by Vector.**

R1 remains:

- no voice;
- no Vector;
- no AI dependency;
- deterministic offline text NLP.

R3 contracts are present now only to prevent R1 architecture/Composer/domain from becoming a dead end.
