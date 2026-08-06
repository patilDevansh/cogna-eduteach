# MVP 6.0 Content Review Checklist — Algebraic Identities

> First hand-authored batch for the `algebraic-identities` unit. Everything ships `PENDING_REVIEW`; nothing here should move to `APPROVED` without both sign-offs below.

## Sign-off

| Reviewer | Unit | Date | Signature |
|---|---|---|---|
| TBD (math) | algebraic-identities | TBD | TBD |
| TBD (product/copy) | algebraic-identities | TBD | TBD |

## Per question

- [ ] Expansion is algebraically correct (spot-check by hand or CAS, not just visually)
- [ ] `acceptedAnswers` covers the reasonable formatting variants a student would actually type
- [ ] Every `misconceptionAnswerPatterns` entry is genuinely reachable by the described wrong move (re-derive the wrong path, don't just trust the label)
- [ ] `unitId` is `"algebraic-identities"` — not backfilled to `linear-equations-one-variable`
- [ ] `hintLadder` never gives away the final answer before the last hint
- [ ] Difficulty ordering within `ID_C4_TWO_BINOMIAL_IDENTITY` actually progresses (positive/positive → mixed sign → both negative → larger numbers)

## Freeze

- [ ] `ID_C4_TWO_BINOMIAL_IDENTITY` (the B4 priority skill) reaches its 9-question target with at least one question per sign pattern (++, +-, -+, --)
- [ ] No ID collisions with `P#_*`, `C#_*`, or `SE_*` concept/question IDs
- [ ] `CONSTANT_ADDITION_ERROR` and `MIDDLE_TERM_OMISSION` explanations exist in `docs/mvp-1.0/content/explanations/templates.json` before any question targeting them goes `APPROVED`
