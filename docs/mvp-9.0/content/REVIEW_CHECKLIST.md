# MVP 9.0 Content Review Checklist — Rational Expressions

> Everything ships `PENDING_REVIEW`; nothing here should move to `APPROVED` without both sign-offs below.

## Sign-off

| Reviewer | Unit | Date | Signature |
|---|---|---|---|
| TBD (math) | rational-expressions | TBD | TBD |
| TBD (product/copy) | rational-expressions | TBD | TBD |

## Per question

- [ ] The numerator, expanded from the stated factors, exactly matches the stem's polynomial
- [ ] The simplified answer is fully reduced (no leftover common factor)
- [ ] `misconceptionAnswerPatterns` wrong answers represent a genuinely incomplete simplification, not an unrelated value
- [ ] `unitId` is `"rational-expressions"`
- [ ] Denominator is never zero for any value implied by the question (no `x=0`-style traps left unstated)

## Freeze

- [ ] No ID collisions with any prior concept/question namespace (`P#_*`, `C#_*`, `SE_*`, `ID_*`, `FAC_*`, `EXP_*`)
- [ ] Confirms `FAC_C1_COMMON_FACTOR` explanation content already covers "pull out the full factor" — `RAT_C1` reuses `INCOMPLETE_FACTOR_EXTRACTION` rather than inventing a new misconception, so no new explanation authoring is required, only a sanity check that the existing one still reads naturally applied here
