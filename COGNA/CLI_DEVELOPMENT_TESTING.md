# CLI Development Testing — Cogna MVP 1.0

> **Purpose:** Run backend learning-loop flows from the terminal in parallel with UI work — fast, reproducible, contract-faithful.  
> **Spec:** `/docs/mvp-1.0/` only. **Execution tracking:** `/COGNA 1.0/`.  
> **This doc:** future architecture / engineering practice (lives in `COGNA/`). Do not treat it as an MVP contract override.

---

## Why CLI / backend testing

| Concern | Golden (unit) | CLI / HTTP scenarios | UI smoke |
|---|---|---|---|
| Speed | Fastest (~seconds) | Fast (~seconds–minutes) | Slow (browser, flaky) |
| Scope | Pure engine logic | Full API + DB durability | Layout + wiring |
| Best for | Formulas, state machines | End-to-end loop paths | “Can a human click through?” |
| CI cost | Low | Low–medium | Higher |

Professional teams keep **most** acceptance coverage in layers 1–2 and reserve UI for thin smoke. Cogna’s staged durability (Tx1→Tx4), idempotent `eventId`, and `LearningDecision` contracts are ideal for HTTP scenario tests — no browser required.

---

## Test pyramid for Cogna

```text
                    ┌─────────────────┐
                    │  UI smoke (thin) │  scripts/ui-baseline-flow-test.mjs
                    └────────┬────────┘
              ┌──────────────┴──────────────┐
              │  CLI / HTTP scenarios        │  scripts/cogna-cli
              │  apps/api/test/scenarios/    │
              └──────────────┬──────────────┘
        ┌────────────────────┴────────────────────┐
        │  Golden tests (pure / contract)          │  apps/api/test/golden/
        └─────────────────────────────────────────┘
```

**Rule:** A feature is not “done” until the right layer is green — not only when the screen looks right.

---

## What exists today

| Asset | Path | Role |
|---|---|---|
| Golden suite | `apps/api/test/golden/*.spec.ts` | G01, G04–G06, G10–G13, G20–G21, G30, G40–G42, G50–G51, G62 (+ G30b baseline slot) |
| Scenario index (CI) | `apps/api/test/scenarios/README.md` | Maps CLI scenarios → golden refs; CI policy |
| Test plan (cases) | `docs/mvp-1.0/README_TEST_PLAN.md` | Authoritative G01–G62 definitions |
| UI-equivalent smoke | `scripts/ui-baseline-flow-test.mjs` | Login → BASELINE → routes/revision/parent API checks |
| CLI harness | `scripts/cogna-cli/` | Shared client, `assertLearningDecision`, 5 scenarios |
| Shared contracts | `packages/shared/src/contracts/` | `LearningDecision`, events, baseline blueprint |
| API test script | `apps/api/package.json` → `pnpm test` | `node --import tsx --test test/golden/*.spec.ts` |

**Gap (resolved Day 7):** All core CLI scenarios live; CI policy in `apps/api/test/scenarios/README.md` + docker `test` profile.

---

## Target architecture

Two complementary locations (pick conventions once; both are valid):

### Option A — `scripts/cogna-cli/` (developer-facing)

```text
scripts/cogna-cli/
  package.json          # optional thin workspace; or root script only
  index.mjs             # entry: cogna scenario run <name>
  lib/
    client.mjs          # fetch wrapper, auth headers, health check
    assert-decision.mjs # assert LearningDecision shape from @cogna/shared
    uuid.mjs
  scenarios/
    baseline-12-slot.mjs
    targeting-explanation-retest.mjs
    idempotent-retry.mjs
```

**Pros:** Easy `node scripts/cogna-cli/index.mjs run baseline` from repo root; mirrors `ui-baseline-flow-test.mjs` but structured.

### Option B — `apps/api/test/scenarios/` (CI-facing)

```text
apps/api/test/scenarios/
  helpers/
    api-client.ts       # typed fetch against running API
    fixtures.ts         # studentId, seeded question IDs
  baseline.flow.spec.ts
  remediation.flow.spec.ts
```

Run with Node test runner (same as golden) or via `pnpm test:scenarios` — requires API + DB up (docker-compose or test profile).

**Recommendation:** Start with **Option A** for daily dev (fast feedback while building UI). Promote stable flows to **Option B** when you want them in CI with `docker-compose up`.

---

## Contracts to assert (never skip)

From `packages/shared` and `/docs/mvp-1.0/README_SHARED_CONTRACTS.md`:

