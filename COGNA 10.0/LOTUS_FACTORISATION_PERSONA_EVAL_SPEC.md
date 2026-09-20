# Lotus factorisation — synthetic-learner persona evaluation: foundation spec

**Status, 20 September 2026.** This document defines the persona catalogue and
the deterministic-wiring test harness that now exist at
`apps/api/test/fixtures/lotus-factorisation-personas.ts` and
`apps/api/test/golden/lotus-factorisation-personas.v1.spec.ts`. It is a
foundation for the later Playwright and live-model diagnostic-accuracy work
described in [`LOTUS_CONTINUOUS_DIAGNOSTIC.md`](./LOTUS_CONTINUOUS_DIAGNOSTIC.md)
§9 and the [60-persona QA plan](./LOTUS_FACTORISATION_60_PERSONA_QA_PLAN.md) —
it does not replace either. It does not modify `lotus.service.ts`,
`lotus-persistence.ts`, `lotus-reconcile.ts`, the student page, the shared
Lotus contracts, or `LOTUS_CONTINUOUS_DIAGNOSTIC.md` itself.

## What this proves, and what it does not

This suite drives `LotusService` through the exact same `start`/`answer` flow
the existing golden tests use, with a deterministic, free, no-network fake
model (`PersonaFakeModels`) standing in for the real writer/assessor/debater.
It proves **wiring and policy invariants**:

- no shown/pinned question ever changes after it was staged;
- no factorisation item is ever `HARDCODED_SYSTEM` provenance or non-AI
  origin;
- every answered turn carries an explicit, structured adaptive decision;
- an explicit "I don't know" is recorded as a support signal, not sent to a
  model, and never fabricates a model review;
- a targeted-check request lands near-term, not buried at Q24/Q25;
- the final report does not claim CONFIRMED or SUSPECTED for a skill with no
  underlying evidence, and does not claim NOT_TESTED_DEPENDENCY for a skill
  that was actually, directly evidenced.

It does **not** prove that a live model correctly diagnoses a real learner.
The declared "capability profile" per persona is enforced by
`chooseResponse()` reading the question's own diagnostics server-side (never
the redacted client payload) and mechanically picking a predicted-mistake
answer, a canonical answer, or "I don't know" — there is no model in the loop
making a judgment call, so nothing here measures the quality of a live
model's interpretation. That distinction matters: a green run here says the
*plan and evidence machinery* behaves correctly for a known input; it says
nothing about whether GPT-5.6 (or whichever model is configured) would
correctly diagnose an actual student's ambiguous, real handwriting-adjacent
answer.

## The persona catalogue

Ten personas, in `apps/api/test/fixtures/lotus-factorisation-personas.ts` as
`PERSONA_CATALOGUE`:

| Persona | Declared behavior | Skill / mistake targeted |
|---|---|---|
| P01 secure/advanced | Solves everything correctly | — |
| P02 numeric-HCF-only | Repeatable variable-common-factor error | `FAC_GCF_VARIABLE` / `TOOK_HIGHEST_POWER` |
| P03 variable-common-factor gap | Same skill, a different repeatable error | `FAC_GCF_VARIABLE` / `INCLUDED_NON_COMMON_VARIABLE` |
| P04 divides only the first term | | `FAC_DIVIDE_TERMS` / `DIVIDED_FIRST_TERM_ONLY` |
| P05 negative-factor/sign error | | `FAC_GCF_NEGATIVE` / `KEPT_ORIGINAL_SIGNS` |
| P06 difference-of-squares misconception | | `FAC_DIFF_SQUARES` / `WROTE_PERFECT_SQUARE` |
| P07 grouping misconception | | `FAC_GROUP_TERMS` / `PAIRS_SHARE_NOTHING` |
| P08 explicit support need | "I don't know" on 8 listed skills | — |
| P09 one-off slip | Wrong once on turn 1 only, then solves the same skill correctly, including its later transfer/widened item | `FAC_DIVIDE_TERMS` / `DIVIDED_FIRST_TERM_ONLY`, turn 1 only |
| P10 low-confidence-but-correct | Solves everything correctly, low confidence, slow pace | — |

Each profile declares (see the `PersonaProfile` type): the misconception (if
any) as an exact catalogue skill + mistake code pair, support skills,
confidence band, pace band, working style, and free-text notes on expected
evidence, report boundaries, and adaptive-decision behavior — including when
`KEEP` is the *correct* decision, not merely the default.

