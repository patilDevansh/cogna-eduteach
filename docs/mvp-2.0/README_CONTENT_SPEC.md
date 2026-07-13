# MVP 2.0 — Content Spec

> Freeze concept IDs before coding. Nearly every table and engine depends on them.  
> **ID policy:** Keep MVP 1.0 stable IDs unless there is a strong, documented reason to rename.  
> Question bank path: `content/question-bank/`. Items ship to students only when `reviewStatus: APPROVED`.

---

## 1. Learning unit

**Name:** Linear Equations Learning Unit (Grade 8 CBSE)

Not “all of Linear Equations” and not full CBSE Mathematics.

---

## 2. Stable concept catalog

**Carried from MVP 1.0.** Do not rename `P2_NEGATIVE_OPS` or `C6_SIMPLE_WORD_PROBLEMS`.

| ID | Student-facing name | Kind | Prerequisites | masteryThreshold | minimumEvidence | Allowed types | Target APPROVED |
|---|---|---|---|---|---|---|---:|
| `P1_INTEGER_ADD_SUB` | Integer addition and subtraction | PREREQ | — | 0.70 | 3 | NUMERIC, MCQ | 20 |
| `P2_NEGATIVE_OPS` | Negative-number operations | PREREQ | P1 | 0.70 | 3 | NUMERIC, MCQ | 15 |
| `P3_VARIABLES_CONSTANTS` | Variables and constants | PREREQ | P1 | 0.70 | 3 | MCQ, NUMERIC | 15 |
| `P4_SIMPLE_EXPRESSIONS` | Simple expressions | PREREQ | P3 | 0.70 | 3 | NUMERIC, MCQ | 20 |
| `P5_EQUALITY_BALANCE` | Equality and balance | PREREQ | P1, P3 | 0.75 | 3 | MCQ, NUMERIC | 20 |
| `C1_ONE_STEP_ADDITION` | One-step addition equations | CORE | P1, P5 | 0.75 | 4 | NUMERIC, MCQ | 20 |
| `C2_ONE_STEP_SUBTRACTION` | One-step subtraction equations | CORE | P1, P5 | 0.75 | 4 | NUMERIC, MCQ | 25 |
| `C3_ONE_STEP_MULTIPLICATION` | One-step multiplication equations | CORE | P2, P5 | 0.75 | 4 | NUMERIC, MCQ | 20 |
| `C4_ONE_STEP_DIVISION` | One-step division equations | CORE | P2, P5 | 0.75 | 4 | NUMERIC, MCQ | 20 |
| `C5_TWO_STEP_EQUATIONS` | Two-step equations | CORE | C1–C4 (any 3 of 4 at threshold) | 0.75 | 5 | NUMERIC, MCQ | 25 |
| `C6_SIMPLE_WORD_PROBLEMS` | Simple equation word problems | CORE | C5 or (C2+C3), P5 | 0.70 | 4 | WORD_PROBLEM, NUMERIC | 20 |

Target total: **~220 authored**, at least **200 APPROVED** before pilot.

### ID alignment note (deliberate KEEP)

| Draft alias (do not use) | Canonical MVP 1.0 / 2.0 ID | Action |
|---|---|---|
| `P2_INTEGER_MUL_DIV` | `P2_NEGATIVE_OPS` | **KEEP** mvp-1.0 ID |
| `C6_WORD_PROBLEMS` | `C6_SIMPLE_WORD_PROBLEMS` | **KEEP** mvp-1.0 ID |

No migration of concept IDs is planned for MVP 2.0. Manifests and seeds must use canonical IDs only.

### Difficulty (within concept only)

```text
1 = simplest within concept
2 = mild complexity (e.g. negatives for subtraction)
3 = standard Grade 8 item
4 = harder numbers / careful signs
5 = transfer / light unfamiliar framing (still same concept)
```

Decision may change difficulty by at most **±1** per decision inside a concept.

---

## 3. Misconception taxonomy

Do **not** invent misconceptions dynamically at runtime.

### Existing (carried from MVP 1.0) — KEEP IDs

| ID | Scope (concepts) | Observable pattern (summary) | minMatchingAttempts | activationConfidence | Status |
|---|---|---|---|---|---|
| `SIGN_HANDLING` | C1–C5 | Wrong sign when isolating | 2 | 0.6 | **Existing** |
| `EQUALITY_IMBALANCE` | P5, C1–C5 | Operates on one side only | 2 | 0.6 | **Existing** |
| `INVERSE_OPERATION` | C1–C4 | Adds when should subtract (or ×/÷ swap) | 2 | 0.6 | **Existing** |
| `ARITHMETIC_SLIP` | P1, P2, C1–C5 | Conceptually right inverse, wrong arithmetic | 3 | 0.55 | **Existing** |
| `WORD_TO_EQUATION` | C6 | Incorrect translation of story to equation | 2 | 0.6 | **Existing** |

### New in MVP 2.0 (additive)

