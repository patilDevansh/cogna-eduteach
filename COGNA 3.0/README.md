# Cogna 3.0 — Build Tracking

> Active implementation folder for MVP 3.0.  
> Spec: [`/docs/mvp-3.0/`](../docs/mvp-3.0/README.md) — **Draft / Planning** spec status (implementation proceeding per user directive).  
> Previous era MVP 2.0 is now **Complete** (`/docs/mvp-2.0/`, `/COGNA 2.0/`).

## Documents

| File | Purpose |
|---|---|
| [`BUILD_PLAN.md`](./BUILD_PLAN.md) | Phased plan (mostly unchecked) |
| [`BUILD_CARE.md`](./BUILD_CARE.md) | Guardrails |
| [`SKIPPED.md`](./SKIPPED.md) | Deferrals |
| [`REPO_AND_GITHUB.md`](./REPO_AND_GITHUB.md) | Pointer to shared repo ops |
| [`README.md`](./README.md) | Status snapshot |

## Status Snapshot

- **Created:** 2026-07-13
- **Updated:** 2026-07-13 (Phase 1 content draft pipeline)
- **MVP 3.0 status:** **Active implementation** — user promoted; Phase 1 core complete (draft pipeline)
- **Spec status line:** `Draft / Planning` in [`docs/mvp-3.0/README.md`](../docs/mvp-3.0/README.md) (implementation proceeding despite Draft status per user directive)
- **Core goal:** LLM-assisted drafting under gates + experiment_assignments + candidate action scoring
- **Blocked on:** None — Phase 1 core complete; Phase 2 (experiments + scoring) ready to start
- **Recent changes:** 
  - **Phase 1 — Content draft pipeline (core complete):**
    - ContentDraftService: create, validate, review, promote (DRAFT → VALIDATED → APPROVED_PROMOTED)
    - ContentValidationService: content-validation-rules-v1 (schema, canonical concept ID, difficulty, answer check, deny-list)
    - API routes: POST /content/drafts, /content/drafts/:id/validate, /content/drafts/:id/review, GET /content/drafts/:id, GET /content/drafts
    - Job stubs: CONTENT_LLM_DRAFT (LLM provider integration pending), CONTENT_VALIDATE (functional)
    - Golden tests S11–S15 green (LLM draft isolation, validation gates, promotion, canonical concepts, deny-list)
    - Feature flag CONTENT_LLM_DRAFTS_ENABLED gates LLM-assisted drafts; human/programmatic drafts always allowed
    - Only APPROVED_PROMOTED drafts reach production Question/Explanation tables
  - **Phase 0 — Foundation (complete):**
    - Promoted to active implementation era; AGENTS.md updated
    - Added MVP 3.0 version constants (decision-rules-v3, candidate-score-rules-v1, etc.)
    - Added shared contracts: ExperimentDefinition, ExperimentAssignment, ContentDraft, CandidateActionScore
    - Updated DecisionParameters with experimentId, experimentArmId, candidateScoreId, draftOriginId
    - Activated ExperimentAssignment product writes (Prisma schema)
    - Added ExperimentDefinition, ContentDraft, CandidateActionScore tables (Prisma schema)
    - Added MVP 3.0 event types: EXPERIMENT_ASSIGNED, CANDIDATE_SCORED, CONTENT_DRAFT_*
    - Added feature flags: EXPERIMENTS_ENABLED, CONTENT_LLM_DRAFTS_ENABLED (default false)
    - Feature flag module created at apps/web/src/lib/feature-flags.ts
- **Current phase:** Phase 1 core complete (manifest metrics deferred) — 73/73 golden tests green (45 suites); ready for Phase 2 experiments
- **Test results:** All MVP 2.0 golden tests (G##/R## regression baseline) + MVP 3.0 S11–S15 passing


## Rule

When MVP 3.0 becomes the active implementation era, update BUILD_PLAN / SKIPPED / BUILD_CARE / this README on every complete, skip, or pitfall — same discipline as COGNA 2.0.