Every declared misconception is checked at import time against the real
catalogue (`FACTORISATION_SKILLS` in `lotus-factorisation-catalogue.ts`): the
fixture throws immediately if a persona's mistake code isn't one the
catalogue actually lists for that skill, so a future catalogue change that
invalidates a persona fails loudly, not silently.

## The deterministic fake model

`PersonaFakeModels` in the fixture is a fresh, self-contained implementation
of the same interface `LotusModelService` exposes — not a copy of the fixture
already used by `lotus-factorisation-session.v1.spec.ts`. It was written from
scratch because that existing fixture's wrong-answer mistake codes are, for
most of the 25 catalogue slots, a generic default pair
(`WRONG_FACTOR_PAIR_SUM` / `WRONG_FACTOR_PAIR_PRODUCT`) that is only actually
correct for the product-and-sum/trinomial slots — harmless for that file's
own tests, which never depend on skill attribution for those slots, but wrong
for a persona catalogue that specifically asserts *which skill* a piece of
evidence lands on. Every wrong answer in this new fixture carries a mistake
code verified to actually belong to that slot's skill (or, for the small
number of correct-answer entries, a computed answer verified against the
product's own `classifyFactorisation`/`classifySimplification` checkers, not
hand-computed algebra — see "What validating this fixture found," below).

## What validating this fixture found

Building and smoke-testing this fixture against the real `LotusService`
directly surfaced several real defects — in the fixture itself, and in the
product. Recording them here because the process is as informative as the
final state:

1. **A hand-computed wrong answer that was actually correct-but-unfinished.**
   An early version of a `FAC_DIVIDE_TERMS` wrong answer was, by the real
   deterministic checker, algebraically *equal* to the target expression —
   just not fully factored — so it classified as `UNFINISHED`, and its
   assigned mistake code wasn't in the product's `UNFINISHED_MISTAKES`
   allow-list, so the item was rejected. Fixed by switching every
   wrong-answer *text* to a trivial placeholder (matching the pattern the
   existing shared fixture already uses safely) while keeping the mistake
   *codes* accurate — the codes are what evidence attribution actually reads.
2. **A genuine hand-algebra error.** One factored answer
   (`FAC_GROUP_SIGN`, "(2x − 3)(4y − 3)") did not actually expand back to its
   claimed expression — verified by writing a script that runs every
   `SLOT_WRITES` entry through the product's own `classifyFactorisation` /
   `classifySimplification` functions rather than trusting hand arithmetic.
   This computational check is now the standard the fixture was built to;
   trusting hand-verified algebra for a fixture like this is not safe.
3. **A non-varying SIMPLIFY entry caused real preparation failures.** The one
   `SIMPLIFY`-kind catalogue slot was deliberately written as a fixed,
   non-varying instance on the assumption that no persona directly targets
   it. That assumption was wrong: a `BROADEN` decision can request a fresh
   write of that exact slot from evidence gathered on a *different, tagged*
   skill, before the slot's own turn is ever reached — and a byte-identical
   repeat write then fails "repeats a question already in this test" on
   every retry, exhausting the write budget and leaving the turn
   permanently `SKIPPED`. Fixed by parametrising the entry on a general
   algebraic identity, `(x−k)(x+k) / (x−k)² = (x+k)/(x−k)`, verified
   computationally for several `k` values rather than asserted by hand.
