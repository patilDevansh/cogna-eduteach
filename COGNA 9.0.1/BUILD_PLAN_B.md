# MVP 9.0.1 — Phase B1: Fraction-Linear Verifier + Templates

> Follow-on to [`BUILD_PLAN.md`](./BUILD_PLAN.md) (Phase A) and [`BUILD_PLAN_A2.md`](./BUILD_PLAN_A2.md).
> Plain-English overview: [`README.md`](./README.md).
> Use `~~strikethrough~~` when completed.
> If deferred, log in [`SKIPPED.md`](./SKIPPED.md).

## Phase B, in one line

Extend the deterministic verifier and question templates to the other algebra topics — **one topic at a time**. That is what "2,000 questions" turns into: not a content-writing task, a **verifier-per-topic** task.

## Why B1 exists

Phase A/A2 can only safely check one shape: `A(x ± B) ± C = D` (plus the thin linear entry items that feed it). Equivalence checking for lines that already parse is real; first-invalid localization for **clearing denominators** is not — today a swapped LCD or a dropped term both collapse to generic `NOT_EQUIVALENT`, and a correct clear is mis-labelled `DIVIDE_BOTH_SIDES`.

A2 already proved the verifier gate is not theoretical: when AI authored inside the linear-bracket grammar, it got its own arithmetic wrong on a majority of forced trials, and the verifier caught every case. Without a fraction-specific verifier, scaling templates (or AUTHOR) into fractions would mean hand-checking or risking wrong maths reaching a student.

## Decisions locked (owner, 2026-08-06)

1. **AUTHOR:** **Templates-only for B1.** `AUTHOR` stays off for the fraction grammar until this verifier is green (goldens + adversarial reject on out-of-grammar / bad clear). AUTHOR becomes **B1.5** — same A2 gate pattern, only after B1 ships.
2. **Topic order:** **Locked** — remaining Topic 2 (brackets/fractions) → Topic 3 identities → Topic 4 factorisation → Topic 5 quadratics. This document covers **only B1**.
3. **Teaching ladder:** **Do not block B1** on a live proof of the full assistance ladder. B1 **reuses** Phase A session / evidence / assistance machinery unchanged (no new ladder rungs). Live ladder + Why-quality fixes stay a parallel care track.

## Worktree ownership

| Agent | Branch | Folder |
|---|---|---|
| Cursor (this plan) | `cursor/mvp-9-parallel` / feature branch | Cursor worktree |
| Claude / Codex | idle until assigned later topics | their worktrees |

## What B1 ships (thin vertical column)

### Skills added (EXECUTABLE)

From [`docs/diagnostic-microskill-slice/micro-skill-catalogue.md`](../docs/diagnostic-microskill-slice/micro-skill-catalogue.md) Topic 2 remainder:

| Id | Role in slice |
|---|---|
| `FND_FRACTION_EQUIV` | Supporting — equivalent forms while clearing |
| `FND_FRACTION_OPS` | Supporting — arithmetic on fractional terms |
| `LIN_CLEAR_FRACTIONS` | **Primary diagnostic target** — multiply through by a valid common multiple |
| `LIN_SOLVE_FRACTIONS` | Solve a linear equation that began with fractions (after clearing) |

`LIN_SOLVE_BRACKETS` is **not** in B1 (logged in SKIPPED — only if glue is needed later).

Already-executable Topic 2 skills (`FND_SIGN_MUL_DIV`, `LIN_DISTRIBUTE_POS`, `LIN_DISTRIBUTE_NEG`) stay on the negative-distribution track; B1 does not reopen them.

### Grammar

Linear equations with rational coefficients / clearing denominators, e.g.:

```text
(x + 1)/2 = (x - 1)/3 + 1
```

Valid clear (LCD 6):

```text
3(x + 1) = 2(x - 1) + 6
```

