# COGNA's first diagnostic learning prototype — Quadratic Expressions

A single self-contained student session (welcome → warm-up → expansion →
sparse diagnostic probe → targeted area-model intervention → factorisation
→ independent transfer → summary) built around the topic *equivalent
quadratic expressions through expansion, simplification, visual
representation, and factorisation* — not solving quadratic equations.

This is a design and research prototype, not the final cognitive engine. It
demonstrates the interaction model and a real (if scripted) diagnosis
mechanism; it does not claim to have conclusively identified a student's
permanent misconception from one session.

## Where this lives, and why it's separate

Everything is under `apps/web/src/{app,components,lib}/.../quadratics*` and
is entirely new — it does not modify, reuse, or depend on any part of the
production MVP 1.0–5.0 stack (NestJS API, Prisma, the decision engine, the
question bank, Clerk auth). Per the brief's explicit scope ("do not add …
production backend infrastructure"), the whole thing runs client-side in
the existing Next.js app: no new API routes, no new database tables. Event
logging goes to this browser's `localStorage`, keyed by a random anonymous
session id.

It intentionally does **not** reuse the main app's green "quiet classroom"
visual system. Section 9 of the brief specifies a distinct warm
off-white / navy / indigo-cobalt direction, so `quadratics.module.css`
defines its own CSS custom properties, scoped under `.root`, and never
touches `globals.css`.

## Running it

```bash
pnpm --filter @cogna/web dev
```

Then open:

- **Student experience:** `http://localhost:3000/prototype/quadratics`
- **Dev scenario selector** (not linked from the student UI):
  `http://localhost:3000/prototype/quadratics/dev`
- **Internal research view** (not linked from the student UI):
  `http://localhost:3000/prototype/quadratics/research`

## Activating each of the ten demo paths

Go to `/prototype/quadratics/dev` and click any path. Each one starts the
real session with `?scenario=<ID>`, which pre-fills that path's scripted
inputs as each stage is reached. You still click Check / Continue
yourself — nothing is auto-submitted — and every pre-filled input runs
through the exact same parser, `classifyExpansionAttempt`,
`classifyFactorAttempt`, and evidence-state-machine code a real student's
typing would. The ten paths (see `src/lib/quadratics/scenarios.ts`):

1. Completely correct expansion and factorisation
2. Missing cross-products (repeats on the probe → area model appears)
3. One apparent slip, then a correct probe (no lesson shown)
4. Incorrect interpretation of x² (treats x·x as "2x")
5. Combining-like-terms difficulty (right value, never merged)
6. Negative-sign difficulty (clean on the taught example, slips on transfer)
7. Product-versus-sum confusion during factorisation, then self-corrects
8. "I'm stuck" (skips the probe, goes straight to support)
9. Successful independent transfer (an early slip, then unaided success)
10. Difficulty during independent transfer (a general, non-sign-specific miss)

## Architecture

### The math engine is real, not scripted (`src/lib/quadratics/poly.ts`)

A hand-written recursive-descent parser + polynomial engine for the
constrained family in section 10 (variable `x`, integer coefficients,
`+ - *` and juxtaposition, parentheses, integer powers). No `mathjs`,
`nerdamer`, or similar was already in this monorepo, and the supported
grammar is narrow enough that a general library would have been overkill;
the whole engine is ~250 lines.

The key design choice: every expression is first reduced to a **flat list
of signed monomial terms via full distribution, without collecting like
terms**. For `(x+3)(x+5)` that list is literally the four partial
products the brief's competency list (#5) asks the system to observe.
*Collecting* those terms into a canonical coefficient array
(`collectTerms`) is a separate, explicit step — which is what lets
`hasUncombinedLikeTerms` distinguish "correct value, not yet combined"
(`x^2+3x+5x+15`) from "fully simplified" (`x^2+8x+15`), a distinction a
plain evaluator would silently erase.

