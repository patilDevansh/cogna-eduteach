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
- [ ] Recommendation proposes; Revision Service writes *(Day 6)*
- [x] Reports **not** on per-answer hot path *(ReportGenerator only on SESSION_ENDED)*
- [x] Only `reviewStatus: APPROVED` questions to real students *(dev flag `ALLOW_PENDING_REVIEW_QUESTIONS`)*
- [x] No unchecked LLM mathematics to students
- [x] No student math content to LLM providers in MVP *(QG bank-only)*
- [x] Student UI never shows internal labels (“overconfident”, “low mastery”) *(Day 5 UI)*
- [ ] External copy: Learner Profile / Learning Insights — not clinical “cognitive assessment” *(Day 5+)*
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
- [ ] Log `fallbackGenerated` and stage failures for Day 7 metrics *(Tx2 failures return 503 FAILED_RETRYABLE)*

---

## Product / UX care

- [x] Confidence prompt **after** submit; null allowed
- [x] Timer starts on `QUESTION_SHOWN`
- [x] No go-back to previous question in-session
- [x] Hints: max 3 ladder levels; full solution via explanation path
- [x] Parent owns billing/account; student uses access code
- [x] Baseline copy: not a permanent label
- [ ] Session auto-end: 15 minutes or question cap *(server-side only; client timer deferred S018)*

---

## Content care

- [x] Stable concept IDs only (`P1_…`, `C2_…`) — never rename casually
- [x] Every APPROVED question has `acceptedAnswers`, `hintLadder`, patterns where misconception-tagged *(milestone slice)*
- [x] Bank expansion stays in `docs/mvp-1.0/content/` and re-seeded — don’t hardcode stems in services
- [ ] Human review before flipping `PENDING_REVIEW` → `APPROVED` *(S014 — milestone IDs seeded APPROVED without formal sign-off)*

---

## Process care (tracking)

- [x] End of every work session: update `BUILD_PLAN_7_DAY.md` strikethroughs
- [x] Every skip → `SKIPPED.md` entry
- [x] Every new pitfall → this file
- [x] Status snapshot in `COGNA 1.0/README.md` stays honest

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
