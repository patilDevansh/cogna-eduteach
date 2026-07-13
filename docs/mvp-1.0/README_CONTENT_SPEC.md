# MVP 1.0 — Content Spec

> Freeze concept IDs before coding. Nearly every table and engine depends on them.  
> Question bank path: `content/question-bank/`. Items ship to students only when `reviewStatus: APPROVED`.

---

## 1. Learning unit

**Name:** Linear Equations Learning Unit (Grade 8 CBSE)

Not “all of Linear Equations” and not full CBSE Mathematics.

---

## 2. Stable concept catalog

| ID | Student-facing name | Kind | Prerequisites | masteryThreshold | minimumEvidence | Allowed types |
|---|---|---|---|---|---|---|
| `P1_INTEGER_ADD_SUB` | Integer addition and subtraction | PREREQ | — | 0.70 | 3 | NUMERIC, MCQ |
| `P2_NEGATIVE_OPS` | Negative-number operations | PREREQ | P1 | 0.70 | 3 | NUMERIC, MCQ |
| `P3_VARIABLES_CONSTANTS` | Variables and constants | PREREQ | P1 | 0.70 | 3 | MCQ, NUMERIC |
| `P4_SIMPLE_EXPRESSIONS` | Simple expressions | PREREQ | P3 | 0.70 | 3 | NUMERIC, MCQ |
| `P5_EQUALITY_BALANCE` | Equality and balance | PREREQ | P1, P3 | 0.75 | 3 | MCQ, NUMERIC |
| `C1_ONE_STEP_ADDITION` | One-step addition equations | CORE | P1, P5 | 0.75 | 4 | NUMERIC, MCQ |
| `C2_ONE_STEP_SUBTRACTION` | One-step subtraction equations | CORE | P1, P5 | 0.75 | 4 | NUMERIC, MCQ |
| `C3_ONE_STEP_MULTIPLICATION` | One-step multiplication equations | CORE | P2, P5 | 0.75 | 4 | NUMERIC, MCQ |
| `C4_ONE_STEP_DIVISION` | One-step division equations | CORE | P2, P5 | 0.75 | 4 | NUMERIC, MCQ |
| `C5_TWO_STEP_EQUATIONS` | Two-step equations | CORE | C1–C4 (any 3 of 4 at threshold) | 0.75 | 5 | NUMERIC, MCQ |
| `C6_SIMPLE_WORD_PROBLEMS` | Simple equation word problems | CORE | C5 or (C2+C3), P5 | 0.70 | 4 | WORD_PROBLEM, NUMERIC |

### Example JSON

```json
{
  "id": "C2_ONE_STEP_SUBTRACTION",
  "name": "One-step subtraction equations",
  "kind": "CORE",
  "prerequisites": ["P1_INTEGER_ADD_SUB", "P5_EQUALITY_BALANCE"],
  "masteryThreshold": 0.75,
  "minimumEvidence": 4,
  "allowedQuestionTypes": ["NUMERIC", "MCQ"],
  "misconceptionIds": ["SIGN_HANDLING", "INVERSE_OPERATION", "EQUALITY_IMBALANCE", "ARITHMETIC_SLIP"],
  "difficultyDimensions": [
    "positive_integers_only",
    "includes_negatives",
    "larger_magnitudes",
    "unfamiliar_variable_letter",
    "embedded_in_light_context"
  ],
  "advancementCriteria": {
    "masteryAtOrAbove": 0.75,
    "minimumEvidence": 4,
    "prerequisitesSatisfied": true,
    "noActiveMisconceptionAbove": 0.6
  }
}
```

### Difficulty (within concept only)

```text
1 = simplest within concept
2 = mild complexity (e.g. negatives for subtraction)
3 = standard Grade 8 item
4 = harder numbers / careful signs
5 = transfer / light unfamiliar framing (still same concept)
```

Decision may change difficulty by at most **±1** per decision inside a concept. Concept changes only for advance, prerequisite recovery, or due revision.

---

## 3. Misconception taxonomy (frozen)

Do **not** invent misconceptions dynamically at runtime.

| ID | Scope (concepts) | Observable pattern (summary) | minMatchingAttempts | activationConfidence |
|---|---|---|---|---|
| `SIGN_HANDLING` | C1, C2, C3, C4, C5 | Wrong sign when isolating; e.g. `x-7=11` → `x=4` or `x=-18` patterns tagged per item | 2 | 0.6 |
| `EQUALITY_IMBALANCE` | P5, C1–C5 | Operates on one side only | 2 | 0.6 |
| `INVERSE_OPERATION` | C1–C4 | Adds when should subtract (or ×/÷ swap) | 2 | 0.6 |
| `ARITHMETIC_SLIP` | P1, P2, C1–C5 | Conceptually right inverse, wrong arithmetic | 3 | 0.55 |
| `WORD_TO_EQUATION` | C6 | Incorrect translation of story to equation | 2 | 0.6 |

### Full example

```json
{
  "id": "SIGN_HANDLING",
  "conceptIds": [
    "C1_ONE_STEP_ADDITION",
    "C2_ONE_STEP_SUBTRACTION",
    "C3_ONE_STEP_MULTIPLICATION",
    "C4_ONE_STEP_DIVISION",
    "C5_TWO_STEP_EQUATIONS"
  ],
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

Answer-pattern matchers are **data on each question** (`misconceptionAnswerPatterns` optional) or a small versioned rule table — not free-form LLM classification in MVP.

---

## 4. Question bank targets

| Bucket | Count target |
|---|---|
| Prerequisite (P1–P5) | 40–60 |
| Core (C1–C6) | 100–150 |
| Per major misconception (tagged) | 15–25 each |
| Baseline blueprint pool | 20–30 |
| Delayed-revision equivalents | 20–30 |
| **Total reviewed** | **~200 APPROVED** |

### Required fields per question

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

`questionIntent` values used in bank tags: `STANDARD_PRACTICE` | `TARGET_MISCONCEPTION` | `REVIEW_PREREQUISITE` | `BASELINE_ASSESSMENT` | `RETEST_AFTER_EXPLANATION` | `CONCEPT_REINFORCEMENT` | `DISCRIMINATION`.

---

## 5. Seed bank status

Location: [`content/question-bank/`](./content/question-bank/)

- `manifest.json` — inventory counts and review status summary  
- `questions.json` — seed items (math-correct drafts)  
- All seeds start as `PENDING_REVIEW`  
- **Human Grade 8 CBSE reviewer must approve before production serve**

Gate: construction may use APPROVED subset in local/dev; pilot requires ~200 APPROVED or an explicitly accepted smaller pilot bank with documented coverage gaps.

---

## 6. Explanation templates

Minimum: one `STEP_BY_STEP` approved template per (`conceptId` × high-priority misconception) for C1–C5 and WORD_TO_EQUATION for C6. Stored in DB/`content/explanations/`; same review workflow.