Parsing reuses the rational linear form already in `linear-bracket-verifier.ts`. B1 adds a **separate** module — `fraction-linear-verifier.ts` — that owns fraction-specific transformation classification and first-invalid localization. Session routes by **item grammar / track**, not one mega-parser.

### First-invalid action codes (new)

| Code | Meaning |
|---|---|
| `WRONG_COMMON_MULTIPLE` | Multipliers applied to sides are not a valid common multiple of the denominators (e.g. swapped 2 and 3) |
| `DROPPED_TERM_WHEN_CLEARING` | A term present before clearing is missing after (constant or variable piece dropped while multiplying through) |
| `SIGN_ERROR_AFTER_CLEARING` | Clearing used a plausible multiple but a sign flipped incorrectly |
| `FRACTION_NOT_CLEARED` | Student claimed a clear but denominators remain (or only one side was multiplied) |

Generic `NOT_EQUIVALENT` remains the fallback when none of the above apply.

### Item set + template quotas

| Stage | Fixed item | Template | Primary skill |
|---|---|---|---|
| `ENTRY_FRAC_SIMPLE` | `x/2 + 3 = 7` | `TPL_FRAC_SIMPLE` | `LIN_SOLVE_FRACTIONS` |
| `FRAC_CLEAR_MAIN` | `(x+1)/2 = (x-1)/3 + 1` | `TPL_FRAC_CLEAR` | `LIN_CLEAR_FRACTIONS` |
| `FRAC_CLEAR_CONTRAST` | `(y+2)/4 = 3` (bare clear focus) | `TPL_FRAC_CLEAR_BARE` | `LIN_CLEAR_FRACTIONS` |
| `TRANSFER_FRAC_CLEAR` | `(z-2)/3 = (z+1)/6 + 1` | `TPL_TRANSFER_FRAC_CLEAR` | `LIN_CLEAR_FRACTIONS` |

Contrast only when the target skill failed on MAIN (same routing idea as `NEG_DIST_CONTRAST`). Transfer always ends the track.

Template pools: small positive denominators ∈ {2,3,4,6}, integer solutions only, single variable. `verifyRendered()` must independently re-solve and reject any rendered instance that fails.

### Session track

Additive optional field on start: `track: "NEGATIVE_DISTRIBUTION" | "FRACTION_LINEAR"` (default `NEGATIVE_DISTRIBUTION` — Phase A path unchanged). Fraction track uses its own `ITEM_STAGE_ORDER` and the fraction verifier for every step on that track.

### AUTHOR

**Deferred to B1.5.** Selector may `EXISTING` / `GENERATE` fraction templates; `AUTHOR` for fraction grammar is rejected / unavailable until B1.5.

---

## Implementation checklist

### Phase 0 — Plan and tracking

- [x] ~~Write this file~~
- [x] ~~Point `BUILD_PLAN.md` Sequencing (B) at this document~~
- [x] ~~Refresh `README.md`, `SKIPPED.md`, `BUILD_CARE.md` for B1 scope~~

### Phase 1 — Contracts + catalogue

- [x] ~~Extend `MicroSkillId` / `MICRO_SKILL_IDS` with the four B1 skills~~
- [x] ~~Add context modifier `HAS_FRACTIONS` (layer 5 — recorded on fraction-track steps)~~
- [x] ~~Add `STEP_VERIFICATION_RULES_FRACTION_V1` in `versions.ts`~~
- [x] ~~Optional `track` on `StartDiagnosticV2SessionRequest`~~
- [x] ~~Catalogue: EXECUTABLE entries + `FRACTIONS_AND_ORDER` / `DISTRIBUTING_AND_CLEARING` families as needed~~

### Phase 2 — Fraction verifier

