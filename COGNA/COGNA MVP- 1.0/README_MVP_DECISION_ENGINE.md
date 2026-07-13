# Cogna MVP 1.0 — Decision Engine

> Depends on [Shared Contracts](./README_MVP_CONTRACTS.md). Emits only the shared `LearningDecision` schema.

## Purpose

Choose the next best learning action from the updated learner state.

> **Given what Cogna currently believes, what should happen next?**

Does not diagnose, grade, or generate content text.

---

## Output Contract

**Only** Contracts §1 — `uiAction` + `learningIntent` + `contentStyle` + `parameters`.

### Example

```json
{
  "uiAction": "SHOW_QUESTION",
  "learningIntent": "TARGET_MISCONCEPTION",
  "contentStyle": {
    "questionFormat": "NUMERIC"
  },
  "parameters": {
    "conceptId": "one-step-equations",
    "difficulty": 2,
    "targetMisconception": "sign_handling"
  },
  "confidence": 0.84,
  "reasoning": "Remediation state TARGETING; second support question after failed discrimination item.",
  "decisionVersion": "decision-rules-v1"
}
```

Never emit legacy flat actions like `EASIER_QUESTION` or `TARGET_MISCONCEPTION` as the sole `action` field.

---

## Inputs

- `sessionMode`: `BASELINE` | `ADAPTIVE_PRACTICE`
- Active concept, current difficulty (within concept)
- Last 3–5 attempts
- Concept mastery + confidence
- Active misconception flags + **remediation states** (Contracts §8)
- Hint dependence, confidence calibration
- Due revision queue items (read-only)
- Session length, question count
- Whether an explanation was just shown (for re-test)

---

## Priority Order (MVP)

Contracts §8:

1. Safety or session ending → `uiAction: END_SESSION` (or `SUGGEST_BREAK`)
2. Post-explanation re-test → `SHOW_QUESTION` + `RETEST_AFTER_EXPLANATION`
3. Explanation required after failed targeted attempts → `SHOW_EXPLANATION` + appropriate intent
4. Due revision → `SHOW_QUESTION` + `EXECUTE_DUE_REVISION` + `revisionItemId`
5. Misconception targeting → `SHOW_QUESTION` + `TARGET_MISCONCEPTION`
6. Prerequisite review → `SHOW_QUESTION` + `REVIEW_PREREQUISITE` (only if bank has prerequisite concepts)
7. Difficulty adaptation → `INCREASE_DIFFICULTY` / `DECREASE_DIFFICULTY` / `STANDARD_PRACTICE`
8. Normal practice → `STANDARD_PRACTICE`

### Difficulty vs concept

Contracts §4: change difficulty inside concept by at most **one level** per decision. Change `conceptId` only for advance, prerequisite recovery, or due revision.

### Misconception remediation

Do not re-apply targeting forever while confidence stays high. Advance remediation state:

```text
UNCONFIRMED → TARGETING → EXPLANATION_REQUIRED → RETESTING → RESOLVED | STILL_ACTIVE
```

Typical targeting budget before explanation: one discrimination question + one support question (then explanation if still incorrect).

---

## Baseline Policy

When `sessionMode = BASELINE` (Contracts §9):

- Follow fixed blueprint order via `learningIntent: BASELINE_ASSESSMENT`
- Do not run aggressive adaptive rules
- After blueprint complete (or enough evidence), Loop/session switches to `ADAPTIVE_PRACTICE`

---

## Rule Sketches (after priority gates)

```text
2+ correct at current difficulty, low hint use
→ uiAction SHOW_QUESTION, learningIntent INCREASE_DIFFICULTY, difficulty + 1

2+ incorrect
→ SHOW_QUESTION, DECREASE_DIFFICULTY, difficulty - 1 (min 1)

mixed
→ SHOW_QUESTION, STANDARD_PRACTICE, same difficulty

mastery high + prerequisites ok
→ may advance conceptId (separate from difficulty bump)
```

All rules versioned as `decision-rules-v1`.

---

## Constraints

- Low-confidence diagnostics → conservative actions only
- Avoid repeating the same intent indefinitely without state change
- Every decision has readable reasoning
- Safe default: `SHOW_QUESTION` + `STANDARD_PRACTICE` at current concept/difficulty
- Fallback path if no question possible: decrease difficulty → prerequisite concept → `END_SESSION`
- `fallbackGenerated: true` when Decision computation fails and Loop injects safe default (Contracts §2)

---

## Interface

```ts
interface DecisionInput {
  studentId: string;
  sessionId: string;
  sessionMode: "BASELINE" | "ADAPTIVE_PRACTICE";
  activeConceptId: string;
  currentDifficulty: number;
  recentAttempts: AttemptSummary[];
  mastery: MasterySummary;
  diagnosticFactors: DiagnosticFactorSummary[];
  remediationStates: MisconceptionRemediationState[];
  revisionItemsDue: RevisionQueueItem[];
  sessionState: SessionState;
  lastExplanationId?: string;
}

// LearningDecision — see Contracts §1
```

---

## Outcome Storage

Store: input snapshot, full `LearningDecision`, alternatives considered (optional), next content id, later outcome for evaluation.

---

## Acceptance Criteria

- Only shared schema emitted
- Reproducible under `decisionVersion`
- Difficulty jumps ≤ 1 within concept
- Remediation state prevents infinite misconception drilling
- Prerequisite intent only when bank supports it
- Duplicate events do not create duplicate decisions (Loop idempotency)
- Fallback deterministic

---

## Later Path

Candidate scoring, bandits, session planning, experiments — **not MVP**.

---

## Simplest Definition

> **The MVP Decision Engine converts learner state into one safe, explainable LearningDecision using the shared contract.**
