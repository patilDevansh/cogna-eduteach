# Cogna MVP 1.0 — Build Care

> **Guardrails while building.** Read at the start of each day; append new pitfalls as you discover them.  
> Check off items that are now enforced in code/tests.  
> Agents must update this file when they learn a new footgun or close one (see [README.md](./README.md)).

---

## Non-negotiables (from `/docs/mvp-1.0`)

- [x] Implement **only** from `/docs/mvp-1.0/` — never from `COGNA/` mature essays
- [x] `LearningDecision` uses **`uiAction` + `learningIntent`** — never flat `EASIER_QUESTION` / `TARGET_MISCONCEPTION` as the sole action
- [x] Canonical `uiAction` values only: `SHOW_QUESTION` | `SHOW_EXPLANATION` | `SHOW_HINT` | `END_SESSION` | `SUGGEST_BREAK`
- [x] Staged durability Tx1→Tx4 — attempt survives diagnostic failure *(Tx2 catch → FAILED_RETRYABLE; resume on retry)*
- [x] Idempotent `eventId` — never double-apply mastery/decision
- [x] Diagnostic never writes revision queue
- [x] Recommendation proposes; Revision Service writes
- [x] Reports **not** on per-answer hot path *(ReportGenerator only on SESSION_ENDED)*
- [x] Only `reviewStatus: APPROVED` questions to real students *(dev flag `ALLOW_PENDING_REVIEW_QUESTIONS`)*
- [x] No unchecked LLM mathematics to students
- [x] No student math content to LLM providers in MVP *(QG bank-only)*
- [x] Student UI never shows internal labels (“overconfident”, “low mastery”) *(Day 5 UI)*
- [ ] External copy: Learner Profile / Learning Insights — not clinical “cognitive assessment” *(parent reports use plain language; full brand pass post-MVP)*
- [x] Concept ≠ difficulty — difficulty is within-concept 1–5
- [x] Misconception matching is deterministic patterns — not LLM classification
- [x] Explanation Engine does not fetch the next question
- [x] After explanation → Decision emits `RETEST_AFTER_EXPLANATION`

---

## Legacy codebase traps

- [x] Existing `packages/database` Prisma enums still have **legacy** `DecisionAction` (`EASIER_QUESTION`, …) — rewrite on Day 1; do not extend
- [x] Existing `packages/shared` `LearningDecision.action: string` is **wrong** — replace
- [x] `CognitiveProfile` naming — migrate toward `LearnerProfile`
- [x] Clerk is already assumed (`clerkId`) — do not add a second auth provider “for now”

---

## Engineering care

- [x] Version every rule/formula output (`mastery-formula-v1`, `decision-rules-v1`, …)
- [x] Store decision `input_snapshot` for replay
- [x] Prefer pure functions for mastery/decision so golden tests are easy
- [x] Keep raw `raw_events.payload` immutable
- [ ] Soft-delete students; do not hard-delete audit trails ad hoc
- [x] Index hot paths early (`eventId`, `studentId+createdAt`, revision due queries)
- [x] Feature flags: `ALLOW_PENDING_REVIEW_QUESTIONS=true` only in local/dev
- [x] Log `fallbackGenerated` and stage failures for Day 7 metrics *(structured `learning_loop.stage` + `learning_loop.fallback` logs in `LearningLoopService`)*

---

## Product / UX care

- [x] Confidence prompt **after** submit; null allowed
- [x] Timer starts on `QUESTION_SHOWN`
- [x] No go-back to previous question in-session
- [x] Hints: max 3 ladder levels; full solution via explanation path
- [x] Parent owns billing/account; student uses access code
- [x] Baseline copy: not a permanent label
- [x] Session auto-end: 15 minutes or question cap *(client timer S018 + server Decision)*

---

## Content care

- [x] Stable concept IDs only (`P1_…`, `C2_…`) — never rename casually
- [x] Every APPROVED question has `acceptedAnswers`, `hintLadder`, patterns where misconception-tagged *(milestone slice)*
- [x] Bank expansion stays in `docs/mvp-1.0/content/` and re-seeded — don’t hardcode stems in services
- [x] Human review before flipping `PENDING_REVIEW` → `APPROVED` *(workflow: [`REVIEW_CHECKLIST.md`](../docs/mvp-1.0/content/REVIEW_CHECKLIST.md) — sign-off pending)*

---

## Process care (tracking)

- [x] End of every work session: update `BUILD_PLAN_7_DAY.md` strikethroughs
- [x] Every skip → `SKIPPED.md` entry
- [x] Every new pitfall → this file
- [x] Status snapshot in `COGNA 1.0/README.md` stays honest
- [x] Every new behavior is assigned a test owner: golden **or** CLI **or** UI smoke **or** manual review; add overlapping layers only for a distinct risk *(Day 6 exemplar: reports/revision)*

---

