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
- **Updated:** 2026-07-13 (Phase 0 foundation)
- **MVP 3.0 status:** **Active implementation** — user promoted; Phase 0 foundation complete (contracts + schema)
- **Spec status line:** `Draft / Planning` in [`docs/mvp-3.0/README.md`](../docs/mvp-3.0/README.md) (implementation proceeding despite Draft status per user directive)
- **Core goal:** LLM-assisted drafting under gates + experiment_assignments + candidate action scoring
- **Blocked on:** None — Phase 0 foundation complete; ready for Phase 1
- **Recent changes:** 
  - Promoted to active implementation era; AGENTS.md updated
  - Added MVP 3.0 version constants (decision-rules-v3, candidate-score-rules-v1, etc.)
  - Added shared contracts: ExperimentDefinition, ExperimentAssignment, ContentDraft, CandidateActionScore
  - Updated DecisionParameters with experimentId, experimentArmId, candidateScoreId, draftOriginId
  - Activated ExperimentAssignment product writes (Prisma schema)
  - Added ExperimentDefinition, ContentDraft, CandidateActionScore tables (Prisma schema)
  - Added MVP 3.0 event types: EXPERIMENT_ASSIGNED, CANDIDATE_SCORED, CONTENT_DRAFT_*
  - Added feature flags: EXPERIMENTS_ENABLED, CONTENT_LLM_DRAFTS_ENABLED (default false)
  - Feature flag module created at apps/web/src/lib/feature-flags.ts
- **Current phase:** Phase 0 complete — 68/68 golden tests green; ready for Phase 1 content pipeline
- **Test results:** All MVP 2.0 golden tests (G##/R## regression baseline) passing with MVP 3.0 schema

## Rule

When MVP 3.0 becomes the active implementation era, update BUILD_PLAN / SKIPPED / BUILD_CARE / this README on every complete, skip, or pitfall — same discipline as COGNA 2.0.