1. **`uiAction`** — only: `SHOW_QUESTION` | `SHOW_EXPLANATION` | `SHOW_HINT` | `END_SESSION` | `SUGGEST_BREAK`
2. **`learningIntent`** — e.g. `TARGET_MISCONCEPTION`, `RETEST_AFTER_EXPLANATION`, `STANDARD_PRACTICE` (not flat `EASIER_QUESTION`)
3. **Durability** — duplicate `eventId` returns stored response; attempt survives Tx2 failure (`503` + `FAILED_RETRYABLE`)
4. **Version strings** — `decisionVersion`, `mastery-formula-v1`, etc. when present
5. **No legacy aliases** — reject / never emit `action: "EASIER_QUESTION"` (G62)

Import types from `@cogna/shared` in TypeScript scenarios; in `.mjs` scenarios, duplicate minimal assertion helpers that **import the same enum constants** from built shared package — do not hardcode divergent string lists.

---

## Step-by-step: build the harness

### 1. Shared HTTP client

Extract patterns from `scripts/ui-baseline-flow-test.mjs`:

- `API_URL` default `http://localhost:3001`
- `get(path)`, `post(path, body)` with JSON parse errors surfaced
- `loginStudent(accessCode)` → `{ studentId, token? }`
- `startSession(studentId, sessionMode)`
- `submitAnswer({ eventId, sessionId, questionId, ... })` — reuse field names from `AnswerSubmittedEvent` in `packages/shared`

### 2. Decision assertions

```javascript
// scripts/cogna-cli/lib/assert-decision.mjs (sketch)
const UI_ACTIONS = new Set([
  "SHOW_QUESTION", "SHOW_EXPLANATION", "SHOW_HINT", "END_SESSION", "SUGGEST_BREAK",
]);

export function assertLearningDecision(decision, { uiAction, learningIntent, params }) {
  if (!UI_ACTIONS.has(decision.uiAction)) {
    throw new Error(`Invalid uiAction: ${decision.uiAction}`);
  }
  if (uiAction && decision.uiAction !== uiAction) {
    throw new Error(`Expected uiAction ${uiAction}, got ${decision.uiAction}`);
  }
  if (learningIntent && decision.learningIntent !== learningIntent) {
    throw new Error(`Expected learningIntent ${learningIntent}, got ${decision.learningIntent}`);
  }
  if (params?.conceptId && decision.parameters?.conceptId !== params.conceptId) {
    throw new Error(`conceptId mismatch`);
  }
}
```

### 3. Scenario runner

- CLI: `node scripts/cogna-cli/index.mjs run <scenarioName>`
- Each scenario exports `async function run(client, assert)` returning `{ pass: boolean, steps: [] }`
- Exit code `0` / `1` for CI

### 4. Root / API scripts

Add to root `package.json`:

```json
"test:golden": "pnpm --filter @cogna/api test",
"test:scenario:baseline": "node scripts/cogna-cli/index.mjs run baseline-12-slot",
"test:smoke:ui": "node scripts/ui-baseline-flow-test.mjs"
```

Add to `apps/api/package.json` when scenarios land:

```json
"test:scenarios": "node --import tsx --test test/scenarios/*.spec.ts"
```

### 5. Fixtures

Place static JSON histories under `docs/mvp-1.0/test-fixtures/` (per test plan). Scenarios load fixture metadata; **live API** uses seeded `demo1234` student unless scenario creates its own parent/student via dev endpoints.

---

## Example commands (once harness exists)

```bash
# Terminal 1 — stack
pnpm db:push && pnpm db:seed
ALLOW_PENDING_REVIEW_QUESTIONS=true pnpm dev   # API :3001 + web :3000

# Terminal 2 — layers
pnpm test:golden                               # pure engines, no server
node scripts/ui-baseline-flow-test.mjs         # today’s thin smoke
node scripts/cogna-cli/index.mjs run baseline-12-slot
node scripts/cogna-cli/index.mjs run idempotent-retry
node scripts/cogna-cli/index.mjs run targeting-explanation-retest
```

---

## Example scenario structure

```javascript
// scripts/cogna-cli/scenarios/targeting-explanation-retest.mjs
export const name = "targeting-explanation-retest";
export const mapsTo = ["G10", "G11"]; // docs/mvp-1.0/README_TEST_PLAN.md

export async function run({ client, assert, uuid }) {
  const { studentId } = await client.loginStudent("demo1234");
  const { sessionId, next } = await client.startSession(studentId, "ADAPTIVE_PRACTICE");

  // Drive wrong answers on C2 sign-handling items until TARGET_MISCONCEPTION …
  // assertLearningDecision(res.next.decision, { uiAction: "SHOW_EXPLANATION", ... })
  // POST /practice/explanation-viewed
  // assert RETEST_AFTER_EXPLANATION
  // submit correct re-test → RESOLVED path
}
```

Keep scenario **orchestration** here; keep **math/decision rules** in engines only — scenarios must not reimplement mastery formulas.