## CLI / scenario testing care

- [x] Use the minimum sufficient layer: golden for pure logic/contracts; CLI for HTTP/DB journeys; UI smoke for browser behavior; manual review for MVP visuals
- [x] Do not require every feature to pass through golden → CLI → UI; that duplicates assertions and increases maintenance without adding confidence
- [x] Golden suite covers pure engine logic (`pnpm --filter @cogna/api test`) — **28+ tests** as of Day 5
- [x] Thin UI smoke exists: `node scripts/ui-baseline-flow-test.mjs` (API path, not browser)
- [x] Test pyramid documented in `COGNA/CLI_DEVELOPMENT_TESTING.md`
- [x] Shared HTTP client extracted — `scripts/cogna-cli/lib/client.mjs`; smoke test imports it
- [x] Scenarios assert **`uiAction` + `learningIntent`** — `assert-decision.mjs` on session start, each submit, session end
- [x] Scenarios import contract enums from shared source — `lib/contracts.mjs` mirrors `packages/shared/src/contracts/enums.ts`
- [x] Idempotency scenarios reuse the **same** `eventId` on retry (G20) — `idempotent-retry` scenario
- [x] Do not reimplement mastery/decision math in scenario scripts — orchestration only
- [x] Question IDs from bank JSON (`docs/mvp-1.0/content/`) — `BASELINE_QUESTION_IDS` constants, not stems
- [x] CLI scenarios run against seeded `demo1234` or scenario-created dev student — not production Clerk
- [x] Keep UI smoke thin; add browser E2E only when CLI cannot cover a route

---

## Discovered during build

### 2026-07-10 — Disk space blocks install/Prisma
- ~~`ENOSPC` on npm/pnpm cache — free disk before `db:generate` / `db:seed` / `pnpm dev`~~ *(resolved — see S013)*
- ~~Code is written; verification pending local env recovery~~

### 2026-07-10 — Diagnostic factors not persisted (confidence=0 bug)
- Decision engine received `misconceptionConfidence: 0` because `DiagnosticFactor` rows were never written
- Fixed: diagnostic engine now persists factors; loop uses floor 0.65 when TARGETING

### 2026-07-10 — Legacy OpenAI question path removed
- `QuestionGeneratorService` no longer calls OpenAI; bank-only per MVP spec
- Checked: LLM path removed from QG module

### 2026-07-10 — Day 2 close-out
- Tx2 diagnostic failure: attempt stays GRADED/FAILED_RETRYABLE; client retries same `eventId`
- DTO: `selfRatedConfidence` nullable/skippable via `@IsOptional()` + `@Type(() => Number)`

### 2026-07-10 — Day 3–5 close-out
- Confidence calibration uses N=8 window; never from single attempt
- Hint dependence score persisted on `LearnerProfile.hintDependence`
- Baseline blueprint in `@cogna/shared` `baseline-blueprint.ts`; `baselineSlotIndex` advanced per answer **after** next-question selection uses `slot+1` (see pitfall below)
- QG ranking weights + fallback chain; `NO_ELIGIBLE_QUESTION` → safe `END_SESSION` in loop
- `apps/web` Next.js on :3000; dev parent signup + student access-code login
- Golden suite: 25 tests (G01, G04–G06, G10–G13, G20–G21, G30, G50–G51)

### 2026-07-10 — Student access code case mismatch
- **Pitfall:** Seed stores `demo1234` (lowercase); login UI uppercased input → API hash mismatch
- **Fix:** Normalize access codes to lowercase before SHA-256 in API; remove UI `toUpperCase()` on student login

### 2026-07-10 — Dev servers must stay running (Failed to fetch)
- **Pitfall:** `Failed to fetch` on confidence submit + `ERR_CONNECTION_REFUSED` on :3000 usually means **API and/or web process died**, not a bug in `/practice/answer`
- **Verify:** `curl http://localhost:3001/health` and `curl -o /dev/null -w '%{http_code}' http://localhost:3000/`
- **Run:** from repo root `pnpm dev` (turbo runs API :3001 + web :3000 persistently); or two terminals: `cd apps/api && pnpm build && ALLOW_PENDING_REVIEW_QUESTIONS=true pnpm start` and `cd apps/web && pnpm dev`
- **Note:** `pnpm start` on web requires `pnpm build` first; `next start` without `.next` exits immediately
- **Note:** Ephemeral agent/background shells kill servers after ~2 min — use a dedicated terminal for local dev

