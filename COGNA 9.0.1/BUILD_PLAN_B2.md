# MVP 9.0.1 — Phase B2: Difference-of-squares identities thin slice

> Follow-on to B1 / B1.5. Spec catalogue: [`docs/diagnostic-microskill-slice/micro-skill-catalogue.md`](../docs/diagnostic-microskill-slice/micro-skill-catalogue.md) Topic 3.
> Use `~~strikethrough~~` when completed.

## One line

Add a third diagnostic **track** for recognising / expanding difference of squares — verifier-first, same vertical shape as B1 (entry → main → contrast → transfer).

## Decisions locked

1. **Track id:** `IDENTITY_DIFF_SQUARES`
2. **Primary skill:** `ID_DIFF_SQUARES`
3. **Supporting:** `ID_VERIFY_EXPANSION`, `EXP_EXPAND_BINOMIALS`, `ALG_IDENTIFY_STRUCTURE`
4. **AUTHOR:** templates-only until a later B2.5 (same B1 → B1.5 pattern)
5. **Wire format:** plain ASCII (`(x+3)(x-3)`, `x^2 - 9`); UI may pretty-print later

## Grammar

Expand / recognise forms:

```text
(x + 3)(x - 3)
x^2 - 9
```

Valid expand: `x^2 - 9`. Valid reverse (factor): `(x + 3)(x - 3)`.

First-invalid codes:

| Code | Meaning |
|---|---|
| `WRONG_MIDDLE_SIGN` | Expanded with middle term on a difference of squares |
| `DROPPED_SQUARE` | Missing `x^2` / `a^2` term |
| `NOT_DIFF_OF_SQUARES` | Product is not a difference-of-squares shape |
| `FACTOR_PAIR_MISMATCH` | Reverse factorisation uses wrong constants |

## Item set

| Stage | Fixed item | Template | Primary |
|---|---|---|---|
| `ENTRY_EXPAND_BINOMIAL` | Expand `(x+2)(x+3)` | `TPL_EXPAND_BINOMIAL` | `EXP_EXPAND_BINOMIALS` |
| `ID_DIFF_MAIN` | Expand `(x+3)(x-3)` | `TPL_DIFF_SQUARES` | `ID_DIFF_SQUARES` |
| `ID_DIFF_CONTRAST` | Expand `(y+5)(y-5)` | `TPL_DIFF_SQUARES_BARE` | `ID_DIFF_SQUARES` |
| `TRANSFER_ID_DIFF` | Factor `z^2 - 16` | `TPL_TRANSFER_DIFF_SQUARES` | `ID_DIFF_SQUARES` |

Contrast only when MAIN target skill failed. Transfer ends the track.

## Checklist

### Contracts / catalogue

- [x] ~~Add MicroSkillIds + TopicId `ALGEBRAIC_IDENTITIES` + track enum~~
- [x] ~~Mark B2 skills EXECUTABLE in `micro-skills.catalog.ts`~~

### Verifier + session

- [x] ~~`identity-expr-verifier.ts` + router branch~~
- [x] ~~Stage order + fixed items + templates + `verifyRendered`~~
- [x] ~~UI track picker option~~

### Goldens

- [x] ~~Verifier table + track smoke (`diagnostic-v2-identity-diff.v1.spec.ts`)~~

### Tracking

- [x] ~~Update README / BUILD_PLAN sequencing~~

## Out of this thin slice (B2.x)

- **`(a+b)²` / `(a-b)²` square identities** (`ID_SQUARE_SUM`, `ID_SQUARE_DIFF`, reverse recognition) — not in the DoS verifier. Logged in [`SKIPPED.md`](./SKIPPED.md) as `9.0.1B2 — square-of-binomial identities`. Return when a B2.x column needs them as entry/contrast beside DoS.
- Contained pattern-matching **both directions** for difference of squares **is** in scope and shipped (expand `(x+k)(x−k)` ↔ factor `x²−k²`).
