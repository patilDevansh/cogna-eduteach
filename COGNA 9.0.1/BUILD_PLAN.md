# Cogna MVP 9.0.1 — Build Plan (Phase A: Micro-Skill Step Diagnostic Vertical Slice)

> Use `~~strikethrough~~` when completed.
> If deferred, log in `SKIPPED.md`.
> Spec sources: `COGNA_0.1_Claude_Code_Master_Prompt.md`, Work Order 02 (Diagnostic Question Factory), Work Order 03 (Adaptive Diagnostic System) — user-provided, not tracked in this repo.
> Curriculum reference: [`docs/diagnostic-microskill-slice/micro-skill-catalogue.md`](../docs/diagnostic-microskill-slice/micro-skill-catalogue.md).
> Plain-English overview of this phase: [`README.md`](./README.md).

This is **not** a continuation of `docs/mvp-1.0`–`mvp-9.0`'s concept-level, final-answer-only diagnostic mechanism. It is a new, additive diagnostic philosophy — step-by-step submission, micro-skill-level evidence, a seven-layer evidence model — built inside the same codebase, numbered 9.0.1 to mark it as the next thing being built, not a bigger version of the same mechanism. Whether it eventually replaces the mvp-1.0–9.0 mechanism is **undecided** — deferred until this phase produces a working system to evaluate against it.

The user's full target for this milestone family (MVP 9.0.1–10.0) is larger than what's built in this phase: a ~2,000-question bank spanning linear equations through quadratics, AI genuinely choosing the next question in a way that feels instant (pre-generated/cached, not synchronous per-request generation), AI able to author and self-verify entirely new questions when the template bank isn't sufficient, and an LLM-assisted final report for the student. That full scope is **not** built here — see "Sequencing" below.

## Sequencing (agreed before this plan)

- **(A) — this document.** One narrow, real, end-to-end vertical slice — negative distribution in linear equations, the canonical Arun scenario — with three real AI responsibilities, wired through real UI → API → Postgres. Proves the loop works before scaling it.
- **(B) — not yet planned.** Expand verifier + template coverage one topic at a time (brackets/fractions → identities → factorisation → quadratics). This *is* the "2,000 questions" work — the bottleneck is a verified solver per topic, not authoring volume.
- **(C) — verified next-item buffer:** [`BUILD_PLAN_C.md`](./BUILD_PLAN_C.md). ~~Pre-fetch a small verified buffer in the background while the student works the current question so AI-selected next items feel instant (not by making the model faster).~~ **C.v1 implemented** on Phase A base (process-local session Map, GENERATE-primary fill, consume-before-sync).
- **(D) — LLM-assisted reports:** [`BUILD_PLAN_D.md`](./BUILD_PLAN_D.md). ~~Polish student/parent report prose on top of deterministic `structuredData` + templates, with a numeric cross-check gate.~~ **D.v1 implemented** (LearningSession STUDENT/PARENT + weekly PARENT; INTERNAL template-only; DiagnosticV2-native = D.v2).

## Non-negotiable constraints for this phase

- Nothing in the existing `mvp-1.0`–`mvp-9.0` product is modified: no changes to `Attempt`, `Question`, `Concept`, `MasteryScore`, `GraderService`, the decision engine, or any existing route.
- The existing production grading hot path (`Attempt`/Tx1–Tx4) keeps its zero-LLM-calls invariant untouched. This phase's AI-grading-fallback is a new, separate hot path — a deliberate, scoped exception for this module only.
- Every AI capability reuses the existing `AiOrchestratorService` infrastructure (`apps/api/src/ai/`) — no new AI-calling mechanism, no new audit table, no new flag convention.
- Deterministic evidence (was this line mathematically valid) is always the ground truth. AI never overrides it — AI adds interpretation, selection, and fallback-grading on top of it.

## Data gathered in this phase

Every field below maps to a Prisma field named in Phase 1. Nothing here is new work — it's what the schema already captures, written out explicitly so scope stays deliberate, matching the source docs' "minimize collection" principle.

