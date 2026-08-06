# MVP 9.0.1 — Phase A2: Real Selection Reasoning + Verifier-Gated AI Authoring

> Follow-on to [`BUILD_PLAN.md`](./BUILD_PLAN.md) (Phase A, complete).
> Plain-English overview: [`README.md`](./README.md) — **contains a factual error this plan corrects (see D1).**
> Use `~~strikethrough~~` when completed.

## Why this exists

Phase A shipped a working step-level diagnostic, but an audit found that what the code does and what the docs claim diverged. Two stated product goals are therefore only partly real:

**Goal 1 — AI picks the question that best helps this child, with solid reasoning.**
The *mechanism* is real (bounded choice, rejection not clamping, full audit trail). The *reasoning* is not: AI receives three integers per micro-skill and one sentence. It never sees what the child actually got wrong, never sees which items it has already shown them, and cannot distinguish "untested" from "tested and shaky."

**Goal 2 — when templates aren't enough, AI authors its own question.**
This does not exist. AI returns one of five template ids; ordinary code then renders the question from four hardcoded number pools. There is no AI-authored mathematics anywhere in the system.

This plan makes both goals real for the linear-bracket domain, and fixes three defects that block them.

### Why Goal 2 is possible now, without waiting for Phase B

The general blocker for AI authoring is per-topic, not universal: something must independently verify AI's maths before a child sees it. For this slice that verifier already exists — `linear-bracket-verifier.ts` parses and independently re-solves the `A(x±B)±C[=D]` grammar. So AI can author real equations *within a grammar we can prove correct*, today. Factorisation and quadratics still need their own solvers, which remains Phase B.

The bound to accept: **AI authors freely inside a checkable grammar; anything outside it is discarded, not shown.** That is the whole safety argument, and it only holds if the reject path is tested as hard as the accept path (see T3).

---

## Defects to fix first

These are prerequisites for Goal 1, not polish. Goal 1 cannot be evaluated while they stand.

### D1 — `README.md` overstates what AI does

`README.md` line 19 says AI "can write a brand-new question" and that code "checks the AI got the math right." Neither is true today, and it directly contradicts `BUILD_PLAN.md` line 11, which lists AI authoring as out of scope for Phase A.

- [x] ~~Rewrite README point 1 to describe what actually ships after this plan, and keep it accurate to the code at all times~~
- [x] ~~Add a line to `BUILD_CARE.md` (create if absent): *the plain-English README is a claim about the code; if they disagree, the README is the bug*

### D2 — Same session + same template returns an identical question

`renderTemplate()` is seeded on `${sessionId}:${templateId}` with no per-request component. When AI correctly decides "give this child another negative-bracket problem," they receive the **exact question they just saw**. Observed live: `Expand: -4(x - 2)` served three times consecutively in one run.

- [x] ~~Extend the seed to include a per-request discriminator (attempt ordinal, or count of items already served this session)~~
- [x] ~~Guarantee a *different* rendered instance, not merely a different seed — re-render on collision, up to a bounded number of tries, then fall back to a different template~~
- [x] ~~Cover with T1 (uniqueness ledger)~~

### D3 — Prior-session state silently leaks into the selector prompt

`microSkillStateV2.findMany({ where: { studentId } })` has no session filter, so a returning student's historical counts enter a diagnostic presented as a fresh read — unlabelled and unintended.

**Decision (owner-locked, 2026-08-04): option 3 — carry history across sessions, but label it `this session` vs `earlier` in the selector prompt so the model can weigh it.**

