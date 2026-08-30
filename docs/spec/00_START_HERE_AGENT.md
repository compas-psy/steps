# ШАГИ — START HERE FOR IMPLEMENTATION AGENT

**Package:** FINAL / DESIGN V2 / implementation-ready  
**Purpose:** single unambiguous source package for implementing ШАГИ.

## Read in this order

1. `MASTER_TZ.md` — combined normative implementation specification.
2. `SPEC/INDEX.md` — document priority and package map.
3. `SPEC/01_PRODUCT_BEHAVIOR_R1.md` — highest-priority user-visible R1 behavior.
4. `SPEC/02_DATA_MODEL_SYNC.md` — canonical data/sync invariants.
5. `SPEC/04_UI_DESIGN_SYSTEM.md` — production interpretation of the approved design.
6. Open the actual design files:
   - `DESIGN/source_unpacked/ШАГИ - R1 Design.dc.html`
   - `DESIGN/source_unpacked/ВЕКТОР - CJM.dc.html`
7. Then backend/security/testing/devops/release documents under `SPEC/`.

## Source-of-truth priority

When sources disagree, use this order:

1. `SPEC/01_PRODUCT_BEHAVIOR_R1.md`
2. `SPEC/02_DATA_MODEL_SYNC.md`
3. `SPEC/03_BACKEND_API.md`
4. `SPEC/04_UI_DESIGN_SYSTEM.md`
5. `SPEC/00_MASTER_IMPLEMENTATION_TZ.md`
6. `SPEC/07_RELEASES_FUTURE.md`
7. `SOURCE/PRODUCT_SPEC_v4.0_FINAL.md`
8. Current Design v2 files under `DESIGN/`

`VALIDATION/14_DESIGN_V2_DELTA.md` explains deliberate changes introduced after Design v2 and is useful when reconciling visual prototypes with normative behavior.

## Critical implementation rules

- **R1 has NO voice input and NO Vector dependency.** Vector is R3 only.
- The Design v2 Vector CJM is still included because architecture must not block R3.
- Design HTML is a visual/interaction handoff, **not production DOM/code architecture**.
- Do not implement showcase chrome, fake phone/status bars, design-runtime scripts, or comparison themes as app UI.
- Do not resurrect older specs/designs from elsewhere. This package is self-contained.
- If an implementation choice conflicts with a normative requirement, the normative requirement wins.
- If a requirement truly has no answer in this package, create an ADR/question; do not silently invent incompatible behavior.
- Any deviation from the specified architecture/behavior must be documented in an ADR in the same change.

## Included original user design ZIP

`DESIGN/ШАГИ-handoff_design_v2.zip` is the **original ZIP supplied by the user, byte-for-byte copied into this package**. It is kept both intact and unpacked for convenient agent access.

## Recommended first engineering step

Before coding features, create the repository skeleton and copy these frozen specs into `docs/spec/`. Then implement E00→E21 from `SPEC/09_IMPLEMENTATION_PLAN.md`, keeping tests and docs in the same PR/iteration as behavior changes.