---

## Workflow: assign the right test owner

Use this on every MVP behavior from Day 6 onward. One primary layer is normally enough; add another only when it proves a different boundary.

```text
1. Spec          → /docs/mvp-1.0/ (contract + README_TEST_PLAN case if new behavior)
2. Implement     → API / engines / UI
3. Classify      → logic/contract | HTTP/DB journey | browser behavior | visual polish
4. Test owner    → golden        | CLI scenario    | UI smoke         | manual review
5. Add overlap   → only for a distinct risk (for example, pure rule + persistence boundary)
6. Tracking      → BUILD_PLAN strikethrough, BUILD_CARE pitfalls, SKIPPED if deferred
```

**Example — skip control (when S016 is implemented):**

- Golden: event validation for `QUESTION_SKIPPED`
- CLI: `skip-question.mjs` — assert no mastery delta, next `SHOW_QUESTION`
- UI: button wired; one manual check or extend `ui-baseline-flow-test.mjs` with a single skip step

This example uses multiple layers because each proves something different: event rules, persisted API behavior, and button wiring. A CSS-only change would need manual review, not golden and CLI tests.

---

## Rules (do not duplicate logic)

| Do | Don’t |
|---|---|
| Import `@cogna/shared` types/enums | Copy `LearningDecision` shapes by hand in every file |
| Assert API responses match contracts | Reimplement grading or mastery in scenario scripts |
| Reuse `eventId` to test idempotency | Generate new `eventId` on “retry” when testing durability |
| Use seeded APPROVED question IDs from bank JSON | Hardcode stems in scenarios (IDs drift) |
| Keep scenarios short and named after G## or user journey | One 500-line mega-script |

---

## CI integration guidance

**Phase 1 (now):** CI job step `pnpm --filter @cogna/api test` — golden only, no Docker.

**Phase 2:** Add `docker-compose.yml` service profile `test`:

```yaml
# sketch — align with repo docker-compose.yml
services:
  api:
    environment:
      - ALLOW_PENDING_REVIEW_QUESTIONS=true
  test-scenarios:
    depends_on: [api, postgres]
    command: pnpm test:golden && node scripts/cogna-cli/index.mjs run all
```

**Phase 3:** Nightly or pre-pilot — full scenario matrix + `ui-baseline-flow-test.mjs` against ephemeral stack.

**Failure policy:** Golden failures block merge. Scenario failures block merge once harness is marked required in BUILD_PLAN Day 7.

---

## Mapping golden cases → scenarios

| Golden | Golden file (today) | Target CLI scenario |
|---|---|---|
| G01, G04–G06 | `diagnostic-mastery.v1.spec.ts` | (stay golden — pure math) |
| G10–G13 | `decision-state-machine.v1.spec.ts` | `targeting-explanation-retest` |
| G20–G21 | `durability.*.spec.ts` | `idempotent-retry`, `diagnostic-failure-resume` |
| G30, G30b | `decision-baseline.v1.spec.ts`, `baseline-slot-advance.v1.spec.ts` | `baseline-12-slot` |
| G50–G51 | `explanation-hint.v1.spec.ts` | `hint-ladder`, `explanation-viewed` |
| G41–G42 | (pending) | `session-end-summary` |
| G60–G62 | (pending) | `validation-errors`, `forbidden-ui-action-alias` |

---

## References

- MVP test plan: [`/docs/mvp-1.0/README_TEST_PLAN.md`](../docs/mvp-1.0/README_TEST_PLAN.md)
- Shared contracts: [`/docs/mvp-1.0/README_SHARED_CONTRACTS.md`](../docs/mvp-1.0/README_SHARED_CONTRACTS.md)
- Build plan (CLI tasks woven in): [`/COGNA 1.0/BUILD_PLAN_7_DAY.md`](../COGNA%201.0/BUILD_PLAN_7_DAY.md)
- Guardrails: [`/COGNA 1.0/BUILD_CARE.md`](../COGNA%201.0/BUILD_CARE.md)
- Existing smoke: [`/scripts/ui-baseline-flow-test.mjs`](../scripts/ui-baseline-flow-test.mjs)
- Golden tests: [`/apps/api/test/golden/`](../apps/api/test/golden/)

---

## Suggested implementation order

1. Extract `lib/client.mjs` + `lib/assert-decision.mjs` from `ui-baseline-flow-test.mjs`
2. Add `scenarios/baseline-12-slot.mjs` (parity with current smoke + explicit Q1/Q3 assertions)
3. Add `scenarios/idempotent-retry.mjs` (G20 HTTP integration with DB)
4. Wire root `package.json` scripts; document in BUILD_PLAN Day 7
5. Promote stable scenarios to `apps/api/test/scenarios/` for CI docker profile