- [x] ~~`fraction-linear-verifier.ts`: `verifyFractionStepValidity`, `classifyFractionTransformation`, `findFirstInvalidFractionAction`, `FRACTION_VERIFIER_VERSION`~~
- [x] ~~Reuse `parseLinearWithBracket` / solution-set equivalence; do **not** fork the rational parser~~
- [x] ~~Correct clear → `MULTIPLY_BOTH_SIDES` + `VALID`~~
- [x] ~~Wrong LCD / dropped term / sign flip → distinct codes above~~
- [x] ~~Out-of-grammar → `PARSE_FAILED` (never `INVALID`)~~
- [x] ~~Thin router used by session: pick linear-bracket vs fraction-linear by track/item~~

### Phase 3 — Templates + session

- [x] ~~Extend `diagnostic-v2-template-render.ts` with four templates + fixed items + descriptions~~
- [x] ~~`verifyRendered` routes fraction items through the fraction verifier / same independent re-solve discipline~~
- [x] ~~Session: `track` start, `FRAC_*` stage order, `nextStagesAfter` for fraction stages~~
- [x] ~~`attributeMicroSkill`: clearing lines → `LIN_CLEAR_FRACTIONS`; post-clear solve steps → existing linear attributions / `LIN_SOLVE_FRACTIONS` on the item~~
- [x] ~~**No AUTHOR** path for fraction templates~~

### Phase 4 — Tests

- [x] ~~`diagnostic-v2-fraction-linear-verifier.v1.spec.ts` — VALID/INVALID tables, codes, abstention~~
- [x] ~~`diagnostic-v2-fraction-wrong-answer-matrix.v1.spec.ts` — service-level matrix + evidence containment~~
- [x] ~~`diagnostic-v2-fraction-clear.v1.spec.ts` — full fraction-track scenario, AI on vs AI off deterministic parity~~
- [x] ~~Existing Phase A suite stays green~~ (`diagnostic-v2*.spec.ts` 333/333)

---

## Test matrix (must assert)

### Verifier

| Previous | Submitted | Expect |
|---|---|---|
| `(x+1)/2 = (x-1)/3 + 1` | `3(x+1) = 2(x-1) + 6` | `VALID`, `MULTIPLY_BOTH_SIDES` |
| `(x+1)/2 = (x-1)/3 + 1` | `2(x+1) = 3(x-1) + 6` | `INVALID`, `WRONG_COMMON_MULTIPLE` |
| `(x+1)/2 = (x-1)/3 + 1` | `3(x+1) = 2(x-1)` | `INVALID`, `DROPPED_TERM_WHEN_CLEARING` |
| `(x+1)/2 = (x-1)/3 + 1` | `-3(x+1) = 2(x-1) + 6` | `INVALID`, `SIGN_ERROR_AFTER_CLEARING` |
| `(y+2)/4 = 3` | `(y+2)/4 = 3` (no-op) / half-clear | `INVALID` or distinct incomplete code |
| `x^2/2 = 1` | anything | `PARSE_FAILED` |

### Evidence containment

After any wrong clear on `LIN_CLEAR_FRACTIONS`, skills not implicated (`LIN_DISTRIBUTE_NEG`, `FND_SIGN_MUL_DIV`, etc.) must be unchanged.

### AI on / AI off

Deterministic facts (validity, evidence kind/weight, skill status, route) identical with AI fully off vs on for the fraction-track script.

---

## Out of scope (B1)

- Identities, factorisation, quadratics (later Phase B topics)
- B1.5 AUTHOR for fraction grammar
- Versioned `Question` bank rows (still deferred — see SKIPPED)
- Phase C caching / Phase D reports
- Why-invents-failures narration hard-fix (parallel care)
- Broadening to all remaining Topic 2 skills (`FND_SIGN_ADD_SUB`, `FND_ORDER_OPS`, `LIN_SOLVE_BRACKETS`) — SKIPPED with return condition

## Done means

```bash
pnpm --filter @cogna/shared build
pnpm --filter @cogna/api test
```

- Existing suite green; B1 goldens green
- README matches what the code does
- AUTHOR still unavailable for fraction grammar
- Negative-distribution default track unchanged
