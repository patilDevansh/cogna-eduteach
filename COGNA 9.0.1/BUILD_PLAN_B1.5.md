# MVP 9.0.1 — Phase B1.5: Fraction AUTHOR gate

> Follow-on to [`BUILD_PLAN_B.md`](./BUILD_PLAN_B.md).
> Use `~~strikethrough~~` when completed.

## One line

Enable selector `AUTHOR` for the fraction-linear grammar by routing authored equations through the existing A2 `gateAuthoredItem` pattern with fraction skill signatures — never show unverified AI maths.

## Decisions locked

1. Templates remain the preferred path (G1.3); AUTHOR only when the model can state why templates do not fit.
2. Accept skills for authoring: `LIN_CLEAR_FRACTIONS`, `LIN_SOLVE_FRACTIONS` (must be checkable on the printed equation).
3. Reject path must cover: parse fail, claimed-answer mismatch, duplicate, out-of-range, skill not exercised, forbidden terms, non-integer solution.

## Checklist

### Gate

- [x] ~~Extend `gateAuthoredItem` skill signatures for `LIN_CLEAR_FRACTIONS` / `LIN_SOLVE_FRACTIONS` (fraction syntax + dens)~~
- [x] ~~Reuse independent substitute path (already handles `/`) + linear parse of fraction equations~~
- [x] ~~Keep linear-bracket AUTHOR path unchanged for Phase A skills~~

### Goldens

- [x] ~~Accept: authored clear-fractions equation with matching claimed solution → `AI_AUTHORED`~~
- [x] ~~Reject: claimed answer mismatch~~
- [x] ~~Reject: equation without `/` tagged `LIN_CLEAR_FRACTIONS` → `SKILL_NOT_EXERCISED`~~

### Tracking

- [x] ~~Strike B1.5 AUTHOR skip from [`SKIPPED.md`](./SKIPPED.md); update README~~