This also means **any** algebraically equivalent input is accepted
automatically, in any order or grouping — `x(x+5)+3(x+5)`,
`x^2+5x+3x+15`, `15+8x+x^2` all normalize to the same array. Nothing forces
FOIL or any one method.

Validation is `parseExpression → collectTerms →
polyEquals`, all pure functions over integers, testable without a DB or a
model call.

### Diagnosis is a real classifier over generated patterns, not per-screen fakery (`src/lib/quadratics/diagnosis.ts`)

The three "known wrong-answer" signatures in the brief's Stage 4 table
(missing cross-products, x² misread, incomplete double distribution) are
**generated programmatically from each problem's own `(p, q)` factors**,
not hand-typed per problem. The same three generator functions correctly
reproduce the exact numeric examples in the spec for `(x+3)(x+5)`, and
generalize correctly to the probe `(x+2)(x+4)` and the transfer problem
`(x-2)(x+5)` — verified in `test/quadratics/diagnosis.spec.ts`.

The evidence-state machine (`OBSERVED / SUSPECTED / REPEATED_EVIDENCE /
INTERVENTION_READY / UNCERTAIN / UNKNOWN`) implements section 4/7's rules
literally: one wrong answer is `SUSPECTED`, never a confirmed
misconception; at most one probe is shown per hypothesis
(`needsProbe`); a correct probe answer downgrades to `UNCERTAIN` ("a
possible slip") instead of escalating; a "stuck" signal skips the probe
entirely and goes straight to support.

### Ten demo paths, driven through the real UI (`src/lib/quadratics/scenarios.ts`)

Each scenario is a sequence of the literal inputs a student would type or
choose. The dev route pre-fills them at each stage; nothing about
validation or classification is bypassed. All ten were verified both by a
standalone script against the classification functions (during
development) and by an automated end-to-end test
(`test/quadratics/scenarios.spec.ts`) that drives the same branching logic
the page component uses and asserts each path reaches the evidence state
its name promises.

### Event log (`src/lib/quadratics/session-log.ts`)

Exactly the field list in section 12, persisted to `localStorage` under a
random `anonymousSessionId` — no name, email, school, phone, audio, or
demographics ever enter the schema. The research view
(`/prototype/quadratics/research`) lists every session recorded in the
current browser, renders the full timeline with **observed** columns
(raw input, validity, response time) visually separated from **inferred**
columns (hypothesis, evidence state) via a distinct background tint, and
exports the selected session as a downloaded JSON file.

### Retention placeholder

`RetentionStatus = "NOT_MEASURED_THIS_SESSION"` exists in
`lib/quadratics/types.ts` as a named placeholder only. This prototype
measures immediate performance and one-shot transfer; it does not pretend
to have measured delayed retention.

### Components (`src/components/quadratics/`)

- `MathExpr.tsx` — typesets a *controlled* expression string (never raw
  student input) into spaced, superscripted display. Built from plain
  React nodes, no `dangerouslySetInnerHTML`.
- `AreaModel.tsx` — the four-region rectangle for Stage 6. Each region is
  a real input, validated against the actual expected partial product via
  the poly engine; the "combine" step is a real state transition, not a
  canned animation. Reusable for any future `(x+p)(x+q)` topic by passing
  different `p`/`q`.
- `ProductSumWorkspace.tsx` — the factorisation workspace (Stage 7),
  reused as-is for the transfer stage's reverse step (Stage 8).

These three, plus the CSS module's token set, are written to be
topic-agnostic — a future linear-equations-v2 or trinomial-factoring
prototype could reuse them by swapping the problem data.

## Mocked adaptive paths vs. the real engine — where the line is

- **Real, general, and tested:** the parser, the equivalence/normalization
  logic, the three pattern generators, the evidence-state machine, the
  factor-pair validator.
- **Scripted for reliable demonstration only:** *which* inputs the dev
  selector pre-fills at each stage, so a specific path can be reproduced
  on demand for a demo or a stakeholder walkthrough. The dev route is
  never reachable from the student journey (no link anywhere in
  `page.tsx` points to `/dev`), and the `?scenario=` query param is only
  ever set by that route.

## Tests

```bash
pnpm --filter @cogna/web test
```

57 tests across three files, using the same `node --import tsx --test`
convention already established in `apps/api` (no new test framework
introduced):

- `test/quadratics/poly.spec.ts` — parser grammar coverage (juxtaposition,
  negative factors, unicode minus/times, decimals/unsupported-chars/empty/
  unbalanced-parens all correctly abstain), equivalence across multiple
  valid routes, `hasUncombinedLikeTerms`, `formatPoly`, an independent
  numeric cross-check via `evaluateAt`, `checkFactorPair`.
- `test/quadratics/diagnosis.spec.ts` — every row of the Stage 4 and
  Stage 7 tables, the evidence-state machine's transition rules
  (including the "stuck skips the probe" and "a correct probe downgrades
  to uncertain" cases), `looksLikeSignIssue`.
- `test/quadratics/scenarios.spec.ts` — drives all ten scripted paths
  through the real classification/tracker functions end-to-end and
  asserts each reaches its promised terminal state — this is the test
  that would catch a scenario silently drifting out of sync with the
  diagnosis engine after a future change.

Also run as part of verification: `pnpm exec tsc --noEmit` (clean, no
errors) across the whole `apps/web` workspace.

## What was manually verified in the browser

- All 9 stages walked through end-to-end for the `FULLY_CORRECT` and
  `MISSING_CROSS_PRODUCTS` paths, including the interactive area model
  (filled all four regions, watched the "which parts can be combined?"
  prompt appear, clicked combine, watched `5x + 3x → 8x` assemble into
  `x^2 + 8x + 15` live).
- The `STUCK` path's confidence stage and general keyboard focus order.
- The research view against real recorded sessions — confirmed the
  observed/inferred column split and JSON export both work, and that a
  session correctly shows `SUPPORTED` for the taught example but
  `INDEPENDENT` for the transfer problem when an intervention was shown —
  the core research hypothesis this prototype exists to test.
- Mobile viewport (375×812): welcome/warm-up stages reflow cleanly.
- Zero console errors or warnings across every session tested.

## Known limitations

- **Keyboard-activation verification was inconclusive, not failing.**
  Synthetic Enter/Space key events from the browser-automation tool used
  for this session did not reliably trigger native `<button>` clicks
  anywhere in this app — including on the pre-existing, previously-shipped
  parent-login page, not just this new code. That points to a testing-tool
  limitation rather than an app defect (native `<button>` elements get
  Enter/Space activation from the browser for free; nothing here calls
  `preventDefault` or intercepts key events), but I could not get a clean
  automated confirmation either way. Worth a real keyboard pass before
  this goes in front of an actual student.
- **The probe's "allow him to revisit it" is not built as a separate
  revisit UI.** After a correct probe, the session moves straight to
  factorisation rather than re-presenting the main problem. This keeps the
  15–20 minute session achievable; a future pass could add a lightweight
  optional revisit.
- **The area model always uses the main problem's `(x+3, x+5)` dimensions**
  for every hypothesis that reaches intervention, including
  combining-like-terms and the x² misread — matching the brief's two
  fixed prompts ("what belongs in this part?" / "which parts can be
  combined?"), but it is one intervention design serving four hypotheses,
  not four bespoke interventions.
- **Unrecognized wrong answers get `hypothesis: NONE`**, i.e. "real
  evidence, no confident label" rather than a forced guess — by design
  (see the classifier's comment), but it does mean the ten scripted paths
  are the reliable coverage; genuinely novel wrong answers from a real
  student will often land here rather than in one of the three named
  patterns, which is honest but limits what the summary can say about
  them in a single session.
- **No persistence beyond this browser's `localStorage`.** Clearing site
  data loses recorded sessions; there is no server-side or cross-device
  copy, matching the "no production backend infrastructure" constraint.