**Session context**
- `DiagnosticV2Session`: `studentId`, `status`, `currentStageId`, `stageHistory` (a log of what stage came next and why — rule or AI, and the AI's stated reasoning when present), `policyVersion`, `startedAt`, `endedAt`.

**Per question shown**
- `DiagnosticV2Attempt`: `itemKey`, `equationPrompt`, `status`, `createdAt`, `completedAt`. (Phase A's content is a small fixed set + template-rendered variants, not a fully versioned `Question` bank row like the existing product has — an acceptable gap for this phase, revisited in Phase B when the bank grows.)

**Per submitted line — the core of the model**
- `DiagnosticV2Step`: `stepIndex`, `previousLine`, `submittedLine` (+ normalized forms), `attemptedTransformation`, `validity`, `verificationSource` (rule vs. AI-fallback), `aiGraderConfidence`, `firstInvalidActionCode`/`Description`, `primaryMicroSkillId`, `supportingMicroSkillIds`, **`topicId`, `competencyFamilyId`** (looked up from the static catalogue — layers 2–3), **`contextModifierIds: string[]`** (layer 5 — this phase only ever populates `INDEPENDENT`/`ASSISTED` and `NEAR_TRANSFER`; the field is general-purpose, the vocabulary grows with later topics), `assistanceLevel`, `selfCorrectionOfStepId`, `verifierVersion`, `createdAt`. Only **completed, submitted** lines are stored — not every keystroke.

**Derived evidence and state**
- `MicroSkillEvidenceEventV2`: `microSkillId`, `topicId`, `competencyFamilyId`, `contextModifierIds`, `evidenceKind`, `weight`, `assistanceLevel`, `evidencePolicyVersion` — one append-only row per piece of evidence, never edited after the fact.
- `MicroSkillStateV2`: `status`, `evidenceCount`, `independentSuccessCount`, `independentFailureCount`, `assistedSuccessCount`, **`observedContextStrengths: string[]`, `observedContextGaps: string[]`** (per Master Prompt §10.2 — e.g. reliable on `INDEPENDENT`, not yet reliable on `NEAR_TRANSFER`), `lastEvidenceAt` — the running per-skill summary, always derivable by replaying the evidence events above.

Why `topicId`/`competencyFamilyId`/`contextModifierIds` are added now rather than deferred: they're cheap (static lookups + one string array), but skipping them isn't reversible later — a `DiagnosticV2Step` row written today without a context tag can never have that context retroactively recovered once written. The columns are added in Phase A; the *vocabulary* of context-modifier values stays intentionally small (only what this slice's content actually produces) and grows topic-by-topic in Phase B, same as every other versioned enum in this codebase.

**AI's own record of itself**
- `DiagnosticV2Hypothesis`: `microSkillId`, `hypothesisLabel`, `confidence`, `reasoning`, `source` (rule or AI), `childFacingSummary`.
- The existing `AiDecisionAuditLog` table (no schema change — reused as-is): one row per real AI call across all 3 capabilities, recording `ruleOutput`, `aiOutput`, `served`, `passed`, `failureReason`, `latencyMs`.

**Explicitly not collected in this phase**
- No keystroke-by-keystroke logging — only completed, submitted lines.
- No elapsed/response-time field anywhere in this schema — not stored, and therefore cannot be used as ability evidence (matches the source docs' explicit rule against using response speed as a mastery signal).
- No camera, microphone, or any biometric/behavioral sensor data.
- No self-rated confidence, learning-style, or personality data in this flow.
- No school marks, IQ, or clinical/diagnostic labels of any kind.
- Nothing is overwritten — a correction is a new row; the original stays immutable (same append-only principle already used elsewhere in this codebase).

**Deliberately deferred, not forgotten**
- Elapsed/idle time per step, for fatigue detection only (never as mastery evidence) — Phase B or C.
- Breadth-coverage tracking across all 5 topics — Phase B (this slice only touches 2 topics).
- Retention/delayed-check *execution and results* — Phase A only schedules a `RevisionQueueItem`; running and recording the actual delayed check is later.
- Parent/student report content — ~~D.v1 LearningSession polish shipped~~; DiagnosticV2-native remains **D.v2** ([`BUILD_PLAN_D.md`](./BUILD_PLAN_D.md)).
- Telemetry for the 4 assistance levels this phase doesn't exercise (`GENERAL_PROMPT`, `LOCATION_HINT`, `MICRO_QUESTION`, `PARTIAL_WORKED_STEP`) — the enum defines all 8, this phase only produces `NONE`/`REVIEW_OPPORTUNITY`/`RULE_PROMPT`/`FULL_EXPLANATION`.

## Phase 0 — Scope and content

- [x] ~~Confirm the 9-skill catalogue for this slice (`FND_SIGN_MUL_DIV`, `LIN_DISTRIBUTE_NEG`, `LIN_DISTRIBUTE_POS`, `LIN_COMBINE_LIKE`, `LIN_REMOVE_CONSTANT`, `LIN_REMOVE_COEFFICIENT`, `LIN_SOLVE_TWO_STEP`, `LIN_SOLVE_VARIABLE_BOTH`, `LIN_CHECK_SOLUTION`) against `docs/diagnostic-microskill-slice/micro-skill-catalogue.md`~~
- [x] ~~Confirm the slice's item set: two entry items (two-step, variable-both-sides), the negative-distribution target item, its contrast probe, and one transfer-check item~~

## Phase 1 — Data model (`packages/database/prisma/schema.prisma`, additive only)

- [x] ~~New enums: `StepValidityV2`, `StepTransformationV2`, `AssistanceLevelV2` (all 8 levels defined, 4 used), `MicroSkillStatusV2`, `DiagnosticV2SessionStatus`, `VerificationSourceV2` (`DETERMINISTIC`/`AI_FALLBACK`), `HypothesisSourceV2` (`RULE`/`AI`), `MicroSkillEvidenceKindV2`~~
- [x] ~~New models: `DiagnosticV2Session`, `DiagnosticV2Attempt`, `DiagnosticV2Step` (includes `verificationSource`, `aiGraderConfidence`, `topicId`, `competencyFamilyId`, `contextModifierIds`), `MicroSkillEvidenceEventV2` (same 3 layer-2/3/5 fields), `MicroSkillStateV2` (includes `observedContextStrengths`/`observedContextGaps`), `DiagnosticV2Hypothesis` — see "Data gathered in this phase" below for the full seven-layer mapping~~
- [x] ~~One additive nullable field on the existing `RevisionQueueItem`: `microSkillId String?`~~
- [x] ~~`pnpm db:push && pnpm db:generate`~~
- [ ] Extend `packages/database/prisma/seed.ts` with the slice's equation items

## Phase 2 — Shared contracts (`packages/shared/src/contracts/diagnostic-v2.ts`, additive)

- [x] ~~`MicroSkillId`, `AssistanceLevel`, `StepTransformation`, `StepValidity`, `VerificationSource`, `MicroSkillStatus`, `MicroSkillEvidenceKind` types~~
- [x] ~~The 3 AI response shapes with hand-written `assert*Shape` runtime guards (repo convention — no zod): `DiagnosticV2SelectorChoice`, `DiagnosticV2Hypothesis`, `DiagnosticV2GraderResult`~~
- [x] ~~Request/response DTOs for the 4 API routes~~
- [x] ~~New version constants in `versions.ts`: `STEP_VERIFICATION_RULES_V1`, `EVIDENCE_POLICY_MICROSKILL_V1`~~
- [x] ~~Export from `packages/shared/src/index.ts`~~

## Phase 3 — Deterministic core (`apps/api/src/engines/diagnostic-v2/`)

- [x] ~~`micro-skills.catalog.ts` — the 9-skill const array~~
- [x] ~~`linear-bracket-verifier.ts` — deterministic parser/verifier for the `A(x±B)±C[=D]` grammar: `verifyStepValidity()`, `classifyTransformation()`, `findFirstInvalidAction()`. Returns `PARSE_FAILED`/`AMBIGUOUS` distinctly from `INVALID`~~
- [x] ~~`diagnostic-v2.formulas.ts` — evidence weight table (including the new `AI_FALLBACK` verification-source tier), `computeMicroSkillStateUpdate()`~~
- [x] ~~`diagnostic-v2-template-render.ts` — parametric rendering + independent re-verification for the slice's item families (mirrors `template-render.service.ts` + `content-verifier.service.ts`), used later by the AI selector's generate path~~

## Phase 4 — Three AI responsibilities (`apps/api/src/engines/diagnostic-v2/`, each on `AiOrchestratorService`)

- [x] ~~`diagnostic-v2-ai-selector.service.ts` — capability `DIAGNOSTIC_V2_SELECTOR`. Picks from the legal candidate list, or requests generation of a new instance (routed through `diagnostic-v2-template-render.ts`, never served unless independently re-verified). Bounds-checked like `question-recommender` — an out-of-range or unknown choice is rejected, never clamped~~
- [x] ~~`diagnostic-v2-ai-interpreter.service.ts` — capability `DIAGNOSTIC_V2_INTERPRETER`. Turns deterministic evidence into a hypothesis + child-facing summary. Forbidden-term-checked like `student-analysis`. Deterministic `MicroSkillStateV2` counters are never written by this service~~
- [x] ~~`diagnostic-v2-ai-grader.service.ts` — capability `DIAGNOSTIC_V2_GRADER`. Only called when the deterministic verifier returns `PARSE_FAILED`/`AMBIGUOUS`. Bounded timeout (2s), fails closed to still-`AMBIGUOUS` on any error/timeout/disabled flag~~
- [x] ~~Pure agreement functions for all 3 capabilities in `diagnostic-v2.formulas.ts` (rule-vs-AI comparison, same pattern as every existing agent)~~

## Phase 5 — Orchestration and API surface

- [x] ~~`diagnostic-v2-session.service.ts` — runs the verifier, then the AI selector, then (when relevant) the AI interpreter; writes everything durably~~
- [x] ~~`diagnostic-v2.controller.ts` — `POST /diagnostic-v2/sessions`, `POST /diagnostic-v2/sessions/:id/steps`, `GET /diagnostic-v2/sessions/:id` (debug view), `GET /diagnostic-v2/sessions/:id/summary`~~
- [x] ~~`diagnostic-v2.module.ts` — imports `AiModule`; register with one added import line in `app.module.ts`~~

## Phase 6 — Wiring into existing AI infrastructure

- [x] ~~Add `DIAGNOSTIC_V2_SELECTOR`, `DIAGNOSTIC_V2_INTERPRETER`, `DIAGNOSTIC_V2_GRADER` to `KNOWN_CAPABILITIES` in `apps/api/src/ai/shadow-gate-evaluator.service.ts`~~
- [x] ~~Add matching `case`s to `rowAgreement()` in `shadow-gate-evaluator.formulas.ts`~~
- [x] ~~Add `AI_DIAGNOSTIC_V2_SELECTOR_*`, `AI_DIAGNOSTIC_V2_INTERPRETER_*`, `AI_DIAGNOSTIC_V2_GRADER_*` flags to `.env.example` — defaulting `GENERATE=true, SERVE=true` (unlike every other capability in this repo, which defaults off — this slice is meant to genuinely serve, not sit shadow-only), gated only on `OPENAI_API_KEY` being set~~

## Phase 7 — Frontend

- [x] ~~`apps/web/src/app/student/diagnostic-v2/page.tsx` — standalone route, not wired into the existing practice page/nav. One line at a time, "Submit step" / "I don't know", accepted-step history~~
- [x] ~~`?debug=1` panel: shows rule-vs-AI source for every decision, AI's stated reasoning when present, and each step's verification source~~
- [x] ~~`?debug=1` "Why this question" for the current item (selectorDecision source + reasoning + origin); RULE fallback reasons included~~

## Phase 8 — Tests (`apps/api/test/golden/`)

- [x] ~~`diagnostic-v2-linear-bracket-verifier.v1.spec.ts`~~
- [x] ~~`diagnostic-v2-evidence.v1.spec.ts`~~
- [x] ~~`diagnostic-v2-ai-selector.v1.spec.ts`, `diagnostic-v2-ai-interpreter.v1.spec.ts`, `diagnostic-v2-ai-grader.v1.spec.ts` (mocked orchestrator — bounds rejection, fallback-on-timeout, forbidden-term rejection)~~
- [x] ~~`diagnostic-v2-arun-negative-distribution.v1.spec.ts` — full canonical scenario, run with AI on and with AI off, asserting evidence/route correctness is identical either way~~

## Phase 9 — Verification

- [x] ~~`pnpm --filter @cogna/api test` green (new + existing)~~
- [ ] Manual walkthrough of `/student/diagnostic-v2` in a browser, AI flags on, confirm `?debug=1` shows at least one AI-sourced decision
- [x] ~~`GET /ai/shadow-gates/DIAGNOSTIC_V2_SELECTOR` (and the other two) returns `INSUFFICIENT_DATA`, not an error — expected pre-launch~~
- [x] ~~Confirm zero diffs outside new files + the listed additive touch points~~

## Not in this phase (see Phase B–D above)

- The 73-skill catalogue / 125-template / 2,000-question bank
- Breadth coverage across all 5 topics; the general adaptive scoring formula from Work Order 03
- ~~Pre-generation/caching for instant AI-selected questions (Phase C)~~ — see [`BUILD_PLAN_C.md`](./BUILD_PLAN_C.md) (C.v1 shipped)
- ~~LLM-assisted report generation (Phase D)~~ — see [`BUILD_PLAN_D.md`](./BUILD_PLAN_D.md) (D.v1 LearningSession polish shipped; DiagnosticV2-native = D.v2)
- Any decision on replacing vs. running alongside the mvp-1.0–9.0 concept-based system