4. **The fallback variation token was not unique per write job.** When a
   `CHECK`/`DESCENT`/`WIDEN`-triggered write has no explicit
   `WriteRequest.variation` (which is the normal case — `applyPlanAction` in
   `lotus.service.ts` never sets one; only the initial 25-slot preparation
   pass does), the product's own `runWrite` falls back to a bare
   `${sessionId}:attempt${N}` token. Two *different* repurposed turns
   requesting the same shape at different points in the session then produce
   the *identical* candidate-expression sequence, and the second collides
   with the first's already-installed item. This was an actual, repeatable
   failure while running full 25-question sessions, not a hypothetical.
   Fixed on the fixture side by deriving the variation from a hash of the
   *entire* prompt (which differs per job because the prompt's own "Do not
   reuse any of these" avoid-list differs), not just the narrow token
   substring.

None of items 1–4 are product bugs — they are exactly the kind of fixture
mistakes a deterministic test harness is supposed to catch in itself before
it's trusted. Items 5 and 6 below are different: they are real product
behavior, observed directly, that a live student could plausibly trigger.

## Findings for the main agent (real product behavior, not fixture bugs)

The two product findings below have now been fixed in commits `0eed26d` and
`2027d8c`; the suite still needs to be rerun after those fixes.

5. **`forceCheckSkills` can accumulate many checks for one already-evidenced
   skill.** Personas P02, P03, P04, and P05 — each of which has a *single*,
   repeatable misconception — accumulate as many as 6 `CHECK`-purpose plan
   turns for that one skill over a full session, not 1 or 2. The guard added
   earlier this cycle (`checkedThisCall` in `planAdjustments`, plus the
   `alreadyChecked` scan of turns still ahead of `state.planTurn`) does stop
   a duplicate *within a single re-plan* and stops a duplicate for a turn
   that's still *pending* — but once an installed `CHECK` turn is actually
   *answered* (`state.planTurn` advances past it), a later `forceCheckSkills`
   request for the same skill no longer sees it as "already checked," so a
   persona that keeps failing the same skill keeps earning fresh checks.
   `state.handledConfirmed` exists specifically to stop the confirmed-gap
   pruning/descent logic from re-firing once a skill is `CONFIRMED`; this
   `forceCheckSkills` path is not gated by it. Whether repeated re-checks of
   an already-confirmed skill are actually useful (a small amount of "extra
   certainty") or a real bug depends on a product decision this document
   does not make; `lotus-factorisation-personas.v1.spec.ts`'s
   `assertNoRunawayDuplicateProbes` currently only fails on genuinely
   pathological counts (`> 4`) and logs the real count either way, so the
   behavior is visible rather than silently masked while that decision is
   pending.
6. **A skill can be marked `CONFIRMED` purely from two "I don't know"
   answers, with zero demonstrated mathematical error.** `foldLedger` in
   `lotus-factorisation.ts` treats a `DID_NOT_KNOW` evidence item exactly
   like a `MISTAKE`/`UNFINISHED` one for the `SUSPECTED` → `CONFIRMED` state
   transition (the same "two independent negatives on the same skill" rule).
   Persona P08 — who explicitly never attempts several skills, always saying
   "I don't know" — ends its report with `FAC_DIFF_SQUARES` `CONFIRMED`
   after saying "I don't know" on both of that skill's catalogue occurrences.
   This directly contradicts the documented principle in
   `LOTUS_CONTINUOUS_DIAGNOSTIC.md` §8: *"'I don't know' is a support
   signal, not a mathematical error... [use it] never as independent proof."*
   `lotus-factorisation-personas.v1.spec.ts`'s P08 test asserts every
   `CONFIRMED` skill has at least one real `MISTAKE`/`UNFINISHED` evidence
   item, and currently fails on exactly this case — left failing
   deliberately rather than loosened, because it is a real, reproducible
   violation of a documented product principle, not test flakiness.

Findings 5 and 6 were pre-existing behavior when this evaluation ran and are
now fixed in the main branch. Their historical descriptions above remain as
regression context; the suite must be rerun to verify the fixes.

## Test command

```
node --import tsx --test apps/api/test/golden/lotus-factorisation-personas.v1.spec.ts
```

No live model calls, no database required (`LotusService` is constructed
with `prisma: null`, matching the existing in-memory-only golden test
pattern). The previous pre-fix smoke result was **12 of 17 subtests pass**;
the suite has not yet been rerun after the two fixes and has not been run as a
formal, product-owner-notified test gate per
`LOTUS_CONTINUOUS_DIAGNOSTIC.md` §10's process — it is ordinary development
verification of a new, isolated test file.

## What comes after this foundation

Per `LOTUS_CONTINUOUS_DIAGNOSTIC.md` §9, two further suites build on this:

1. **Deterministic wiring suite (Playwright).** The existing
   `scripts/lotus-factorisation-playwright.mjs` (built in an earlier session)
   already drives the real student UI and API with a controlled model
   adapter. This persona catalogue and its `chooseResponse()` helper are
   designed to be reusable from that script — a Playwright persona run would
   log in as a demo student, read the currently-displayed question's
   diagnostics from a server-side test-only audit endpoint (never the
   browser payload), and apply the same profile logic this suite already
   uses at the service level.
2. **Live-model diagnostic suite.** Requires the real writer/analyser models,
   real cost, and — critically — the blinded educator-review workflow
   `LOTUS_CONTINUOUS_DIAGNOSTIC.md` §9 specifies: two maths educators
   independently label what an actual response transcript supports, blinded
   to Lotus's own analysis, before any comparison against the predeclared
   latent profile happens. Nothing in this document or its test files
   produces or approximates that blinded review — it is a human process this
   deterministic foundation deliberately does not attempt to substitute for.
   Running it requires product-owner notification (exact suite, environment,
   live-model usage, expected duration/cost, test-data reset) per §10, which
   this parallel task was explicitly instructed not to initiate.
