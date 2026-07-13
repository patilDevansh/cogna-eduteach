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

### V2 — Web Clerk production keys (operational verify only)

- **Reason:** Web Bearer wiring landed (`parent-auth-headers.ts`, `ParentAuthProvider`, parent routes via `getToken()`). Dev mode without `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` still uses `X-Parent-Id` / demo-login / dev signup unchanged.
- **Return when:** Production Clerk keys configured + Bearer parent calls verified end-to-end in staging/prod.
- **Spec refs:** [`docs/mvp-2.0/PRODUCTION_AUTH.md`](../docs/mvp-2.0/PRODUCTION_AUTH.md)

### V2 — Full observability product dashboards + vendor alerts

- **Reason:** Pilot dashboard + `GET /observability/alert-thresholds` landed; latency percentiles and vendor dashboards remain stubs (PostHog/Sentry env-gated logs only).
- **Return when:** Latency instrumentation on Tx1–Tx4 + alert policy wired to real vendors for pilot ops.
- **Spec refs:** [`docs/mvp-2.0/README_OBSERVABILITY.md`](../docs/mvp-2.0/README_OBSERVABILITY.md)

### V2 — Content review checklist signed (human)

- **Reason:** Review API + programmatic 220 APPROVED bank landed; external pilot still needs a human-signed checklist (math/pedagogy owner).
- **Return when:** Content review owner signs [`docs/mvp-2.0/content/REVIEW_CHECKLIST.md`](../docs/mvp-2.0/content/REVIEW_CHECKLIST.md).
- **Spec refs:** [`docs/mvp-2.0/README_CONTENT_PIPELINE.md`](../docs/mvp-2.0/README_CONTENT_PIPELINE.md), Phase 6 BUILD_PLAN

## Closed

### Closed — MVP 2.0 engineering verification

- **Closed 2026-07-13:** Golden (68/68), all CLI scenarios, MVP 2.0 UI smoke, content validation, API build, and web type-check pass. Baseline scenario now creates an isolated student and validates blueprint concepts rather than fixed bank IDs.

### Closed — Expand question bank to ~200 APPROVED

- **Closed 2026-07-13:** 220 APPROVED (45 base + 175 generated) via `scripts/generate-approved-bank.mjs` / `pnpm content:generate-bank` → `docs/mvp-2.0/content/question-bank/generated-questions.json`. Manifest `targetApproved` met for programmatic bank. Human checklist sign-off remains open above.

### Closed — Content review records / checklist workflow API

- **Closed 2026-07-13:** `POST /content/review/:questionId` writes `ContentReview` and updates question `reviewStatus`. Signed human checklist still open (Phase 6).

### Closed — Demo parent login for local walkthrough

- **Closed 2026-07-13:** `POST /parents/dev/demo-login` + seeded demo parent; web **Use demo parent** calls demo-login (not `devSignup`). Documented in [`DEMO_WALKTHROUGH.md`](./DEMO_WALKTHROUGH.md).

### Closed — Backend weekly-summary / revision-plan / fatigue emit (UI was ahead)

- **Closed 2026-07-13:** Endpoints and decision emit landed. UI smoke soft-passes empty 404 data only (not missing routes). Re-run `pnpm test:smoke:ui:mvp2` after generating a weekly report for a parent-linked student to harden weekly step to hard PASS.

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
