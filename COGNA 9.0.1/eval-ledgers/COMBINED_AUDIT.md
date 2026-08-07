# Combined algebra audit

API: `http://localhost:3001` · web: `http://localhost:3000` · student: `dev_student_001` · 2026-08-07T19:21:44.902Z

Harness: `run-combined-audit.mjs` → JSON under `combined-audit-runs/`.

| Case | Topics entered | AI selector | RULE selector | GENERATE/AUTHOR next | Trail fails | Summary snippet |
|---|---|---|---|---|---|---|
| 01_combined_all_correct | 5 (ENTRY_TWO_STEP, ENTRY_FRAC_SIMPLE, ENTRY_EXPAND_BINOMIAL, ENTRY_FACTOR_EXPAND, ENTRY_QUAD_STANDARD) | 14 | 9 | 2 | 0 | Thanks for working through those questions. It looks like mu… |
| 02_combined_arun_then_continue | 1 (ENTRY_TWO_STEP) | 4 | 2 | 0 | 0 | Thanks for working through those questions. You sometimes mi… |
| 03_combined_decline_on_main | 1 (ENTRY_TWO_STEP) | 3 | 0 | 0 | 0 | Thanks for working through those questions. You're getting s… |

## Browser smoke (COMBINED_ALGEBRA + debug=1)

Demo login → home **Full algebra check** → `/student/diagnostic-v2?track=COMBINED_ALGEBRA&debug=1`.

| Check | Result |
|---|---|
| Intro radio default | Full algebra check (all five topics) selected |
| Opening Why | RULE / PRE_WRITTEN — “Opening item of the combined algebra diagnostic…” |
| Entry item | `Solve for x: 3x + 5 = 20` (ENTRY_TWO_STEP) |
| Step verify | `3x = 15` → VALID; `x = 5` → VALID (deterministic) |
| After item complete | AI selector advanced to **ENTRY_VARIABLE_BOTH** (`4x - 7 = 2x + 9`), not the rule NegDist main stage |
| AI Why (next) | Skill-jargon Why citing `LIN_REMOVE_COEFFICIENT` → `LIN_SOLVE_VARIABLE_BOTH` |
| Hypotheses | AI WORKING_WELL on remove-constant / remove-coefficient, but MicroSkillState still shows **LIKELY_GAP** from lifetime counts |
| Debug panel | Items origin PRE_WRITTEN; stage decisions Rule then AI; next-item selection logged |

Session id sampled: `cmsjc216000fyy2xlkh76sqhq`.

## AI pick / explain trust findings (do not paper over)

1. **Lifetime pollution dominates.** Demo `dev_student_001` carries dozens of historical independent attempts. Child/parent summaries invent long gap lists even after an all-correct combined run (`invent_after_perfect` / false-gap family). Hypothesis text can say WORKING_WELL while UI status remains LIKELY_GAP.
2. **Parent “0 of N finished” bug.** API `parentFacingSummary` reports `0 of 23 questions finished` (and similar) despite a long solved trail — `itemsCompleted` / attempt status assembly is wrong for D.v2 reports.
3. **AI overrides rule backbone.** With selector on, GENERATE/SERVE can skip expected next stages (e.g. jump ENTRY_TWO_STEP → ENTRY_VARIABLE_BOTH, or inject GENERATE templates). Combined topic chaining still works when rule path is followed; AI can derail the thin backbone.
4. **Why text not child-safe.** Live Why includes internal skill ids / “next logical step” jargon (`option_jargon` / `wrong_skill_why` risk). Opening RULE Why is clear; AI Why is not trustworthy enough alone for a child.
5. **Automated trailFails=0 is weak.** Tag heuristics did not fire on polluted-summary cases; qualitative review still finds invent-after-perfect and 0/N finished.
6. **GENERATE/AUTHOR rare but present.** Case 01 had 2 GENERATE/AUTHOR next picks; most items stayed PRE_WRITTEN.
7. **Parent summary API-only.** `parentFacingSummary` present on complete payload; student UI still shows child-facing text only (expected).

## Acceptance vs peel goals