| ID | Scope (concepts) | Observable pattern (summary) | minMatchingAttempts | activationConfidence | Status |
|---|---|---|---|---|---|
| `VARIABLE_AS_OBJECT` | P3, P4 | Treats variable as a label/object rather than unknown quantity | 2 | 0.6 | **New** |
| `DISTRIBUTION_ERROR` | P4, C5 | Expands / distributes incorrectly across terms | 2 | 0.6 | **New** |
| `COMBINE_UNLIKE_TERMS` | P4, C5 | Combines variable terms with constants illegally | 2 | 0.6 | **New** |

### Rejected renames (do not introduce)

| Draft alias | Use instead |
|---|---|
| `EQUALITY_AS_ONE_SIDE` | `EQUALITY_IMBALANCE` |
| `INVERSE_OPERATION_CONFUSION` | `INVERSE_OPERATION` |
| `WORD_PROBLEM_TRANSLATION` | `WORD_TO_EQUATION` |

### Full example (carried shape; new misconception)

```json
{
  "id": "VARIABLE_AS_OBJECT",
  "conceptIds": ["P3_VARIABLES_CONSTANTS", "P4_SIMPLE_EXPRESSIONS"],
  "minimumMatchingAttempts": 2,
  "activationConfidence": 0.6,
  "alternativeExplanations": ["ARITHMETIC_SLIP", "question_misread", "guessing"],
  "resolutionRequirement": {
    "consecutiveCorrectTargetedQuestions": 2,
    "maximumHintLevel": 1
  },
  "remediationSequence": [
    "discrimination_question",
    "support_question",
    "explanation",
    "retest_question"
  ],
  "maxTargetedAttemptsBeforeExplanation": 2,
  "maxExplanationCycles": 2
}
```

Answer-pattern matchers remain **data on each question** (or a small versioned rule table) — not free-form LLM classification.

---

## 4. Question intents

```text
BASELINE_ASSESSMENT
STANDARD_PRACTICE
TARGET_MISCONCEPTION
RETEST_AFTER_EXPLANATION
REVIEW_PREREQUISITE
CONCEPT_REINFORCEMENT
DISCRIMINATION
RETENTION_REVIEW          // NEW bank tag for MVP 2.0
TRANSFER_CHECK            // NEW bank tag for MVP 2.0
```

---

## 5. Required fields per question

```json
{
  "id": "Q_C2_D2_001",
  "conceptId": "C2_ONE_STEP_SUBTRACTION",
  "difficulty": 2,
  "questionIntent": "STANDARD_PRACTICE",
  "type": "NUMERIC",
  "stem": "Solve: x - 7 = 11",
  "acceptedAnswers": ["18", "x=18", "x = 18", "18.0"],
  "misconceptionsTested": ["SIGN_HANDLING"],
  "prerequisiteConceptIds": ["P1_INTEGER_ADD_SUB"],
  "solutionSteps": ["Add 7 to both sides.", "x = 18."],
  "hintLadder": [
    "What operation is being applied to x?",
    "Use the opposite operation.",
    "Add 7 to both sides."
  ],
  "reviewStatus": "PENDING_REVIEW",
  "version": 1,
  "itemQualityWeight": 1.0
}
```

Every question must include: stable ID, version, concept ID, difficulty 1–5, question intent, stem, format, accepted answers, solution steps, hint ladder, misconceptions tested, misconception answer patterns where relevant, item quality weight, review status.

---

## 6. Transfer items

Transfer checks must not introduce new curriculum. They apply the same equation skill in:

- a word problem
- a reversed equation form
- a small distractor context

Tag with `questionIntent: TRANSFER_CHECK` and difficulty typically 3–5 within the same concept.

---

## 7. Explanation templates

For every high-priority concept × misconception pair:

- one `STEP_BY_STEP` template
- one short hint phrasing
- one parent-safe explanation
- one retest prompt mapping

Minimum: existing MVP 1.0 coverage for C1–C5 × high-priority misconceptions plus `WORD_TO_EQUATION` for C6; expand for new misconceptions before pilot.

---

## 8. Review status

```text
DRAFT -> PENDING_REVIEW -> APPROVED
PENDING_REVIEW -> CHANGES_REQUESTED
PENDING_REVIEW -> REJECTED
```

Only `APPROVED` can be served outside local dev.

## Content quality gates

- accepted answer verified
- solution steps verified
- misconception tags verified
- difficulty calibrated against rubric
- language child-safe
- no ambiguous wording
- no hidden multi-step concept unless tagged

---

## 9. Machine-readable inventory

MVP 2.0 should maintain (reuse MVP 1.0 seeds where possible):

- `content/concepts.json` — canonical IDs including `P2_NEGATIVE_OPS`, `C6_SIMPLE_WORD_PROBLEMS`
- `content/misconceptions.json` — existing + new IDs
- `content/question-bank/manifest.json`
- `content/question-bank/questions.json`
- `content/explanations/*.json`
