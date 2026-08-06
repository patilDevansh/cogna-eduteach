# Cogna MVP 9.0.1 — Skipped

> Living log for MVP 9.0.1 (Phase A / A2 / B1) deferrals. Do not silently drop scope.
> Plan: [`BUILD_PLAN.md`](./BUILD_PLAN.md) · B1: [`BUILD_PLAN_B.md`](./BUILD_PLAN_B.md) · Curriculum reference: [`docs/diagnostic-microskill-slice/micro-skill-catalogue.md`](../docs/diagnostic-microskill-slice/micro-skill-catalogue.md)

## Open Skips

### 9.0.1A — Slice items not seeded into the database

- **Reason:** Phase 1 lists extending `packages/database/prisma/seed.ts` with the slice's equation items. Phase A's content is 5 fixed items plus deterministic template rendering, all held in `apps/api/src/engines/diagnostic-v2/diagnostic-v2-template-render.ts` and re-verified on use by `verifyRendered()`. Putting a handful of items in a seed file as well would create a second source of truth for the same five equations with no reader — `DiagnosticV2Attempt` stores the `itemKey` and the rendered prompt text, so a session is fully reconstructable without a content table.
- **Return when:** Phase B, when verifier + template coverage expands past a handful of items per topic and the bank genuinely needs versioned rows (the same point at which `DiagnosticV2Attempt` should start referencing a content row rather than a bare `itemKey`).
- **Spec refs:** `BUILD_PLAN.md` Phase 1, and its own note that Phase A's content is "not a fully versioned `Question` bank row … an acceptable gap for this phase, revisited in Phase B".

### 9.0.1A — No production auth on `/diagnostic-v2/*`

- **Reason:** The four new routes carry no auth guard, identical to the existing known gap on `/policy` and `/ai/shadow-gates`. `POST /diagnostic-v2/sessions` takes a `studentId` in the body, so anyone who can reach the API can start or read a session for any student. Fine for local and pilot use behind a private network; not acceptable on a public surface.
- **Return when:** Before this is exposed outside the team — wire the same guard the rest of the product adopts per `docs/mvp-2.0/PRODUCTION_AUTH.md`, and derive `studentId` from the authenticated principal rather than the request body.
- **Spec refs:** [`COGNA 5.0/SKIPPED.md`](../COGNA%205.0/SKIPPED.md) (the parallel `/policy` gap)

### 9.0.1A — Manual browser walkthrough of `/student/diagnostic-v2`

- **Reason:** Phase 9's original manual walkthrough was not performed by the backend workstream. **Update (A2 T5, 2026-08-04):** a live browser pass with `?debug=1` and real AI confirmed the debug panel (origins, AI stage/selector decisions) and the student-facing AI chip when AI chose the next item. Full human product walkthrough beyond that (every assistance path, decline UX polish) remains optional.
- **Return when:** Broader UX sign-off is needed before pilot; A2's AI-chip + debug-panel check is done.
- **Spec refs:** `BUILD_PLAN.md` Phase 9 · `BUILD_PLAN_A2.md` T5

### 9.0.1A — AI-fallback evidence weighting is recorded but not yet acted on

- **Reason:** `evidenceWeight()` halves an AI-graded observation via `AI_FALLBACK_WEIGHT_MULTIPLIER`, and that halved number is stored on every `MicroSkillEvidenceEventV2` row. But `computeMicroSkillStateUpdate()` derives status from *event counts*, not from weights, so an AI-graded `INVALID` currently moves a skill toward `LIKELY_GAP` at exactly the same strength as a deterministically graded one. The halving is therefore recorded but cosmetic. Redesigning the status formula now would change the discrete-status rules that every golden test in this phase certifies, for no benefit while nothing reads `weight`.
- **Return when:** Before anything starts reading `MicroSkillEvidenceEventV2.weight` — either a weighted status formula (which needs its own version constant and golden tests, not an edit to `computeMicroSkillStatus`) or the learned-policy work that consumes the evidence log. Until then, treat `weight` as recorded-for-later, not as an input to any decision.
- **Spec refs:** `apps/api/src/engines/diagnostic-v2/diagnostic-v2.formulas.ts`

### 9.0.1A — Two "I don't know"s skip the contrast probe

- **Reason:** Declining an item ends it after the second decline, but does not set `targetSkillFailed`, so `nextStagesAfter()` routes straight to the transfer check rather than to `NEG_DIST_CONTRAST`. That is deliberate: the contrast probe exists to tell a slip apart from a repeating error pattern, and a student who has said twice that they cannot start has produced no error pattern to disambiguate — they have been given the rule and then the full explanation instead. The cost is that the transfer item is served immediately after teaching, with no intermediate practice.
- **Return when:** Pilot data shows students routinely declining rather than attempting. At that point the right answer is probably a distinct "guided retry" stage rather than reusing the contrast probe, since the probe is a diagnostic instrument and not a practice item.
- **Spec refs:** `BUILD_PLAN.md` Phase 5

### 9.0.1A — AI-graded lines are not exercised in the canonical scenario test

