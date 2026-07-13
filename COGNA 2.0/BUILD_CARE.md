# Cogna MVP 2.0 — Build Care

> Guardrails for building MVP 2.0 without losing the safety and replayability of MVP 1.0.

## Non-Negotiables

- [x] ~~Implement from `/docs/mvp-2.0/` only once spec is frozen~~
- [x] ~~Preserve `LearningDecision.uiAction + learningIntent` (documented)~~
- [x] ~~Keep raw events immutable (documented)~~
- [x] ~~Keep `eventId` idempotency (documented)~~
- [x] ~~Serve only APPROVED content to students outside local dev (documented)~~
- [ ] No unchecked LLM math
- [ ] No clinical/attention/personality labels
- [x] ~~Weak evidence must abstain (documented in Rules + Contracts)~~
- [x] ~~Reports separate observation from inference~~ (weekly templates; weak evidence → "still gathering evidence")
- [x] ~~Every new factor has formula, confidence, minimum evidence, version, tests (Rules + Test Plan)~~

## Spec Freeze Care (docs)

- [x] ~~Mastery formula carries MVP 1.0 weights/constants; no silent calendar decay~~
- [x] ~~Confidence calibration N=8 documented~~
- [x] ~~Full remediation state machine carried~~
- [x] ~~Baseline policy carried from mvp-1.0~~
- [x] ~~`alternativeExplanationDominant` deterministic rule~~
- [x] ~~Recommendation terms defined (weakness, misconceptionSeverity, retentionRisk, …)~~
- [x] ~~`END_SESSION` (15 min / question limit) always beats `SUGGEST_BREAK` (~12 min fatigue)~~
- [x] ~~New intents require `packages/shared` migration before emit~~
- [x] ~~Keep concept IDs `P2_NEGATIVE_OPS`, `C6_SIMPLE_WORD_PROBLEMS`~~
- [x] ~~`jobs` table required for async durability~~
- [x] ~~`experiment_assignments` deferred to MVP 3.0~~

## Foundation Care (landed 2026-07-13)

- [x] ~~`packages/shared` LearningIntent + `*-v2` versions + additive event types~~
- [x] ~~Prisma additive models: Job, RetentionEstimate, ExplanationOutcome, ItemStatistic, ReportDelivery, ContentReview~~
- [x] ~~LearningDecision: `selectionReasoning`, `latencyMs` (inputSnapshot already present)~~
- [x] ~~ExperimentAssignment stub only — no product writes~~
- [x] ~~Decision engine v2 emits new intents on product paths (`RETENTION_REVIEW` | `TRANSFER_CHECK` | `BREAK_FOR_FATIGUE`)~~
- [x] ~~Programmatic 220 APPROVED bank via `pnpm content:generate-bank`~~ (human checklist sign-off still Phase 6)
- [x] ~~R14 `alternativeExplanationDominant` blocks TARGETING~~
- [x] ~~Calibration-aware difficulty caution for `possibly_overconfident`~~
- [x] ~~Pilot dashboard at `GET /observability/pilot-dashboard`~~
- [x] ~~Item statistics refresh off hot path (`POST /jobs/item-statistics/refresh`)~~

## Agentic Safety

- [x] ~~Engines are bounded specialists, not free-form agents~~ (deterministic rules; no free-form LLM policy)
- [ ] Any future LLM use has human review or validation gate
- [ ] No engine calls another engine directly without ownership review
- [ ] Every personalized action traces to evidence
- [ ] Every generated or assisted content item has review status

## Testing Care

- [x] ~~Golden for formulas and policies (G## + R01–R20 green)~~ (`pnpm test:golden` — 68 pass)
- [x] ~~CLI for API/DB journeys~~ (`pnpm test:scenario:all`; baseline fixture is isolated per run and asserts slot concepts, not unstable question IDs)
- [x] ~~UI smoke only for route and interaction wiring (`test:smoke:ui` + `test:smoke:ui:mvp2`)~~
- [x] ~~Content validation for bank quality~~ (`pnpm test:content`)
- [ ] Pilot metrics for real-world outcomes

## Product Care

- [x] ~~Student copy is encouraging and label-free (revision + break UI)~~
- [x] ~~Parent copy explains uncertainty (summary/weekly empty states)~~
- [x] ~~Workload caps protect children from over-practice~~ (R09)
- [x] ~~Break suggestions are supportive, not diagnostic~~
- [ ] Full bank quality beats feature breadth

## Pitfalls to Watch

- Turning "agentic" into unchecked LLM behavior
- Expanding subjects before the Linear Equations unit is pilot-proven
- Treating engagement signals as attention diagnosis
- Letting reports sound more certain than the data
- Adding dynamic content before review pipeline is strong
- Implementing mastery calendar decay instead of `retentionEstimate`
- Emitting `RETENTION_REVIEW` / `TRANSFER_CHECK` / `BREAK_FOR_FATIGUE` before shared enum migration
- Renaming concept IDs (`P2_INTEGER_MUL_DIV`, `C6_WORD_PROBLEMS`) instead of keeping mvp-1.0 IDs
- Suggesting a break after the hard session-end threshold
- Wiring experiment branching in MVP 2.0 via `experiment_assignments`
- Hard-failing the web UI when MVP 2.0 endpoints (`weekly-summary`, `revision-plan`) return 404 while backends land in parallel
- Showing raw concept IDs, mastery/fatigue clinical language, or engine reasoning to students
- Parallel agents editing the same `apps/api/src` file without ownership lanes (serialize shared contracts + prisma; split by directory)
- Treating seed APPROVED overrides or programmatic bank as signed content review — external pilot still needs human-approved checklist
- Emitting `SUGGEST_BREAK` after hard session-end (15 min / question limit) — END_SESSION must win
- **Use demo parent** must call `POST /parents/dev/demo-login` (seeded demo parent) — not `devSignup`, which creates a new empty parent
- Regenerating / expanding the APPROVED bank changes baseline question IDs — re-seed and re-check goldens / smoke after `pnpm content:generate-bank`
- [x] ~~Enforced: fatigue soft-break never above `END_SESSION` (R07/R08)~~
- [x] ~~Enforced: retention estimate rounded to 2dp for deterministic golden replay~~
- [x] ~~Enforced: item statistics refresh off hot path~~
- [x] ~~Enforced: confidence-calibration-aware difficulty~~
- [x] ~~Enforced: practice POSTs that require `@IsISO8601()` `clientTimestamp` (`answer`, `skip`, `explanation-viewed`) must send `new Date().toISOString()` — web `api.ts` defaults for `explanationViewed` + `requestHint` so Continue after explanation cannot omit it~~
- [x] ~~Enforced: parent API auth — Clerk Bearer via `buildParentAuthHeaders` when session exists; dev `X-Parent-Id` from `getParent()` when no publishable key; do not add Clerk middleware that blocks dev without keys~~
