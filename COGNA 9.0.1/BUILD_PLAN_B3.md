# MVP 9.0.1 — Phase B3: Factorisation thin slice

> Starts after B2 goldens are green. Catalogue Topic 4.
> Spec: [`docs/diagnostic-microskill-slice/micro-skill-catalogue.md`](../docs/diagnostic-microskill-slice/micro-skill-catalogue.md).
> Use `~~strikethrough~~` when completed.

## One line

Verifier-first thin column for **trinomial factorisation** — monic primary, non-monic transfer (owner example `2x²−5x−3`) — bridging identities into quadratic prep.

## Three-piece kit (every topic)

Same shape as `linear-bracket-verifier.ts` for brackets. Diffing logic does **not** generalize — rebuild per topic.

1. **Parser** — student text → structured form (quadratic `ax²+bx+c`, or product of two linear factors `(px±q)(rx±s)`)
2. **Solver** — independently derive the correct factorisation from the quadratic (integer AC / monic pair search); expand student factors and compare **polynomials, not strings** (factor order may swap)
3. **First-invalid-action finder** — when wrong, pinpoint which operation broke (wrong pair vs incomplete vs sign vs grouping), not just "wrong"

## Decisions locked

1. **Track id:** `FACTOR_MONIC_TRINOMIAL` (primary column monic; transfer exercises non-monic AC)
2. **Primary skill:** `FAC_MONIC_TRINOMIAL`
3. **Supporting / transfer:** `FAC_PAIR_PRODUCT_SUM`, `FAC_READ_ABC_SIGNS`, `FAC_VERIFY_EXPAND`, `FAC_COMPUTE_AC`, `FAC_NONMONIC_GROUP`, `FAC_SPLIT_MIDDLE`, entry reuse `EXP_EXPAND_BINOMIALS`
4. **Do not reopen** full Topic 4 (22 skills) — common-monomial / perfect-square / GCF stay later B3.x
5. **AUTHOR:** templates-only until B3.5 (see `SKIPPED.md`)
6. **Wire format:** plain ASCII (`x^2+5x+6`, `(x+2)(x+3)`, `2x^2-5x-3`, `(2x+1)(x-3)`)

## Grammar

```text
x^2 + 5x + 6          →  (x + 2)(x + 3)
x^2 - x - 6           →  (x - 3)(x + 2)
2x^2 - 5x - 3         →  (2x + 1)(x - 3)
```

Incomplete (not a finished factorisation): `2(x^2 - 2.5x - 1.5)` → `INCOMPLETE_FACTORISATION`.

## First-invalid codes

| Code | Meaning |
|---|---|
| `WRONG_FACTOR_PAIR_PRODUCT` | Constants have the right sum but wrong product (or expanded middle matches while constant does not) |
| `WRONG_FACTOR_PAIR_SUM` | Right product, wrong sum (middle term off) |
| `SIGN_ERROR_MIDDLE_SPLIT` | Correct absolute pair / AC split but a sign on a factor is flipped |
| `WRONG_GROUPING` | Non-monic: AC numbers found but coefficients grouped onto the wrong factors |
| `INCOMPLETE_FACTORISATION` | Still has a quadratic inside, or fractional coeffs / common-factor left unfinished |
| `EXPAND_CHECK_FAIL` | Expanded factors do not match the given quadratic (catch-all after specific codes) |
| `NOT_INTEGER_FACTORABLE` | Discriminant / AC search finds no integer factorisation (content should avoid; gate rejects) |

## Item set

| Stage | Fixed item | Template | Primary | Role |
|---|---|---|---|---|
| `ENTRY_FACTOR_EXPAND` | Expand `(x+2)(x+3)` | `TPL_FACTOR_EXPAND` | `EXP_EXPAND_BINOMIALS` | Link B2 expand → quadratic |
| `FAC_MONIC_MAIN` | Factor `x^2+5x+6` | `TPL_FAC_MONIC` | `FAC_MONIC_TRINOMIAL` | Primary monic |
| `FAC_MONIC_CONTRAST` | Factor `x^2-x-6` | `TPL_FAC_MONIC_BARE` | `FAC_MONIC_TRINOMIAL` | Different signs / pair focus |
| `TRANSFER_FAC_NONMONIC` | Factor `2x^2-5x-3` | `TPL_TRANSFER_FAC_NONMONIC` | `FAC_NONMONIC_GROUP` | Owner non-monic / AC |

Contrast only when MAIN target skill failed. Transfer ends the track.

## Checklist

### Contracts / catalogue

- [x] ~~Add MicroSkillIds + TopicId `FACTORISATION` + track `FACTOR_MONIC_TRINOMIAL`~~
- [x] ~~Mark B3 skills EXECUTABLE in `micro-skills.catalog.ts` with prerequisite edges~~

### Verifier + session

- [x] ~~`factor-trinomial-verifier.ts` (parser + expand-and-compare solver + first-invalid codes) + router branch~~
- [x] ~~Stage order + fixed items + templates + `verifyRendered`~~
- [x] ~~UI track picker + labels + assistance / childFacing~~

### Goldens

- [x] ~~Verifier table + wrong-answer matrix + track smoke (`diagnostic-v2-factor-trinomial.v1.spec.ts`, matrix spec)~~

### Tracking

- [x] ~~Update README / BUILD_PLAN sequencing / BUILD_CARE / SKIPPED (B3.5 AUTHOR)~~
