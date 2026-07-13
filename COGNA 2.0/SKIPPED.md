# Cogna MVP 2.0 — Skipped

> Living log for MVP 2.0 deferrals. Do not silently drop scope.

## Open Skips

### V3 — `experiment_assignments` table / policy experiments

- **Reason:** MVP 2.0 freezes deterministic decision/recommendation rules. Experiment assignment and variant branching belong after pilot data and an analysis harness exist.
- **Return when:** MVP 3.0 experiment registry. Schema may keep an empty stub only if shared packages require it; no product writes or decision branching in MVP 2.0.
- **Note (2026-07-13):** Prisma `ExperimentAssignment` stub table exists for forward compatibility; still no writes or decision branching.
- **Spec refs:** [`docs/mvp-2.0/README_DATA_MODEL.md`](../docs/mvp-2.0/README_DATA_MODEL.md), [`docs/mvp-2.0/README.md`](../docs/mvp-2.0/README.md)

### V2+ — Mastery calendar decay

- **Reason:** Explicitly rejected for `mastery-formula-v2`. Forgetting is modeled via `retentionEstimate` only.
- **Return when:** If a future pilot requires calendar decay, introduce `mastery-formula-v3` with golden tests — never ad-hoc subtract-per-day in v2.
- **Spec refs:** [`docs/mvp-2.0/README_RULES.md`](../docs/mvp-2.0/README_RULES.md) §1

### V2 — Backend weekly-summary / revision-plan / fatigue emit (UI ahead)

- **Reason:** Web UI + client methods for parent weekly summary, revision plan, and `SUGGEST_BREAK` landed in parallel with backend. UI treats 404 as empty/unavailable states; smoke soft-passes missing endpoints.
- **Status (2026-07-13):** **Mostly closed on API** — `GET /parents/me/students/:id/weekly-summary`, `GET /students/:id/revision-plan`, `GET /students/:id/retention`, weekly report + email jobs, and `SUGGEST_BREAK` are live. CLI scenarios green. Keep open only until `pnpm test:smoke:ui:mvp2` hard-passes against this API.
- **Return when:** UI smoke hard-pass for weekly-summary / revision-plan / break payload.
- **Spec refs:** [`docs/mvp-2.0/README_SHARED_CONTRACTS.md`](../docs/mvp-2.0/README_SHARED_CONTRACTS.md), [`docs/mvp-2.0/README_PERSONALIZATION.md`](../docs/mvp-2.0/README_PERSONALIZATION.md)

### V2 — Item statistics refresh job

- **Reason:** Phase 2 diagnostic v2 shipped formulas + goldens first; `item_statistics` refresh job / discrimination scoring not wired this turn.
- **Return when:** Jobs worker refreshes `ItemStatistic` off hot path; golden coverage if Test Plan adds cases.
- **Spec refs:** [`docs/mvp-2.0/README_DATA_MODEL.md`](../docs/mvp-2.0/README_DATA_MODEL.md), [`docs/mvp-2.0/README_RULES.md`](../docs/mvp-2.0/README_RULES.md)

### V2 — Confidence-calibration-aware difficulty

- **Reason:** Decision priority v2 shipped fatigue/retention/transfer; calibration still informs profile only, not difficulty step size.
- **Return when:** Rules specify how `possibly_overconfident` / `possibly_underconfident` adjust INCREASE/DECREASE_DIFFICULTY; add golden.
- **Spec refs:** [`docs/mvp-2.0/README_PERSONALIZATION.md`](../docs/mvp-2.0/README_PERSONALIZATION.md), [`docs/mvp-2.0/README_RULES.md`](../docs/mvp-2.0/README_RULES.md) §3

## Pre-Declared Non-Goals

These are intentionally outside MVP 2.0 unless the spec is changed:

### V3 — LLM-Assisted Content Drafting

- **Reason:** Requires validation and review infrastructure first.
- **Return when:** MVP 3.0 content pipeline.

### V3 — Candidate Action Scoring / Experiments

- **Reason:** MVP 2.0 should freeze deterministic rules before testing learned/scored policy alternatives.
- **Return when:** MVP 3.0 experiment registry and analysis harness.

### V4 — Multi-Unit Curriculum Expansion

- **Reason:** Pilot should prove depth in Linear Equations before breadth.
- **Return when:** MVP 4.0 curriculum planning.

### V5 — Multi-Modal Animation / Video / Voice Teaching

- **Reason:** Requires content provider architecture, modality outcome measurement, and production design pipeline.
- **Return when:** MVP 5.0 full agentic platform.

### V5 — Learned Policy / Offline RL

- **Reason:** Needs pilot data and safety evaluation.
- **Return when:** MVP 5.0 research-grade decision engine.