Reasoning: dropping earlier history (option 2) would throw away genuine personalization the product already stores and force every returning student through a blank slate. Leaving history unlabelled (option 1 / today's accidental behaviour) misrepresents a fresh diagnostic as if those counts happened just now. Labelling keeps the signal and makes the scope explicit — a test asserts both earlier and this-session lines appear with those exact labels, and fails if either is dropped or merged.

- [x] ~~Decide, write the decision and its reasoning into this file, then implement~~
- [x] ~~Whichever is chosen, make it explicit in the query and covered by a test that would fail if it silently changed~~

---

## Goal 1 — Give the selector something real to reason from

Today's prompt payload per skill: `right alone 2, wrong alone 1, right with help 0`.

### G1.1 — Send the actual evidence, not just counts

- [x] ~~Per micro-skill, include `status` (`UNKNOWN` / `EMERGING` / `DEVELOPING` / `RELIABLE` / `LIKELY_GAP`) — "never tested" and "tested twice, failed twice" must not look alike~~
- [x] ~~Include the most recent `firstInvalidActionDescription` for any failing skill — the verifier already computes precise text such as `"(-2)(-5) was evaluated as -10, but multiplying those two signs gives 10"`; today it is discarded before the model sees it~~
- [x] ~~Include `observedContextStrengths` / `observedContextGaps` (already stored, currently unused in the prompt)~~
- [x] ~~Include the active hypothesis label and confidence if one exists for the skill~~

### G1.2 — Tell it what has already been shown

- [x] ~~List every item already served **this session** (prompt text and template id), explicitly flagged as already seen~~
- [x] ~~State the rule plainly in the system prompt: never request a repeat of something already shown~~

### G1.3 — Tell it what the templates can and cannot do

Goal 2's trigger is "AI judges the templates insufficient." It cannot judge that while it only sees five opaque ids.

- [x] ~~For each template, include a one-line description of the shape and range it covers (e.g. `TPL_NEG_DISTRIBUTION: m(v − b) + c = d, m ∈ −2..−5, b,c small positive integers`)~~
- [x] ~~Instruct it to prefer a template whenever one fits, and to author only when it can state *what specifically* is missing from the available shapes~~

### G1.4 — Require the reasoning to cite evidence

- [x] ~~Reasoning must reference at least one observed fact (a skill status or a specific error), not a generic statement~~
- [x] ~~Keep the existing forbidden-term check; reasoning is internal-facing but must stay free of clinical/labelling language~~

---

## Goal 2 — Verifier-gated AI authoring

Add a third choice alongside the existing two.

```
EXISTING   → serve a pre-written item          (unchanged)
GENERATE   → render a template instance        (unchanged, D2-fixed)
AUTHOR     → AI writes the equation itself     (new)
```

### G2.1 — Contract

- [x] ~~Extend `DiagnosticV2SelectorChoice` in `packages/shared/src/contracts/diagnostic-v2.ts` with the `AUTHOR` variant: AI returns the equation string, its claimed solution, the micro-skill it targets, and why no template sufficed~~
- [x] ~~Hand-written `assert*Shape` guard, matching repo convention (no zod)~~
- [x] ~~AI's claimed answer is **never trusted** — it is compared against an independent re-solve, and a mismatch is a rejection, not a correction~~

### G2.2 — The verifier gate

Every authored item must pass all of these before it can be shown. Any failure discards it and falls back to a template or a pre-written item — never to showing it anyway.

- [x] ~~**Parses** under the supported grammar (`PARSE_FAILED` → reject)~~
- [x] ~~**Independently solvable** — re-solve from the printed string, ignoring anything AI asserted~~
- [x] ~~**AI's claimed answer matches** the independent re-solve~~
- [x] ~~**Non-degenerate** — no zero coefficient on the variable, no identity, no no-solution case~~
- [x] ~~**Integer solution** (this slice's scope; non-integer is out of grammar)~~
- [x] ~~**Actually targets the claimed skill** — a question tagged `LIN_DISTRIBUTE_NEG` must genuinely contain a negative multiplier on a bracket~~
- [x] ~~**Not a duplicate** of anything served this session~~
- [x] ~~**Voice-clean** — existing `containsForbiddenTerm` check on all displayed text~~

### G2.3 — Observability

- [x] ~~Log every rejection with its specific reason, at `warn`~~
- [x] ~~Record on the step/attempt whether the served item was pre-written, template-rendered, or AI-authored, so the debug panel and any later analysis can tell them apart~~
- [x] ~~Surface authored-vs-rendered in the `?debug=1` panel (the student-facing `AI` chip stays as-is — the child does not need this distinction)~~

### G2.4 — Cost and latency

- [x] ~~Authoring is a second model round-trip on top of selection; measure it and record it in the audit log like everything else~~
- [x] ~~If p95 for the authoring path exceeds the selector's budget, prefer templates by default and reserve authoring for genuinely uncovered cases — do not raise the student's wait to accommodate it~~

---

## Test plan

Existing Phase A tests (522 passing) must stay green throughout. Everything below is additive.

### What we want to see

1. A child who makes the canonical sign error is given a *different* problem targeting the same skill — never the same one twice.
2. AI's stated reasoning references something the child actually did.
3. An AI-authored question with wrong maths never reaches the student, and the run continues without a visible failure.
4. Turning AI off changes *who chose* and *how it is worded* — never whether an answer was marked right or wrong.

### T1 — Question-uniqueness ledger

The defect in D2 was invisible to the existing suite because no test looked across a whole run.

- [x] ~~Add a harness that drives a full session and records **every question served**: normalized prompt string, template id, item key, and authored/rendered/pre-written origin~~
- [x] ~~Assert: **zero duplicate prompt strings within a session**~~
- [x] ~~Assert: no template id is requested twice in a row without producing materially different numbers~~
- [x] ~~Run the same scenario across several sessions and assert the ledgers differ — otherwise the seed is still effectively fixed~~
- [x] ~~Print the ledger on failure, so a regression shows exactly which question repeated and when~~

### T2 — Wrong answers, not just right ones

Phase A's scenario test walks a mostly-correct path. Real diagnostic value is in the failure branches, so each of these needs an explicit case with an asserted expectation.

For `-2(x - 5) + 3 = 11`:

| Submitted line | What it represents | Must produce |
|---|---|---|
| ~~`-2x + 10 + 3 = 11`~~ | ~~correct~~ | ~~`VALID`, positive evidence, no assistance~~ |
| ~~`-2x - 10 + 3 = 11`~~ | ~~sign lost on second term (canonical)~~ | ~~`INVALID`, first-invalid names the sign product, evidence on `LIN_DISTRIBUTE_NEG` only~~ |
| ~~`-2x - 5 + 3 = 11`~~ | ~~multiplier applied to first term only~~ | ~~`INVALID`, distinct from the sign error — must not be conflated~~ |
| ~~`-2x + 10 = 11`~~ | ~~dropped the `+3`~~ | ~~`INVALID`, does not create sign-error evidence~~ |
| ~~`2x - 10 + 3 = 11`~~ | ~~outer sign dropped entirely~~ | ~~`INVALID`~~ |
| ~~`x = -2`~~ | ~~final answer with no working~~ | ~~low-resolution evidence only; must not credit hidden steps~~ |
| ~~`um i think ?? x`~~ | ~~unparseable~~ | ~~`PARSE_FAILED` → AI grader path, never `INVALID` by default~~ |
| ~~*(I don't know)*~~ | ~~decline~~ | ~~zero-weight `SKIPPED`, skill stays `UNKNOWN`, no AI grader call~~ |

Also required:

- [x] ~~**Right answer, wrong reason** — a valid line reached by an invalid intermediate step must not silently credit the skill~~
- [x] ~~**Self-correction** — wrong line, review opportunity, corrected line: scores as self-corrected, not as clean independent success~~
- [x] ~~**Assisted success** — correct only after a rule prompt: recorded as assisted, never as independent~~
- [x] ~~**Error then recovery** — a later correct attempt must not erase a `LIKELY_GAP` established by two prior failures~~
- [x] ~~**Evidence containment** — after any wrong step, assert that skills *not* implicated by that step are unchanged. This is the single most important assertion in the suite: it is what stops one mistake poisoning the whole profile.~~

Covered by `apps/api/test/golden/diagnostic-v2-wrong-answer-matrix.v1.spec.ts`. Verifier now distinguishes `OUTER_SIGN_DROPPED` and `OUTER_CONSTANT_DROPPED` from `NEGATIVE_SIGN_PRODUCT` / generic bracket blame.

### T3 — AI-authoring rejection (safety-critical)

The accept path is easy; the reject path is the entire safety argument. Each case stubs the model to return specific bad output and asserts the item is discarded and the session continues.

- [x] ~~Claimed answer does not match an independent re-solve~~
- [x] ~~Equation outside the supported grammar~~
- [x] ~~Degenerate (`0x + 3 = 3`, identity, no-solution)~~
- [x] ~~Non-integer solution~~
- [x] ~~Tagged skill not actually exercised by the equation~~
- [x] ~~Duplicate of a question already served this session~~
- [x] ~~Malformed JSON / missing fields~~
- [x] ~~Forbidden term in displayed text~~
- [x] ~~Timeout mid-authoring~~
- [x] ~~**In every case: a valid question is still served and the student sees no error**~~

### T4 — AI on vs AI off

- [x] ~~Extend the existing equivalence test to the new paths: with AI fully off, every deterministic fact (validity, evidence kind and weight, skill status, route taken) must be identical to the AI-on run~~
- [x] ~~Assert the AI-on run genuinely called the model, and the AI-off run made zero calls~~

### T5 — Live walkthrough

Automated tests use a stubbed model. At least one run must use the real one.

- [x] ~~Drive a full session end to end with real AI enabled; capture the question ledger and confirm no repeats~~ (HTTP Arun path, 5 unique prompts, 0 duplicates; OpenAI live)
- [x] ~~Read the `AiDecisionAuditLog` rows and confirm every call recorded rule baseline, AI output, served flag, and latency~~ (7 rows: 4 SELECTOR + 3 INTERPRETER; every row had `ruleOutput` + `latencyMs`; served true/false as expected)
- [x] ~~Confirm at least one authored question was accepted, and — by temporarily stubbing bad output — at least one rejected~~ (live AUTHOR did not fire — selector prefers templates per G1.3; accept + reject exercised via controlled harness: `AI_AUTHORED` accept and `CLAIMED_ANSWER_MISMATCH` reject with valid fallback)
- [x] ~~Confirm the student-facing screen shows the `AI` chip only when AI actually chose~~ (`?debug=1` browser: AI chip visible on AI-chosen `TEMPLATE_RENDERED` item; debug panel showed AI stage/selector decisions)

### How to check the work is done

```bash
pnpm --filter @cogna/shared build
pnpm --filter @cogna/api lint
pnpm --filter @cogna/web lint
pnpm --filter @cogna/api test
```

Done means all of the following, not just green tests:

- [x] ~~Existing suite still passes; T1–T4 green including former T2 DEFECT cases~~ (581/581)
- [x] ~~The T1 ledger shows zero repeated questions across a full run~~
- [x] ~~Every T3 rejection case is covered and passing~~
- [x] ~~`README.md` matches what the code actually does (D1)~~
- [x] ~~D3's session-scope decision is recorded in this file and enforced by a test~~
- [x] ~~A live walkthrough (T5) has been done, not just simulated~~
- [x] ~~No diffs outside the new/allowed files — the existing MVP 1.0–9.0 product remains untouched~~

---

---

## D4 — Minus lookalikes broke the diagnosis (found in post-A2 audit, fixed)

Found by adversarial testing after A2 was marked complete, not by the suite — nothing in the diagnostic-v2 tests exercised a non-ASCII character.

`tokenize()` folded `−` (U+2212) and `–` (en-dash), but two adjacent readers of the same raw text did not:

- `matchSingleBracket()` ran an ASCII-only regex on the un-normalized string. A unicode-minus equation parsed, solved, substituted and matched its claimed answer — then lost its bracket during first-invalid-action analysis. Effect: an authored item was rejected `SKILL_NOT_EXERCISED` despite being correct, and a unicode question served to a student would degrade `"(-2)(-5) was evaluated as -10, but multiplying those two signs gives 10"` into the generic `"this line does not have the same solution as the line above it"`.
- `normalizedQuestionKey()` did not fold at all, so `−2(x − 5) + 3 = 11` read as a different question from an already-served `-2(x - 5) + 3 = 11` and walked straight past the duplicate gate.

Neither failed loudly. Verdicts stayed correct; only diagnostic precision — the product's whole value — quietly drained away. LLMs emit U+2212 routinely, so the authoring path was the most exposed.

- [x] ~~Single exported `foldMinusLookalikes()` in `linear-bracket-verifier.ts`; every raw-text reader folds through it (`matchSingleBracket`, `normalizedQuestionKey`, `readClaimedSolution`, the tokenizer's own lookalike set)~~
- [x] ~~`diagnostic-v2-minus-lookalikes.v1.spec.ts` — 15 cases asserting the *diagnosis text and skill attribution* match across all three spellings, not merely VALID/INVALID~~
- [x] ~~Verified as real regression tests: **6 of 15 fail against the pre-fix code**, 15/15 pass after~~

**Lesson for later phases:** the duplicated knowledge was the defect. Three places independently decided what counts as a minus sign and one got it wrong. Any new raw-text reader must fold through the shared helper rather than re-deriving it.

---

## Out of scope

- Factorisation, identities, quadratics — those need their own verifiers (Phase B)
- Pre-generation/caching for instant selection (Phase C)
- LLM-assisted reports (Phase D)
- The unscored interface-practice item — a real gap found in the Phase A audit, tracked separately; the README currently claims it exists and it does not
