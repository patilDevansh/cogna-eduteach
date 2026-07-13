# Cogna MVP 1.0 — Shared Contracts

> **Canonical implementation source.** Every MVP engine README must reference this file. Do not redefine these contracts elsewhere.

This document is the single source of truth for:

1. Shared action schema
2. Processing states and durability
3. Engine ownership matrix
4. Concept vs difficulty
5. Hint ownership
6. Revision ownership
7. Learning-unit scope
8. Cold-start / baseline
9. Confidence scale and mastery equation
10. Report triggers
11. Success-metric categories
12. External terminology

Mature / future architecture lives in the parent `COGNA/` folder and must not override these MVP contracts.

---

## 1. Shared Action Contract

UI display, learning reason, and content presentation are **separate fields**. Never collapse them into one enum.

```ts
type UiAction =
  | "SHOW_QUESTION"
  | "SHOW_EXPLANATION"
  | "SHOW_HINT"
  | "END_SESSION"
  | "SUGGEST_BREAK";

type LearningIntent =
  | "STANDARD_PRACTICE"
  | "INCREASE_DIFFICULTY"
  | "DECREASE_DIFFICULTY"
  | "TARGET_MISCONCEPTION"
  | "REVIEW_PREREQUISITE"
  | "EXECUTE_DUE_REVISION"
  | "RETEST_AFTER_EXPLANATION"
  | "CONCEPT_REINFORCEMENT"
  | "BASELINE_ASSESSMENT";

interface ContentStyle {
  questionFormat?: "NUMERIC" | "MCQ" | "WORD_PROBLEM";
  explanationStyle?: "HINT" | "STEP_BY_STEP" | "ANALOGY";
}

interface DecisionParameters {
  conceptId: string;
  difficulty?: number; // 1–5 within the concept
  targetMisconception?: string;
  revisionItemId?: string;
  explanationId?: string;
  hintLevel?: number;
}

interface LearningDecision {
  uiAction: UiAction;
  learningIntent: LearningIntent;
  contentStyle?: ContentStyle;
  parameters: DecisionParameters;
  confidence: number; // 0–1
  reasoning: string;
  decisionVersion: string;
  fallbackGenerated?: boolean;
}
```

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
  "reasoning": "Repeated sign-handling errors at difficulty 3. Isolate the suspected misconception at a lower difficulty.",
  "decisionVersion": "decision-rules-v1"
}
```

### Mapping rules

| Need | Field |
|---|---|
| What the student sees | `uiAction` |
| Why the system chose it | `learningIntent` |
| How content is shaped | `contentStyle` |
| Which concept / difficulty / misconception | `parameters` |

Question Generator receives `learningIntent` + `parameters` + `contentStyle.questionFormat`.  
Explanation Engine receives `uiAction` of `SHOW_EXPLANATION` or `SHOW_HINT` plus `contentStyle.explanationStyle` and `parameters`.

---

## 2. Processing States and Durability

The Learning Loop must **not** use one giant transaction for attempt + profile + decision + content.

### Processing states

```text
RECEIVED
VALIDATED
GRADED
PROFILE_UPDATED
DECIDED
CONTENT_RESOLVED
COMPLETED
FAILED_RETRYABLE
FAILED_PERMANENT
```

Each stage is idempotent. Replaying the same `eventId` must not double-apply side effects.

### Staged transactions

#### Transaction 1 — preserve evidence

Always commits once the answer/event is valid:

- event
- attempt
- grading result
- processing status = `GRADED`

If later stages fail, the attempt remains.

#### Transaction 2 — update learner state

- diagnostic output
- mastery changes
- learner-profile version
- processing status = `PROFILE_UPDATED`

On failure: keep attempt; mark `FAILED_RETRYABLE`; retry diagnosis later; do not invent a diagnosis.

#### Transaction 3 — select next action

- Decision Engine input snapshot
- `LearningDecision`
- decision version
- processing status = `DECIDED`

On failure: keep profile update; emit a safe fallback decision (`SAME` difficulty / reviewed question); mark `fallbackGenerated: true`.

#### Transaction 4 — resolve content

- selected question or explanation/hint
- response returned to UI
- processing status = `CONTENT_RESOLVED` then `COMPLETED`

On failure: safe reviewed fallback content, or end session if none exists.

### Failure summary

| Stage fails | Keep | Do next |
|---|---|---|
| Validation | nothing written | reject event |
| Grading / evidence | N/A (must succeed or reject) | retryable client error if DB fails |
| Profile update | attempt + grade | retry diagnosis |
| Decision | attempt + profile | fallback decision |
| Content | attempt + profile + decision | fallback content or end session |

---

## 3. Engine Ownership Matrix

| Concern | Owner | Must not |
|---|---|---|
| Event validation, idempotency, orchestration | Learning Loop | Diagnose, decide intent, generate content |
| Grading | Learning Loop (deterministic grader) | Use LLM for simple numeric/algebraic finals |
| Mastery / misconception / calibration / hint-dependence estimates | Diagnostic Engine | Write revision queue; choose next UI action |
| Next `LearningDecision` | Decision Engine | Grade, diagnose, generate question/explanation text |
| Select reviewed question | Question Generator | Diagnose; choose learning intent |
| Select/format explanation or hint | Explanation Engine | Decide *whether* explanation is needed (except serving student-requested hints) |
| Propose revision items | Recommendation Engine | Pick immediate next question; write queue directly |
| Write / dedupe / status of revision queue | Revision Service | Diagnose; decide live action |
| Execute due revision now | Decision Engine reads queue; Learning Loop executes via Revision Service | Diagnostic writing queue items |
| Student/parent summaries | Report Generator | Run on every answer; invent facts |
| Baseline sequencing policy | Decision Engine (`sessionMode = BASELINE`) | Separate baseline engine |

---

## 4. Concept vs Difficulty

They must not double-encode progression.

- **Concept** = what knowledge is being tested (`conceptId`).
- **Difficulty** = how challenging the item is **within that concept** (1–5).

### Example

```text
Concept: one-step-equations
  D1: x + 3 = 7
  D2: x - 8 = -2
  D3: -3x = 15
  D4: x / -4 = 6
  D5: one-step equation in unfamiliar context

