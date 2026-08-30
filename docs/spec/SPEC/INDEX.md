# ШАГИ — пакет полного ТЗ на реализацию

**Версия:** Implementation Specification 1.2 DESIGN V2 REVIEWED / FROZEN  
**Дата:** 29 августа 2026  
**Продукт:** ШАГИ · экосистема СИМПАС  
**Статус:** готово к декомпозиции в эпики и реализации  
**Основание:** утверждённая Product/UX Specification v4.0 FINAL + Claude Design handoff v2 (R1 + VECTOR CJM) + повторный независимый CPO/architecture review.

## Состав

| Файл | Назначение |
|---|---|
| `00_MASTER_IMPLEMENTATION_TZ.md` | Главный инженерный контракт: цель, стек, архитектура, платформы, релизный scope, инварианты |
| `01_PRODUCT_BEHAVIOR_R1.md` | Исчерпывающее поведение R1 и edge cases |
| `02_DATA_MODEL_SYNC.md` | Модель данных, локальная БД, outbox, sync и conflicts |
| `03_BACKEND_API.md` | Backend, API, auth, attachments, entitlements и extension contracts |
| `04_UI_DESIGN_SYSTEM.md` | Production-перенос Claude Design: tokens, компоненты, responsive, accessibility |
| `05_SECURITY_PRIVACY_LEGAL.md` | Security, privacy, RF data localization, consent/telemetry |
| `06_TESTING_ACCEPTANCE.md` | Tests, perf budgets, visual regression, release gates, DoD |
| `07_RELEASES_FUTURE.md` | R1.1 → R3 с техническими extension points |
| `08_DEVOPS_CICD_OPERATIONS.md` | CI/CD, environments, deployment, backup, monitoring, rollback |
| `09_IMPLEMENTATION_PLAN.md` | Эпики, зависимости, параллельные lanes и checkpoints |
| `10_FINAL_REVIEW_LOG.md` | Независимый post-write review: найденные дыры и принятые исправления |
| `11_REFERENCE_BASE.md` | Provenance и внешние facts, проверенные на дату ТЗ |
| `12_SCREEN_STATE_MATRIX.md` | Полная матрица M01–M52/D01–D20/T/ST с implementation acceptance |
| `13_FINAL_VALIDATION_REPORT.md` | Финальный cross-file validation: автоматические и reviewer-проверки |
| `14_DESIGN_V2_DELTA.md` | Что изменил новый design handoff и какие implementation-contracts были скорректированы |
| `ШАГИ_FULL_IMPLEMENTATION_TZ_FINAL.md` | Все нормативные документы, объединённые в один файл |
| `source/` | Product Spec v4.0, Claude Design v2: R1 + VECTOR CJM, DS snapshot и оригинальный handoff ZIP |

## Приоритет источников истины

При расхождении верхний документ важнее нижнего:

1. `01_PRODUCT_BEHAVIOR_R1.md` — пользовательское поведение R1 и edge cases.
2. `02_DATA_MODEL_SYNC.md` — инварианты данных и синхронизации.
3. `03_BACKEND_API.md` — сетевые и backend-контракты.
4. `04_UI_DESIGN_SYSTEM.md` — production-визуал утверждённого handoff.
5. `00_MASTER_IMPLEMENTATION_TZ.md` — общая архитектура и scope.
6. `05_SECURITY_PRIVACY_LEGAL.md` — security/privacy constraints имеют veto над удобством реализации.
7. `07_RELEASES_FUTURE.md` — future releases.
8. `source/PRODUCT_SPEC_v4.0_FINAL.md` — продуктовый замысел, если вопрос не конкретизирован выше.
9. `source/R1_DESIGN_HANDOFF_v2.html` + `source/VECTOR_CJM_HANDOFF_v2.html` + `source/design-system-v2/` — current visual/CJM source for shown states.
10. Previous handoff files, if retained, are history only.

HTML Claude Design задаёт визуальный результат, а не DOM/React-архитектуру. Его внутренние `<x-import>`, showcase navigation, mock device frame и support runtime не копируются в production.

## Блокирующие красные линии

- R1 core полностью работает локально без аккаунта и сети.
- В R1 нет Voice/Vector и нет AI-зависимости.
- NLP R1 rule-based, deterministic и offline.
- Planned Date ≠ Deadline; Missed Plan ≠ Missed Deadline.
- Простая задача не требует заполнения сложной формы.
- Ни user content, ни названия задач/проектов/меток не попадают в telemetry или operational logs.
- Все строки через i18n; hardcoded user-facing text в reusable components запрещён.
- Все цвета/radii/type/shadows через DS tokens; literal product colors вне token layer запрещены CI.
- Platform shells не содержат product screens/business logic.
- Account Core, SHAGI data и будущие sensitive SIMPAS domains физически/логически разделены.
- Серверные персональные данные граждан РФ первично хранятся/обрабатываются в инфраструктуре РФ.
- Showcase themes `Бумага / Графит / Чернила`, зелёные рамки устройств и fake status bars из handoff — comparison/demo only, не production SHAGI.


## Design v2 rule

`source/R1_DESIGN_HANDOFF_v2.html` supersedes the old R1 HTML visually. `source/VECTOR_CJM_HANDOFF_v2.html` is the approved future R3 CJM/concept source. Behavior hardened in implementation specs remains normative over illustrative mock text.
