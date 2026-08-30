# Implementation Plan: ШАГИ — волна 1 (E00–E12, локальный офлайн-продукт)

> СКЕЛЕТ. Заполняется по мере разведки. Финальная версия — в конце файла.

## Context
Greenfield: собрать локальный офлайн task manager ШАГИ по замороженному ТЗ `docs/spec/` до чекпоинта CP2.

## Repo state
- ветка `claude/model-distribution-workflow-gi49ya`, 1 коммит `a90c6d9` (заморозка ТЗ + айдентика), рабочее дерево чистое
- кода нет вообще; `docs/spec/` (40 файлов, SHA256 40/40 OK), `assets/brand/` (10 файлов)

## Environment (проверено)
| Что | В контейнере | Требует ТЗ | Вывод |
|---|---|---|---|
| Node | 22.22.2 | 24 LTS+ (§2) | ставим v24.20.0 «Krypton» тарболлом с nodejs.org (проверено: доступен) |
| pnpm | 10.33.0 | 10+ | ок |
| TypeScript | latest в npm = **7.0.2** | «5.9+» | развилка: пинить 5.9.3 или идти на 7.x → ADR |
| React / Vite | 19.2.8 / 8.2.2 | 19 / 8+ | ок |
| Tauri CLI | 2.11.4 | 2 | ок |
| `@js-temporal/polyfill` | 0.5.1 | обязателен | ок |
| Rust | 1.94.1 | для Tauri | ок (Linux-десктоп собирается) |
| JDK | 21.0.10 | для Android | ок |
| Android SDK/NDK | **отсутствует** | minSdk 26 | сборку Android здесь не проверить |
| Chromium + Playwright | есть (`/opt/pw-browsers`) | E2E + визрегрессия | ок |
| CPU / RAM / диск | 4 / 15 ГБ / 30 ГБ своб. | — | хватает |

**Следствие для верификации:** в этом контейнере проверяемы Web/PWA, все пакетные тесты, E2E и визуальная регрессия. Android и Windows шеллы в волне 1 только скаффолдятся и проводятся по CI — собрать их здесь нельзя.

## Research (заполняется агентами)
- `.ultraplan/research/01-domain.md` — домен, данные, temporal, recurrence, NLP, хранилище
- `.ultraplan/research/02-ui.md` — токены, компоненты, матрица экранов, a11y, i18n, адгезия
- `.ultraplan/research/03-quality.md` — тесты, DoD, гейты, CI/CD, безопасность, extension points

## Changes
TBD

## Implementation Sequence
TBD

## Edge Cases & Risks
TBD

## Verification
TBD