- **Reason:** `diagnostic-v2-arun-negative-distribution.v1.spec.ts` asserts that evidence and route are identical with AI on and AI off. An AI-graded line breaks that comparison by construction — with AI on it produces evidence at half weight, with AI off it produces none — so the scenario script is deliberately kept fully parseable. The fallback path is covered instead by `diagnostic-v2-ai-grader.v1.spec.ts` (resolution, timeout, flag off, shadow mode, and every refused response shape) and by the `AI_FALLBACK` weight cases in `diagnostic-v2-evidence.v1.spec.ts`.
- **Return when:** A separate scenario spec is worth adding once real pilot data shows which unparseable lines students actually write — at that point the fixture should be a real one, not an invented one.
- **Spec refs:** `BUILD_PLAN.md` Phase 8

### 9.0.1A — Evidence is written for the step's primary micro-skill only

- **Reason:** A step records its supporting/prerequisite micro-skill ids on `DiagnosticV2Step.supportingMicroSkillIds`, but only the primary skill gets a `MicroSkillEvidenceEventV2` row. This is the catalogue's own rule ("a wrong final answer must not poison every skill the question touches"; prerequisites are "not automatically scored"), so in this slice `FND_SIGN_MUL_DIV` never accrues evidence even though every negative-distribution error implicates it.
- **Return when:** A later phase wants prerequisite-level inference — that needs its own weighting rule and its own golden tests, not a silent extra evidence row per step.
- **Spec refs:** [`docs/diagnostic-microskill-slice/micro-skill-catalogue.md`](../docs/diagnostic-microskill-slice/micro-skill-catalogue.md) §3

### 9.0.1A — Retention checks are scheduled against a stand-in concept id

- **Reason:** `RevisionQueueItem.conceptId` is required and the micro-skill catalogue has no concept-level counterpart. Each scheduled check therefore carries both the real `microSkillId` and the nearest existing concept (`LIN_DISTRIBUTE_NEG` → `P2_NEGATIVE_OPS`, and so on), so that if the existing concept-level revision loop ever picks the row up it degrades into a sensible concept revision rather than pointing at a concept that does not exist. Phase A only schedules these rows; nothing reads them yet.
- **Return when:** Phase B/C builds the delayed-check runner, which should filter on `microSkillId != null` and route those rows to the micro-skill diagnostic instead of the concept-level one.
- **Spec refs:** `BUILD_PLAN.md` "Deliberately deferred, not forgotten"

### 9.0.1A2 — Live AUTHOR rarely fires under “prefer templates”

- **Reason:** Selector system prompt (G1.3) instructs preferring a template whenever one fits. On the 2026-08-04 T5 live Arun run with real OpenAI, AUTHOR never appeared in `AiDecisionAuditLog` — only SELECTOR + INTERPRETER. Accept/reject authoring paths were confirmed via controlled harness instead (`AI_AUTHORED` accept; `CLAIMED_ANSWER_MISMATCH` reject with template fallback).
- **Return when:** Pilot data shows templates systematically miss a needed shape, or we add a forced-AUTHOR staging flag for observability drills. Until then, prefer-templates is working as designed.
- **Spec refs:** `COGNA 9.0.1/BUILD_PLAN_A2.md` T5 / G1.3

### 9.0.1B1 — AUTHOR deferred for the fraction grammar

- **Reason:** Templates-only until `fraction-linear-verifier` is green. AUTHOR needs that verifier anyway; enabling it earlier would reintroduce the A2 failure mode (model arithmetic wrong, no gate) on a new topic.
- **Return when:** B1.5 — after fraction goldens + adversarial reject cases pass; then reuse the A2 authored-item gate against the fraction verifier.
- **Spec refs:** `BUILD_PLAN_B.md` Decisions locked §1

### 9.0.1B1 — Remaining Topic 2 skills not in the B1 slice

- **Reason:** B1 is a thin vertical column (`FND_FRACTION_EQUIV`, `FND_FRACTION_OPS`, `LIN_CLEAR_FRACTIONS`, `LIN_SOLVE_FRACTIONS`). `FND_SIGN_ADD_SUB`, `FND_ORDER_OPS`, and `LIN_SOLVE_BRACKETS` stay catalogue-only.
- **Return when:** A later B1.x / B2 slice needs them as entry or glue skills with their own templates and first-invalid codes.
- **Spec refs:** `BUILD_PLAN_B.md` Out of scope

### 9.0.1B1 — Versioned Question bank rows still not introduced

- **Reason:** B1 still uses fixed items + template rendering (same as Phase A). Bank size is still a handful of shapes per track, not enough to justify a second source of truth in seed/`Question`.
- **Return when:** Template + fixed coverage across topics grows past the point where `itemKey` + rendered prompt is insufficient for content ops (same return as 9.0.1A seed skip).
- **Spec refs:** `BUILD_PLAN_B.md` Out of scope · open skip `9.0.1A — Slice items not seeded`

## Carried from the plan (already documented there, restated so nothing is lost)

- Elapsed/idle time per step (fatigue detection only, never mastery evidence) — Phase B or C.
- Breadth coverage across all 5 topics — later Phase B topics after B1.
- Execution and recording of the delayed retention check — Phase A schedules only.
- Parent/student report content — Phase D.
- Telemetry for the four `AssistanceLevelV2` levels this phase never produces (`GENERAL_PROMPT`, `LOCATION_HINT`, `MICRO_QUESTION`, `PARTIAL_WORKED_STEP`).
