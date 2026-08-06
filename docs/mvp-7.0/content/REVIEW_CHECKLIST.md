# MVP 7.0 Content Review Checklist — Factorisation

> Runs the `algebraic-identities` unit in reverse. Everything ships `PENDING_REVIEW`; nothing here should move to `APPROVED` without both sign-offs below.

## Sign-off

| Reviewer | Unit | Date | Signature |
|---|---|---|---|
| TBD (math) | factorisation | TBD | TBD |
| TBD (product/copy) | factorisation | TBD | TBD |

## Per question

- [ ] The proposed factorisation, expanded back out, exactly matches the stem's polynomial
- [ ] `acceptedAnswers` covers the reasonable formatting variants (compact and spaced), and never shows a stray "1x" or "1(...)" coefficient
- [ ] Every `misconceptionAnswerPatterns` entry is a genuinely reachable wrong move, not just "a" wrong answer
- [ ] `unitId` is `"factorisation"`
- [ ] `FAC_C4_TRINOMIAL` items span all four sign patterns (++, +-, -+, --), not just positive pairs

## Freeze

- [ ] `FAC_C4_TRINOMIAL` (the priority skill) has coverage comparable to its mvp-6.0 counterpart `ID_C4_TWO_BINOMIAL_IDENTITY`
- [ ] No ID collisions with `P#_*`, `C#_*`, `SE_*`, or `ID_*` concept/question IDs
- [ ] `WRONG_FACTOR_PAIR`, `INCOMPLETE_FACTOR_EXTRACTION`, and `INCOMPLETE_REGROUPING` explanations exist in `docs/mvp-1.0/content/explanations/templates.json` before any question targeting them goes `APPROVED`
