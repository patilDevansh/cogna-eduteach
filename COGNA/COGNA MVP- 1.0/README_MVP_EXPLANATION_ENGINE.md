# Cogna MVP 1.0 — Explanation Engine

> Depends on [Shared Contracts](./README_MVP_CONTRACTS.md). Serves explanations and hints; does not decide *when* an explanation is pedagogically required (Decision does), except fulfilling student-requested hints.

## Purpose

Provide a short, accurate explanation or the next approved hint for the student's mistake/context.

---

## MVP Scope

- Text only
- Approved human-written templates
- Fixed step-by-step / analogy styles as tagged
- Hint ladders stored on questions; this engine selects the next level
- Linear Equations Learning Unit
- No video, animation, voice, or unvalidated LLM math

---

## When It Is Called

1. Decision: `uiAction: SHOW_EXPLANATION` (remediation or support)
2. Decision: `uiAction: SHOW_HINT` (proactive)
3. Student: `POST /practice/hint` → Loop → this engine (Contracts §5)

---

## Inputs

```json
{
  "studentId": "student_104",
  "questionId": "q_204",
  "question": "Solve: x - 6 = 10",
  "studentAnswer": "4",
  "correctAnswer": "16",
  "conceptId": "one-step-equations",
  "suspectedMisconception": {
    "type": "sign_handling",
    "confidence": 0.72
  },
  "requestedStyle": "STEP_BY_STEP",
  "mode": "EXPLANATION",
  "currentHintLevel": 0
}
```

`mode`: `EXPLANATION` | `HINT`.

---

## Outputs

### Explanation

```json
{
  "uiAction": "SHOW_EXPLANATION",
  "explanation": {
    "style": "STEP_BY_STEP",
    "content": "The equation subtracts 6 from x. To undo that, add 6 to both sides. x - 6 + 6 = 10 + 6, so x = 16.",
    "checkForUnderstanding": "What operation should undo subtracting 6?",
    "followUpIntent": "RETEST_AFTER_EXPLANATION"
  },
  "metadata": {
    "templateId": "sign-handling-step-v1",
    "version": 1,
    "reviewStatus": "APPROVED"
  }
}
```

`followUpIntent` is a **hint to Decision**, not permission to auto-fetch a question. Loop must call Decision again (Contracts §14).

### Hint

```json
{
  "uiAction": "SHOW_HINT",
  "hint": {
    "level": 2,
    "content": "Which opposite operation would undo subtracting 6?"
  },
  "metadata": {
    "source": "QUESTION_HINT_LADDER",
    "questionId": "q_204"
  }
}
```

---

## Hint Ladder Levels

1. Nudge  
2. Guiding question  
3. Partial scaffold  
4. Full explanation — only via `SHOW_EXPLANATION` / allowed stage, not as a casual hint

---

## Template Selection

```text
concept + misconception + requested style → approved template
```

---

## Validation

- Template approved
- Matches answer key
- Targets documented misconception when provided
- Math steps valid
- Age-appropriate language
- No unsupported learner labels
- No premature full dump on early hint levels

---

## Outcome Measurement

Loop links explanation id to subsequent attempts. Diagnostic evaluates later performance. This engine does not update mastery.

---

## Interface

```ts
interface ExplanationRequest {
  studentId: string;
  questionId: string;
  conceptId: string;
  studentAnswer?: string;
  correctAnswer?: string;
  misconceptionKey?: string;
  requestedStyle: "HINT" | "STEP_BY_STEP" | "ANALOGY";
  mode: "EXPLANATION" | "HINT";
  currentHintLevel?: number;
}

interface ExplanationResult {
  kind: "EXPLANATION" | "HINT";
  content: string;
  checkForUnderstanding?: string;
  followUpIntent?: "RETEST_AFTER_EXPLANATION";
  hintLevel?: number;
  metadata: { templateId?: string; version?: number; questionId?: string };
}
```

---

## Acceptance Criteria

- Every explanation from approved template and mathematically correct
- Hints advance one level at a time from question ladder
- No auto next-question fetch
- Versions stored
- Safe fallback template if specific mapping missing

---

## Simplest Definition

> **The MVP Explanation Engine returns approved text explanations and the next hint level, then lets Decision choose the re-test.**
