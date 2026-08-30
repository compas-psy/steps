# ШАГИ

Personal task manager, экосистема СИМПАС. Local-first, offline-first, ru-RU.

## Статус

Инициализация репозитория. Реализация ведётся по замороженному ТЗ.

## Источники истины

Нормативное ТЗ лежит в `docs/spec/` и **заморожено** — оно копируется байт-в-байт
из поставленного пакета `ШАГИ_AGENT_PACKAGE_FINAL` и проверяется по
`docs/spec/SHA256SUMS.txt` (40/40 OK).

Порядок приоритета при расхождении источников — см.
`docs/spec/00_START_HERE_AGENT.md` и `docs/spec/SPEC/INDEX.md`.

| Путь | Назначение |
|---|---|
| `docs/spec/SPEC/` | Нормативные инженерные документы (01 → 12) |
| `docs/spec/DESIGN/` | Claude Design handoff v2 + DS-снапшот |
| `docs/spec/VALIDATION/` | Отчёты валидации и Design v2 delta |
| `docs/spec/SOURCE/` | Product/UX Spec v4.0 FINAL |
| `docs/adr/` | Architecture Decision Records |
| `assets/brand/` | Айдентика приложения (иконки, launcher-ассеты) |

## Правила

- Изменять файлы внутри `docs/spec/` запрещено: это замороженный контракт.
- Любое отклонение от заданной архитектуры/поведения оформляется ADR в том же изменении.
