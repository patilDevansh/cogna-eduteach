# MVP 2.0 — Personalization

> Personalization means evidence-driven adaptation. It does not mean guessing permanent labels from weak data.

## Personalization Contract

Every personalized experience must trace:

```text
raw evidence -> diagnostic factor -> decision parameter -> content choice -> outcome measurement
```

If any link is missing, the feature stays generic.

## Diagnostic Factors

| Factor | MVP 2.0 use |
|---|---|
| Mastery | Difficulty, prerequisite review, advancement |
| Misconception confidence | Targeted questions, explanation style, retest |
| Confidence calibration | Difficulty caution, parent uncertainty notes |
| Hint dependence | Hint ladder depth, mastery weighting |
| Retention estimate | Due revision and weekly plan |
| Learning velocity | Report trend, workload pacing |
| Error recovery | Whether to use hint, explanation, or easier bridge |
| Explanation effectiveness | Template ranking after enough evidence |
| Engagement pattern | Break suggestion and shorter session plans |
| Item statistics | QG ranking and discrimination questions |

## Personalization Surfaces

| Surface | Controlled by | Examples |
|---|---|---|
| Next concept | Decision Engine | continue C2, review P1 prereq, transfer to C5 |
| Difficulty | Decision Engine | +1 on independent streak, -1 on struggle |
| Question intent | Decision Engine | `TARGET_MISCONCEPTION`, `RETENTION_REVIEW`, `TRANSFER_CHECK` |
| Question format | QG + contentStyle | numeric, MCQ, word problem |
| Hint level | Explanation Engine | first nudge vs scaffold |
| Explanation style | Decision + Explanation | step-by-step, analogy, worked example |
| Revision queue | Recommendation + Revision | daily cap, due concepts |
| Session pacing | Decision | break, end session, shorter plan |
| Parent report | Report Generator | trends, uncertainty, next step |
| Student copy | UI policy | encouragement, progress, no labels |

## Example Trace: Sign Handling

```text
Evidence:
  Student answers x - 7 = 11 with 4

Diagnostic:
  misconception SIGN_HANDLING confidence rises

Decision:
  SHOW_QUESTION + TARGET_MISCONCEPTION

QG:
  selects approved sign-handling discrimination item

If repeated failure:
  SHOW_EXPLANATION + STEP_BY_STEP

After explanation:
  RETEST_AFTER_EXPLANATION

Report:
  "A sign-handling pattern is being checked; more practice will confirm."
```

## Example Trace: Fatigue

```text
Evidence:
  sessionMinutes = 12, slower responses, idle spike count >= 2
  (and sessionMinutes < 15 — hard stop not reached)

Diagnostic:
  engagement pattern = fatigue risk, confidence medium

Decision:
  uiAction: SUGGEST_BREAK
  learningIntent: BREAK_FOR_FATIGUE
  parameters.breakMinutes: 3

UI:
  "Let's take a short break and come back fresh."

If sessionMinutes >= 15 OR questionCount >= sessionLimit:
  emit END_SESSION only — never SUGGEST_BREAK (see README_RULES.md §12)
```

## Do Not Personalize

Never personalize on:

- one wrong answer
- one slow answer
- one skipped confidence prompt
- parent preference alone
- inferred clinical/attention condition
- unreviewed generated content

## Student-Safe Language

| Internal | Student-safe |
|---|---|
| Low mastery | Let's practice this a little more |
| Misconception active | This pattern needs another check |
| Overconfident | Let's slow down and verify |
| Hint dependent | Try one step before a hint |
| Fatigue risk | Time for a short break |

## Parent Language

Parent reports may include:

- observed facts: questions attempted, accuracy, hints used
- cautious inference: possible pattern, still confirming
- next action: revision plan, one support suggestion

Parent reports must not include:

- clinical labels
- raw internal state names
- overconfident certainty from weak evidence
- ranked weakness lists without context
