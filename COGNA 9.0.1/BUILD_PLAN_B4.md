# MVP 9.0.1 — Phase B4: Simple quadratics via factorising

> Depends on B3 factor glue (expand-and-compare). Catalogue Topic 5.
> Spec: [`docs/diagnostic-microskill-slice/micro-skill-catalogue.md`](../docs/diagnostic-microskill-slice/micro-skill-catalogue.md).
> Use `~~strikethrough~~` when completed.

## One line

Thin column for **zero-product → roots** after a factorised (or factorable) quadratic — reuses B3 expand-and-compare; rejects non-integer-factorable content; checks roots by substitution.

## Three-piece kit (every topic)

1. **Parser** — student text → structured form (standard quadratic equation, factored product `= 0`, or root list `x = a or x = b`)
2. **Solver** — independently: rearrange to standard form if needed → integer-factorability check → factor via B3 solver → apply zero-product → roots; verify proposed roots by substitution into the original equation
3. **First-invalid-action finder** — missed branch, wrong sign on a root, dropped root, verify fail, or non-integer-factorable reject — not just "wrong"

Diffing does **not** reuse the bracket mega-parser. Factorisation steps call into `factor-trinomial-verifier` expand-and-compare.

## Decisions locked

1. **Track id:** `QUAD_ZERO_PRODUCT`
2. **Primary skill:** `QUAD_ZERO_PRODUCT`
3. **Supporting:** `QUAD_CREATE_BRANCHES`, `QUAD_SOLVE_UNIT_FACTOR`, `QUAD_VERIFY_ROOTS`, `QUAD_STANDARD_FORM` (entry rearrange)
4. **Factorisation itself** reuses B3 (`FAC_*` / expand-and-compare) — do not re-teach Topic 4 inside B4; bridge skill `QUAD_FACTOR_EXPRESSION` may appear as supporting only
5. **AUTHOR:** deferred B4.5 until verifier green (see `SKIPPED.md`)
6. **Reject** anything that does not factor over the integers (gate + runtime code `NOT_INTEGER_FACTORABLE`)

## Grammar

```text
x^2 + 5x = -6           →  x^2 + 5x + 6 = 0     (entry rearrange)
(x + 2)(x - 3) = 0      →  x = -2  or  x = 3    (main zero-product)
(2x + 1)(x - 3) = 0     →  x = -1/2  or  x = 3  (contrast non-unit; thin slice may keep unit factors only)
x^2 - x - 6 = 0         →  x = 3  or  x = -2    (transfer: factor then roots)
```

Thin-slice contrast keeps **integer roots** from unit or simple non-unit factors; fractional root display uses ASCII `x=-1/2`.

## First-invalid codes

| Code | Meaning |
|---|---|
| `MISSED_BRANCH` | Only one root / one factor set to zero |
| `WRONG_ROOT_SIGN` | Root magnitude right, sign flipped |
| `DROPPED_ROOT` | One correct root present, the other missing or replaced |
| `VERIFY_FAIL` | Proposed root(s) fail substitution into the original equation |
| `NOT_INTEGER_FACTORABLE` | Quadratic does not factor over the integers — reject / content gate |
| `WRONG_STANDARD_FORM` | Rearrange to `= 0` moved terms incorrectly |
| `EXPAND_CHECK_FAIL` | Factor step does not expand back to the quadratic (B3 codes may also surface) |

## Item set

| Stage | Fixed item | Template | Primary | Role |
|---|---|---|---|---|
| `ENTRY_QUAD_STANDARD` | `x^2+5x=-6` → standard form | `TPL_QUAD_STANDARD` | `QUAD_STANDARD_FORM` | Recognise / rearrange |
| `QUAD_ZP_MAIN` | `(x+2)(x-3)=0` → roots | `TPL_QUAD_ZERO_PRODUCT` | `QUAD_ZERO_PRODUCT` | Zero-product |
| `QUAD_ZP_CONTRAST` | `(2x+1)(x-3)=0` → roots | `TPL_QUAD_ZP_BARE` | `QUAD_SOLVE_UNIT_FACTOR` | Non-unit branch |
| `TRANSFER_QUAD_ZP` | `x^2-x-6=0` → factor + roots | `TPL_TRANSFER_QUAD_ZP` | `QUAD_ZERO_PRODUCT` | Fresh factored path |

Contrast only when MAIN target skill failed. Transfer ends the track.

## Checklist

### Contracts / catalogue

- [x] ~~Add MicroSkillIds + TopicId `QUADRATICS` + track `QUAD_ZERO_PRODUCT`~~
- [x] ~~Mark B4 skills EXECUTABLE with prerequisite edges (incl. bridge to B3)~~

### Verifier + session

- [x] ~~`quadratic-zero-product-verifier.ts` (reuse factor expand-and-compare) + router branch~~
- [x] ~~Integer-factorability reject + root substitution check~~
- [x] ~~Stage order + fixed items + templates + `verifyRendered`~~
- [x] ~~UI track picker + labels + assistance / childFacing~~

### Goldens

- [x] ~~Verifier table + wrong-answer matrix + track smoke~~

### Tracking

- [x] ~~Update README / BUILD_PLAN sequencing / BUILD_CARE / SKIPPED (B4.5 AUTHOR)~~
