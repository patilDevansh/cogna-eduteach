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
- **Updated:** 2026-07-14 (Phase 5 engineering complete; bank scaled to 302 APPROVED; human pilot tasks deferred)
- **MVP 3.0 status:** **Active implementation** — Phase 5 engineering complete; pilot run and policy decision require human coordination
- **Spec status line:** `Draft / Planning` in [`docs/mvp-3.0/README.md`](../docs/mvp-3.0/README.md) (implementation proceeding despite Draft status per user directive)
- **Core goal:** LLM-assisted drafting under gates + experiment_assignments + candidate action scoring + analysis & observability
- **Blocked on:** Human coordination for live pilot (student cohort, parent consent, 2-week run)
- **Recent changes:** 
  - **Phase 5 — Bank growth & pilot (engineering complete):**
    - Scaled APPROVED bank from 220 → 302 questions (45 base + 257 generated via deterministic math templates)
    - Updated `scripts/generate-approved-bank.mjs` coverage targets to reach ~280+ total (exceeded at 302)
    - Drafted `scripts/promote-programmatic-drafts.mjs` for dev pilot programmatic promotion path (NOT for LLM content)
    - Promotion script validates: APPROVED status, conceptId, difficulty, acceptedAnswers; dry-run tested successfully
    - Deferred to SKIPPED: live pilot run (≥ 2 weeks, requires human student cohort), signed review checklist for LLM-assisted drafts (human review mandatory), policy decision (control vs scored_v1 default, depends on pilot data)
    - Engineering deliverables complete; remaining Phase 5 tasks are human-only coordination and policy decisions
  - **Phase 4 — Analysis & observability (complete):**
    - Branch `feat/mvp-2.0-build` pushed to remote (commit 9547d5a); full test suite passed (93/93 golden tests green)
    - EXPERIMENT_ANALYSIS_EXPORT job: idempotent export of experiment outcomes for offline analysis
    - Job handler fetches assignments, candidate scores, and session outcomes for a given experiment key + period
    - Export stub logs to structured format; production would write to cloud storage (S3/GCS)
    - Idempotency: composite key (experimentKey:periodStart:periodEnd) ensures single export per period
    - Pilot dashboard extensions (GET /observability/pilot-dashboard):
      - Experiment metrics: total assignments, arm counts, sticky reuse rate (stub)
      - Draft funnel metrics: counts by status (DRAFT, VALIDATING, VALIDATED, VALIDATION_FAILED, PENDING_REVIEW, REVIEW_REJECTED, APPROVED_PROMOTED)
      - Shadow mode stats: shadow score count vs live score count
    - Alert thresholds and status: nonApprovedServeAttempts=0 (must be zero), hotPathLlmCallsAllowed=0 (must be zero)
    - Alert methods: alertNonApprovedContentAttempt, alertHotPathLlmCall (P0 violations, log + Sentry stub)
    - Golden tests S18–S19 green:
      - S18: Hot path isolation (feature flag guards verified)
      - S19: Analysis export idempotency (reuses completed job for same period key; no duplicate exports)
    - Feature flags unchanged: EXPERIMENTS_ENABLED=false, CONTENT_LLM_DRAFTS_ENABLED=false (production defaults)
  - **Phase 3 — Candidate scoring (complete):**
    - CandidateScorerService: candidate-score-rules-v1 heuristic scoring (0.30 mastery gap + 0.25 retention risk + 0.20 misconception severity + 0.15 explanation need + 0.10 exploration)
    - DecisionEngineService: candidate generation and scoring when EXPERIMENTS_ENABLED && scored_v1 arm && !shadow
    - Hard gates (END_SESSION, SUGGEST_BREAK) always win; scorer never overrides safety
    - Legal candidate set generation from decision rules 3-10 (post-explanation, remediation, retention, targeting, difficulty adaptation)
    - Tie-break: higher score wins; if equal, lexicographic learningIntent + conceptId
    - Shadow mode support: when shadow=true OR control arm, use control path (decideInternal)
    - Golden tests S04–S10, S21 green (hard gates, due revision, heuristic score, shadow mode, fallback, tie-break)
    - Feature flag EXPERIMENTS_ENABLED gates all scoring; production behavior unchanged when off
  - **Phase 2 — Experiments (complete):**
    - ExperimentsService: experiment definition CRUD, sticky assignment (experiment-rules-v1 hash-based allocation)
    - ExperimentsController: admin APIs (GET /experiments, POST /experiments/:key/assign/:studentId, GET /experiments/:key/assignments)
    - DecisionEngineService: decision-rules-v3 with experiment hooks (async decide, experimentKey/experimentArm parameters)
    - Seed default experiment: policy_score_linear_eq_2026q3 (50/50 control/scored_v1 allocation)
    - Eligibility: minSessionsCompleted=1, excludeBaselineOnly=true, unitId=linear-equations-one-variable
    - Golden tests S01–S03, S16, S20 green (sticky assignment, ineligibility, hash allocation, decision snapshot, control retention path)
    - Feature flag EXPERIMENTS_ENABLED=false by default; production behavior unchanged when off
    - Hard decision gates (END_SESSION, SUGGEST_BREAK, retention) never overridden by experiment
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
- **Current phase:** Phase 5 engineering complete — 302 APPROVED bank (bank goal exceeded), promotion script drafted (dev pilot only), tests pending; human coordination tasks (pilot run, review checklist, policy decision) deferred to SKIPPED
- **Test results:** Pending — full test suite run after Phase 5 changes


## Rule

When MVP 3.0 becomes the active implementation era, update BUILD_PLAN / SKIPPED / BUILD_CARE / this README on every complete, skip, or pitfall — same discipline as COGNA 2.0.