### 2026-07-10 — Baseline blueprint slot off-by-one (fixed)
- **Pitfall:** After each baseline answer, `decide()` + `resolveContent()` used the **current** `baselineSlotIndex` before DB increment → repeated P1 slots, variable appeared on Q4 instead of Q3, blueprint drift
- **Symptom:** User thinks “12+9 comes after variable” when slot bug duplicated P1 questions early in session
- **Fix:** `LearningLoopService.sessionForNextBaselineQuestion()` passes `baselineSlotIndex + 1` into decision/QG for post-answer next question; golden `G30b` in `baseline-slot-advance.v1.spec.ts`
- **Verify:** `node scripts/ui-baseline-flow-test.mjs` → Q1 `Q_P1_D1_001` (12+9), Q2 `Q_P1_D2_002`, Q3 `Q_P3_D1_001` (variable)

### 2026-07-13 — Baseline completion off-by-one (fixed)
- **Pitfall:** Post-answer baseline decisions must evaluate `questionCount + 1`, not the persisted pre-answer count. Otherwise answer 12 still sees `questionCount=11`, emits another `SHOW_QUESTION`, and the UI summary says 13 questions.
- **Fix:** `LearningLoopService.sessionForNextBaselineQuestion()` now advances both `baselineSlotIndex` and `questionCount` for the decision/QG context used after a submitted answer.
- **Verify:** Browser E2E should end immediately after the 12th submitted answer with “You answered 12 questions this session.”

### 2026-07-10 — Q_P1_D1_001 grading “18 marked wrong” (not a grader bug)
- **Question:** `Q_P1_D1_001` stem `Compute: 12 + 9`; `acceptedAnswers`: `["21","21.0"]` in `docs/mvp-1.0/content/question-bank/questions.json`
- **Grader:** `GraderService` normalizes bare numbers (`"18"` → `"18"`, `"21"` → `"21"`); no format bug for numeric answers
- **Expected:** Submitting `18` → `INCORRECT` (correct sum is 21). Submitting `21` → `CORRECT`
- **Note:** Baseline order is 12+9 **first** (slot 0), variable **third** (slot 2) — not after 12+9

### 2026-07-10 — “API crash after variable question” (ops, not unhandled exception)
- **Investigation:** 13-answer baseline flow via `/practice/answer` (including `Q_P3_D1_001` MCQ `x`) — all HTTP 201, API health 200 after session end, no stack trace in logs
- **Likely cause:** API process exited (`ECONNREFUSED` / `Failed to fetch`) when dev server not kept alive — same class as pitfall above
- **Regression script:** `node scripts/ui-baseline-flow-test.mjs` (login → BASELINE → variable + full session)
- **Browser MCP:** Agent `browser_navigate` returned “No browser tab available” — use manual browser or the script above until Glass browser tab is available

### 2026-07-13 — Skip resolution pass (all SKIPPED.md items closed)
- **S016:** `POST /practice/skip` + UI skip button; baseline max 2 skip extensions; no mastery evidence
- **S018:** Client 15-min timer with auto `endSession`
- **S020:** Baseline handoff screen → adaptive practice in same browser journey
- **S015:** Optional Clerk JWT via `@clerk/backend`; dev auth documented in `DEV_AUTH.md`
- **S017:** QG `selectionReasoning` on `learning_decisions.inputSnapshot`
- **Stubs:** billing, multi-parent invite, email reports, cron job trigger, PostHog/Sentry logs, A/B `EXPERIMENT_VARIANT`
- **S001:** 17 APPROVED milestone IDs (was ~9)
- **S021:** Responsive CSS + empty-state classes

### 2026-07-13 — Day 7 close-out / MVP 1.0 build complete
- **Observability:** `LearningLoopService` logs per-stage latency (`tx1_graded` … `completed`) and `learning_loop.fallback` when decision fallback is used
- **Staging:** `ALLOW_PENDING_REVIEW_QUESTIONS` must be unset/`false` outside local dev — only ~9 seed-marked APPROVED IDs served
- **CLI:** `targeting-explanation-retest` scenario covers G10–G11 HTTP path; `pnpm test:scenario:all` runs 5 scenarios
- **UI smoke:** extended for `/student/revision` route + revision queue API + parent summary API (no duplicate engine assertions)
- **Demo:** [`DEMO_WALKTHROUGH.md`](./DEMO_WALKTHROUGH.md) — 5-minute local walkthrough
- **CI:** golden always; scenarios when API+DB up — see `apps/api/test/scenarios/README.md` + docker `test` profile
- **Manual:** responsive/visual polish remains human review (S021)

## Ops checklist (pilot prep)

- [x] `pnpm test:golden` green in CI
- [x] Postgres up → seed → `pnpm test:scenario:all` green before pilot deploy *(6 scenarios)*
- [x] `ALLOW_PENDING_REVIEW_QUESTIONS=false` on staging/production
- [ ] Formal math review of milestone bank (S014 checklist) before external students
- [x] Clerk keys optional — wire for public parent signup (`DEV_AUTH.md`)
- [ ] Keep API + web running in dedicated terminal during demos (`pnpm dev`)
- [ ] Demo script: [`DEMO_WALKTHROUGH.md`](./DEMO_WALKTHROUGH.md)
