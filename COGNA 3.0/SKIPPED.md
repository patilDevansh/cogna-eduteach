# Cogna MVP 3.0 — Skipped

> Living log for MVP 3.0 deferrals. Do not silently drop scope.

## Open Skips (pre-declared into later eras)

### ~~Phase 1 — Manifest draft funnel metrics (completed in Phase 4)~~

- **Reason:** Core draft pipeline (create → validate → review → promote) is functional; funnel metrics observability deferred until pilot cohort generates real draft volume.
- **Completed in:** Phase 4 observability — pilot dashboard now includes draft funnel counts by status (DRAFT, VALIDATING, VALIDATED, VALIDATION_FAILED, PENDING_REVIEW, REVIEW_REJECTED, APPROVED_PROMOTED).
- **Spec refs:** [`docs/mvp-3.0/README_CONTENT_PIPELINE.md`](../docs/mvp-3.0/README_CONTENT_PIPELINE.md) (manifest.json funnel tracking)

### V4 — Multi-unit curriculum expansion

- **Reason:** MVP 3.0 deepens Linear Equations + assisted authoring before breadth.
- **Return when:** MVP 4.0 curriculum planning.
- **Spec refs:** [`docs/mvp-4.0/`](../docs/mvp-4.0/README.md)

### V5 — Learned policy / offline RL in default traffic

- **Reason:** MVP 3.0 uses deterministic heuristic scoring in experiments only.
- **Return when:** MVP 5.0 with safety evaluation harness.
- **Spec refs:** [`docs/mvp-5.0/`](../docs/mvp-5.0/README.md)

### V5 — Multi-modal animation / video / voice

- **Reason:** Requires modality providers and outcome measurement.
- **Return when:** MVP 5.0.
- **Spec refs:** [`docs/mvp-5.0/README_CONTENT_PIPELINE.md`](../docs/mvp-5.0/README_CONTENT_PIPELINE.md)

### V3 — Online contextual bandits

- **Reason:** Sticky A/B + offline analysis first; bandits need stronger guardrails.
- **Return when:** After first experiment analysis + safety review (may slip to 5.0).

### V2 carry — Mastery calendar decay

- **Reason:** Still rejected under `mastery-formula-v2`.
- **Return when:** Explicit `mastery-formula-v3` + goldens if ever required.

## Pre-Declared Non-Goals

- Unchecked LLM math to students
- LLM grading as source of truth
- Teacher dashboards (revisit MVP 4.0 visibility)
- Microservices rewrite
- Clinical labels
