# ШАГИ — REFERENCE BASE / PROVENANCE

## Product/design sources

- `source/PRODUCT_SPEC_v4.0_FINAL.md` — утверждённая product/UX specification.
- `source/R1_DESIGN_HANDOFF_v2.html` — current Claude Design R1 reference implementation/mockup; visually supersedes the prior handoff.
- `source/VECTOR_CJM_HANDOFF_v2.html` — approved R3 VECTOR CJM + V01–V06 concept frames.
- `source/ШАГИ-handoff_design_v2.zip` — original new design handoff. Previous design ZIP is retained only as history if present.
- `source/design-system-v2/` — current bundled token/design-system snapshot.
- `source/ШАГИ-handoff_design_v2.zip` — current original design handoff.
- `source/history/` — previous handoff artifacts retained only for audit/history.

## Existing SIMPAS engineering precedent consulted

Для унификации подхода проверена текущая архитектура `compas-psy/zapiski`: pnpm monorepo, shared `packages/core/ui/app`, thin Tauri 2 Android/Windows shells, PWA/web shell, TypeScript/React/Vite и отдельный Fastify/PostgreSQL server. ШАГИ используют этот паттерн как baseline, но не наследуют domain-specific архитектуру ЗАПИСОК (file-over-app/Markdown/zero-knowledge claims).

## External facts verified 29.08.2026

- Node.js 24.x — current LTS line on review date; official download page reported **v24.20.0 LTS**. Specification uses Node 24 LTS+ rather than freezing a patch.
  Official: https://nodejs.org/en/download/
- PostgreSQL 18 is the current stable major; **18.6 released 13.08.2026** while PostgreSQL 19 was Beta 3. Specification uses PostgreSQL 18.x baseline.
  Official: https://www.postgresql.org/docs/release/
- Todoist project CSV documentation reviewed 29.08.2026 defines fields including TYPE, CONTENT, DESCRIPTION, PRIORITY, INDENT, AUTHOR, RESPONSIBLE, DATE, DATE_LANG, TIMEZONE, DURATION, DURATION_UNIT, meta, DEADLINE, DEADLINE_LANG and IS_COLLAPSED; ordinary project CSV excludes completed tasks.
  Official: https://www.todoist.com/ru/help/todoist/features/import-or-export-a-project-as-a-csv-file-in-todoist-YC8YvN
- Todoist Pro/Business backup ZIP contains CSV per active project and includes active tasks, date/time, duration, deadlines, recurrence (with limitation on recurrence start), up to 500 comments/task and attachment links; completed tasks and archived projects are excluded.
  Official: https://www.todoist.com/ru/help/todoist/features/download-or-restore-backups-in-todoist-ywaJeQbN
- RF localization requirement is treated as release compliance baseline under Federal Law 152-ФЗ, Article 18(5), using current legal text at implementation/release review.
  Reference: https://www.consultant.ru/document/cons_doc_LAW_61801/

## Rule

External versions, store requirements and legislation are re-verified immediately before production release. Product/domain behavior does not silently change because a dependency version changed; technical adaptation uses ADR where material.

- Android exact alarms: exact scheduling is intended for precisely timed user-facing operations; current capability/permission/store restrictions must be checked before release.
  Official: https://developer.android.com/develop/background-work/services/alarms
- 152-ФЗ Article 18(5) current legal text is rechecked before release; RF localization is a compliance baseline.
  Reference: https://www.consultant.ru/document/cons_doc_LAW_61801/cbf4e15b7c330f9372e876cdf2bc928bad7950ef/

## Design v2 delta reviewed 29.08.2026

- R1 functional layouts are materially unchanged; the design file replaces the old single `zapiski` comparator theme with ZAPISKI-family `Бумага / Графит / Чернила` showcase themes. SHAGI production theme scope remains System/Light/Dark.
- New handoff adds `ВЕКТОР - CJM.dc.html`: six-stage voice journey, live transcript, one utterance→multiple intents/apps, per-intent High/Medium/Low confidence, provenance, Android concept states and microphone permission concept.
- Illustrative mock values are not domain contracts: exact dates are computed at runtime and OS permission dialogs remain native.
