# Cogna MVP 1.0 — Question Generator

> Depends on [Shared Contracts](./README_MVP_CONTRACTS.md). Selects questions; does not choose learning intent.

## Purpose

Convert a `LearningDecision` (question path) into the exact reviewed question shown next.

> Decision Engine: what should happen?  
> Question Generator: which validated question performs that intent?

---

## MVP Scope

**Linear Equations Learning Unit** bank (Contracts §7), including prerequisite concepts required for `REVIEW_PREREQUISITE`.

- Human-reviewed only
- MCQ and numeric
- Difficulty 1–5 **per concept** (Contracts §4)
- Concept, misconception, prerequisite tags
- Fixed solution steps and hint ladders (stored on question; hints served via Explanation Engine)
- No unchecked LLM generation

---

## Inputs

Derived from `LearningDecision`:

```json
{
  "studentId": "student_104",
  "conceptId": "one-step-equations",
  "difficulty": 2,
  "learningIntent": "TARGET_MISCONCEPTION",
  "targetMisconception": "sign_handling",
  "preferredQuestionType": "NUMERIC",
  "recentQuestionIds": ["q_101", "q_102"],
  "revisionItemId": null,
  "sessionMode": "ADAPTIVE_PRACTICE"
}
```

For baseline: `learningIntent: BASELINE_ASSESSMENT` + blueprint slot from Decision/Loop.

---

## Outputs

```json
{
  "question": {
    "id": "q_204",
    "stem": "Solve: x - 6 = 10",
    "type": "NUMERIC",
    "difficulty": 2,
    "conceptId": "one-step-equations",
    "correctAnswer": "16",
    "hintLadder": [
      "What operation is being applied to x?",
      "Which opposite operation undoes subtracting 6?",
      "Add 6 to both sides."
    ]
  },
  "selectionMetadata": {
    "source": "QUESTION_BANK",
    "learningIntent": "TARGET_MISCONCEPTION",
    "selectorVersion": "question-selector-v1",
    "reasoning": "Reviewed question matching concept, within-concept difficulty, and sign-handling tag.",
    "score": 95
  }
}
```

---

## Selection Pipeline

```text
Receive request from LearningDecision
→ filter approved questions
→ match conceptId
→ match learningIntent / misconception tags as required
→ match difficulty within concept
→ exclude recent questions
→ verify prerequisite tags if needed
→ rank candidates
→ return highest-ranked
→ store selection reasoning
```

### Ranking (versioned)

```text
+40 exact concept match
+25 learning-intent / tag match
+20 misconception-tag match when targeting
+10 exact difficulty match
+5 preferred question-type match
-100 recently used
-100 unapproved
-50 missing prerequisite fit
```

---

## Safe Fallback

1. Same concept, same intent, nearest difficulty
2. Same concept, standard practice, nearest difficulty
3. Prerequisite concept question
4. Signal Loop to end session safely

Never serve unchecked generated questions.

---

## Required Metadata

`id`, `stem`, `type`, `correctAnswer`, `conceptId`, `difficulty`, intent/misconception/prerequisite tags, `solutionSteps`, `hintLadder`, `reviewStatus`, `version`.

---

## Interface

```ts
interface QuestionRequest {
  studentId: string;
  conceptId: string;
  difficulty: number;
  learningIntent: LearningIntent;
  targetMisconception?: string;
  preferredQuestionType?: "MCQ" | "NUMERIC" | "WORD_PROBLEM";
  recentQuestionIds: string[];
  revisionItemId?: string;
}

interface QuestionSelectionResult {
  question: Question;
  selectionMetadata: {
    selectorVersion: string;
    source: "QUESTION_BANK";
    learningIntent: LearningIntent;
    reasoning: string;
    score: number;
  };
}
```

---

## Non-Goals

No diagnosis, mastery update, intent choice, or direct LLM questions to students.

---

## Acceptance Criteria

- Every returned question approved with verified answer
- Difficulty interpreted within concept
- Prerequisite intents only satisfied by prerequisite-tagged items
- Recent questions excluded
- Fallback deterministic
- Selection reasoning stored
- Selection latency target: under 300 ms for MVP bank size

---

## Simplest Definition

> **The MVP Question Generator selects the best reviewed Learning-Unit question for the current LearningDecision.**