| Goal | Status |
|---|---|
| One session covers all 5 topic entries (API all-correct) | Met — 5 topic entries in case 01 |
| Gap doc ≥20 | Met — see `COMBINED_DIAGNOSTIC_GAPS.md` |
| UI + backend audit trail | Met — harness JSON + browser smoke + this doc |
| AI Why / next-question trustworthy for a child? | **No** — document known bugs; do not claim readiness |

## Per-case failure tags (automated)

### 01_combined_all_correct
- No automated failure tags.
- **Manual tags:** `invent_after_perfect_candidate`, `false_gap` (lifetime pollution), parent `0 of 23 finished`.
- Child summary: Thanks for working through those questions. It looks like multiplying two brackets is tricky right now, so keep practicing to get better at it. You're having some trouble matching the letters when breaking down these expressions, so keep practicing to get it right more often. It looks like you’ve had some trouble with this type of problem a few times, so it might help to practice it more. You're still having some trouble picking the right numbers to clear fractions, but keep practicing and you'll get it! You’re getting many of these right on your own, but there are still some mistakes that happen again and again. Let's spend a little time on expanding brackets that have a minus in front — it came up more than once. You’re having a hard time with expanding brackets right now, and it’s happening often, especially when fractions are involved. You're doing great at getting the letter on its own by dividing, with just a couple of small mistakes. You're doing a great job moving numbers across the equals sign, with just a few small mistakes here and there. We'll come back to it in a few days to make sure it stuck.
- Parent summary: Today your child worked through a short step-by-step algebra check (0 of 23 questions finished). They stayed engaged with the working lines. Areas to revisit: multiplying two brackets, factorising a trinomial that starts with x², difference of squares, clearing fractions by multiplying both sides, tidying up like terms, expanding brackets that have a minus in front, expanding brackets, dividing to get the letter on its own and moving a number across the equals sign (9 skill gaps noted). Spend a short practice block revisiting multiplying two brackets, factorising a trinomial that starts with x², difference of squares, clearing fractions by multiplying both sides, tidying up like terms, expanding brackets that have a minus in front, expanding brackets, dividing to get the letter on its own and moving a number across the equals sign. We'll schedule a short follow-up check in a few days.

### 02_combined_arun_then_continue
- No automated failure tags.
- **Manual:** same pollution / `0 of 7 finished`.
- Child summary: Thanks for working through those questions. You sometimes mix up like terms when working on your own, so keep practicing to get even better at it. You often mix up expanding brackets with a minus in front, so it might help to practice this more. It looks like you're having a hard time with expanding brackets, especially when fractions are involved, so keep practicing to get better at it. You’re doing great at getting the letter alone by dividing, with just a couple of small mistakes. You're doing great moving numbers across the equals sign, with just a few small mistakes here and there. We'll come back to it in a few days to make sure it stuck.
- Parent summary: Today your child worked through a short step-by-step algebra check (0 of 7 questions finished). They stayed engaged with the working lines. Areas to revisit: tidying up like terms, expanding brackets that have a minus in front, expanding brackets, dividing to get the letter on its own and moving a number across the equals sign (5 skill gaps noted). Spend a short practice block revisiting tidying up like terms, expanding brackets that have a minus in front, expanding brackets, dividing to get the letter on its own and moving a number across the equals sign. We'll schedule a short follow-up check in a few days.

### 03_combined_decline_on_main
- No automated failure tags.
- **Manual:** pollution / `0 of 4 finished`.
- Child summary: Thanks for working through those questions. You're getting some parts right when working with like terms, but there are still quite a few mistakes to work on. You're having a hard time with expanding brackets that have a minus in front, so keep practicing to get better at it. Let's spend a little time on dividing to get the letter on its own — it came up more than once. You’re doing a great job moving numbers across the equals sign, with just a few small mistakes here and there. We'll come back to it in a few days to make sure it stuck.
- Parent summary: Today your child worked through a short step-by-step algebra check (0 of 4 questions finished). They stayed engaged with the working lines. Areas to revisit: tidying up like terms, expanding brackets that have a minus in front, dividing to get the letter on its own and moving a number across the equals sign (4 skill gaps noted). Spend a short practice block revisiting tidying up like terms, expanding brackets that have a minus in front, dividing to get the letter on its own and moving a number across the equals sign. We'll schedule a short follow-up check in a few days.