Concept: two-step-equations
  (own independent 1–5 scale)
```

### Decision rules for changing them

- Adjust **difficulty** inside the current concept for normal adaptation.
- Change **concept** only when:
  - mastery threshold is met and prerequisites are satisfied (advance), or
  - prerequisite recovery is required (`REVIEW_PREREQUISITE`), or
  - a due revision item targets another concept (`EXECUTE_DUE_REVISION`).

`parameters.conceptId` and `parameters.difficulty` do not compete.

---

## 5. Hint Ownership

MVP ownership:

1. **Question** stores an approved `hintLadder`.
2. **Explanation Engine** selects and formats the next hint level.
3. **Learning Loop** routes `POST /practice/hint` and records `HINT_REQUESTED`.
4. **Diagnostic Engine** observes hint use as evidence.
5. **Decision Engine** does **not** approve student-requested hints.

### Student-requested hint

```text
Student requests hint
→ Learning Loop records HINT_REQUESTED
→ Explanation Engine returns next approved hint level
→ hint returned to UI
→ hint usage becomes diagnostic evidence
```

### Proactive hint

Decision may choose:

```ts
uiAction: "SHOW_HINT"
learningIntent: "CONCEPT_REINFORCEMENT" // or other support intent
```

Both proactive and student-requested hints go through the Explanation Engine.

---

## 6. Revision Ownership

```text
Diagnostic Engine     → estimates revision need (signal only)
Recommendation Engine → proposes revision item drafts
Revision Service      → writes, deduplicates, updates queue status
Decision Engine       → reads due items; may choose EXECUTE_DUE_REVISION
Learning Loop         → executes via Revision Service + Question Generator
```

The Diagnostic Engine **never** writes the revision queue.

When Decision chooses `EXECUTE_DUE_REVISION`:

```ts
uiAction: "SHOW_QUESTION"
learningIntent: "EXECUTE_DUE_REVISION"
parameters: { conceptId, difficulty, revisionItemId }
```

---

## 7. Learning-Unit Scope

MVP domain name:

> **Linear Equations Learning Unit**

Not “Linear Equations questions only.”

### Included reviewed bank

Prerequisite and core concepts required to diagnose Linear Equations:

- integer addition and subtraction
- negative numbers
- arithmetic operations
- variables and constants
- simple expressions
- equality and balancing
- one-step equations
- two-step equations

This is **not** the full CBSE Mathematics syllabus. It is the minimum prerequisite graph needed for honest diagnosis.

Without prerequisite questions in the bank, `REVIEW_PREREQUISITE` must not be emitted.

Optional stretch inside the same unit (if bank coverage exists):

- equations with brackets
- word-problem translation

---

## 8. Misconception Remediation State Machine

Do not loop forever on `TARGET_MISCONCEPTION` when confidence stays high.

### States

```text
UNCONFIRMED
TARGETING
EXPLANATION_REQUIRED
RETESTING
RESOLVED
STILL_ACTIVE
```

### Flow

```text
Detect suspected misconception
→ ask one targeted discrimination question
→ if incorrect, ask one targeted support question
→ if still incorrect, show explanation
→ ask a similar but new re-test question
→ update misconception confidence / state
```

Decision must read recent remediation history before re-applying the misconception rule.

### Decision priority (MVP)

1. Safety or session ending
2. Post-explanation re-test (`RETEST_AFTER_EXPLANATION`)
3. Explanation required after failed targeted attempts
4. Due revision (`EXECUTE_DUE_REVISION`)
5. Misconception targeting (`TARGET_MISCONCEPTION`)
6. Prerequisite review (`REVIEW_PREREQUISITE`)
7. Difficulty adaptation (`INCREASE_DIFFICULTY` / `DECREASE_DIFFICULTY`)
8. Normal practice (`STANDARD_PRACTICE`)

---

## 9. Cold Start / Baseline

No separate baseline engine.

```text
sessionMode = BASELINE | ADAPTIVE_PRACTICE
```

### Ownership

- Decision Engine uses a baseline sequencing policy when `sessionMode = BASELINE`.
- Question Generator selects from a fixed baseline blueprint.
- Diagnostic Engine seeds and updates initial mastery estimates.
- Learning Loop orchestrates.
- After enough evidence, session switches to `ADAPTIVE_PRACTICE`.

### Example baseline blueprint

```text
2 integer-operation questions
2 variable/expression questions
2 equality/balance questions
3 one-step equations
3 two-step equations
```

### Initial mastery prior

```text
value = 0.5
confidence = very low
source = default_prior
```

Baseline answers update both value and confidence.

---

## 10. Confidence Scale

Self-rated confidence on each attempt:

```text
1 = guessing
2 = not confident
3 = somewhat confident
4 = confident
5 = very confident
null = skipped / not provided
```

Validation must accept `1–5` or `null` only.

---

## 11. Mastery Equation (MVP)

Version: `mastery-formula-v1`

```text
signedEvidence =
  correctnessSign
  × difficultyWeight
  × independenceWeight

newMastery = clamp(
  oldMastery + alpha × signedEvidence,
  0,
  1
)
```

### Suggested constants (`mastery-formula-v1`)

```text
alpha = 0.08

correctnessSign:
  CORRECT = +1
  INCORRECT = -0.6
  PARTIALLY_CORRECT = +0.2
  INVALID_FORMAT / skipped = 0  (no mastery evidence)

difficultyWeight:
  1 → 0.7
  2 → 0.85
  3 → 1.0
  4 → 1.15
  5 → 1.3

independenceWeight:
  no hint = 1.0
  hint level 1 = 0.8
  hint level 2 = 0.6
  hint level 3 = 0.4
```

One answer must not radically change mastery. Constants are versioned; changing them requires a new `mastery-formula` version.

---

## 12. Grading (MVP)

Prefer deterministic normalized final-answer matching.

Accept equivalents such as:

```text
16
x = 16
16.0
```

Do **not** require general symbolic expression equivalence in MVP. That comes later with a proper CAS/symbolic library.

Outcomes:

```text
CORRECT
INCORRECT
PARTIALLY_CORRECT
INVALID_FORMAT
REQUIRES_REVIEW
```

---

## 13. Report Triggers

Report Generator does **not** run after every answer.

Allowed triggers:

```text
SESSION_ENDED
DAILY_REPORT_JOB
WEEKLY_REPORT_JOB
PARENT_REQUESTED_REPORT
```

During answers, the Loop only writes structured evidence.

At session end:

```text
aggregate session
→ generate student summary
→ optionally refresh parent summary
→ Recommendation Engine may propose revision drafts
```

---

## 14. Post-Explanation Flow

Explanation Engine never auto-fetches the next question.

```text
Explanation shown
→ EXPLANATION_VIEWED event (or session continues after dismiss)
→ Learning Loop calls Decision Engine again
→ Decision returns uiAction SHOW_QUESTION + learningIntent RETEST_AFTER_EXPLANATION
→ Question Generator selects a new equivalent question
```

---

## 15. MVP Module Boundaries

### Fully active

- Learning Loop
- Question Generator
- Diagnostic Engine
- Decision Engine

### Minimal but active

- Explanation Engine — approved text templates and hints
- Recommendation Engine — small revision queue proposals
- Report Generator — deterministic session summary
- Revision Service — queue write/dedupe/status

They are in MVP, but much simpler than mature versions.

### Learning Loop routing

```text
Decision
├── SHOW_QUESTION → Question Generator
├── SHOW_EXPLANATION / SHOW_HINT → Explanation Engine
├── EXECUTE_DUE_REVISION (as SHOW_QUESTION) → Revision Service + Question Generator
└── END_SESSION → Recommendation Engine + Report Generator
```

---

## 16. Success Metrics

### Functional acceptance (ship blockers)

- every valid answer stored exactly once
- duplicate `eventId` does not double-update
- profile updates reproducible under the same versions
- every decision has readable reasoning
- only reviewed/approved content reaches students
- staged failures recover as specified
- raw evidence never overwritten

### Pilot learning metrics (research / delayed)

- retention after 5–7 days (delayed equivalent questions)
- reduction in repeated misconceptions
- targeted sequencing vs non-adaptive sequencing (experiment design required)
- decreasing hint dependence

Retention can be **measured** with delayed questions without a sophisticated forgetting model.  
“Targeted beats random” is a **pilot research metric**, not an MVP software acceptance criterion.

---

## 17. Parent Purchase / Onboarding

```text
Parent creates account
→ parent purchases or starts trial
→ parent creates student profile
→ student receives code or login
→ student completes baseline
```

The student does not own billing.

---

## 18. External Terminology

| Internal (ok in code/docs) | External (parent/student UI) |
|---|---|
| CognitiveProfile (legacy name) | Learner Profile |
| diagnostic factors | Learning Insights |
| mastery model | Learning-State Model |

Do not present the system as a medical or psychological cognitive assessment.

Prefer renaming persisted model to `LearnerProfile` in new code; keep DB migrations explicit if renaming.

---

## 19. Events (MVP)

### Supported

- `SESSION_STARTED`
- `ANSWER_SUBMITTED`
- `HINT_REQUESTED`
- `QUESTION_SKIPPED`
- `EXPLANATION_VIEWED`
- `SESSION_ENDED`

### Deferred

- `EXPLANATION_DISMISSED`
- `REVISION_COMPLETED` (status may still update via Revision Service without a separate student event)
- `ANSWER_CHANGED` (use `answerChangedBeforeSubmit` on submit)
- `BREAK_REQUESTED`
- `PARENT_REPORT_VIEWED`

---

## 20. Document Authority

| Path | Role |
|---|---|
| `COGNA/COGNA MVP- 1.0/README_MVP_CONTRACTS.md` | **Canonical contracts** |
| `COGNA/COGNA MVP- 1.0/README_MVP_*.md` | Canonical MVP implementation specs |
| `COGNA/README_*.md` (parent folder) | Mature / future architecture only |

If a mature doc disagrees with this file, **this file wins for MVP implementation**.
