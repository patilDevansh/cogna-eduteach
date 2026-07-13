# MVP 1.0 — Shared Contracts

> Single source for action schema, enums, events, API shapes, and validation.  
> **Canonical UI action names only:** `SHOW_QUESTION` | `SHOW_EXPLANATION` | `SHOW_HINT` | `END_SESSION` | `SUGGEST_BREAK`.  
> Do not invent aliases (`EASIER_QUESTION`, `TARGET_MISCONCEPTION` as a top-level action, etc.).

---

## 1. LearningDecision

```ts
/** ONLY allowed uiAction values */
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

type QuestionFormat = "NUMERIC" | "MCQ" | "WORD_PROBLEM";
type ExplanationStyle = "HINT" | "STEP_BY_STEP" | "ANALOGY";

interface ContentStyle {
  questionFormat?: QuestionFormat;
  explanationStyle?: ExplanationStyle;
}

interface DecisionParameters {
  conceptId: string;
  difficulty?: number; // 1–5 within concept
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
  decisionVersion: string; // e.g. decision-rules-v1
  fallbackGenerated?: boolean;
}
```

### Example

```json
{
  "uiAction": "SHOW_QUESTION",
  "learningIntent": "TARGET_MISCONCEPTION",
  "contentStyle": { "questionFormat": "NUMERIC" },
  "parameters": {
    "conceptId": "C2_ONE_STEP_SUBTRACTION",
    "difficulty": 2,
    "targetMisconception": "SIGN_HANDLING"
  },
  "confidence": 0.84,
  "reasoning": "Remediation TARGETING; support question after failed discrimination.",
  "decisionVersion": "decision-rules-v1"
}
```

---

## 2. Self-rated confidence

```text
1 = guessing
2 = not confident
3 = somewhat confident
4 = confident
5 = very confident
null = not answered
```

Validation: integer 1–5 or null only.

---

## 3. Session mode

```ts
type SessionMode = "BASELINE" | "ADAPTIVE_PRACTICE";
```

---

## 4. Grade outcomes

```ts
type Grade =
  | "CORRECT"
  | "INCORRECT"
  | "PARTIALLY_CORRECT"
  | "INVALID_FORMAT"
  | "REQUIRES_REVIEW";
```

MVP grading: normalized final-answer match only (`16`, `x=16`, `x = 16`, `16.0`). No general symbolic CAS.

---

## 5. Processing status

```ts
type ProcessingStatus =
  | "RECEIVED"
  | "VALIDATED"
  | "GRADED"
  | "PROFILE_UPDATED"
  | "DECIDED"
  | "CONTENT_RESOLVED"
  | "COMPLETED"
  | "FAILED_RETRYABLE"
  | "FAILED_PERMANENT";
```

See [Processing & Durability](./README_PROCESSING_DURABILITY.md).

---

## 6. Events

| Event | Producer | Consumer | Profile update? |
|---|---|---|---|
| `SESSION_STARTED` | UI / Loop | Loop, analytics | No (session row only) |
| `QUESTION_SHOWN` | Loop | analytics | No |
| `ANSWER_SUBMITTED` | UI | Loop → Diagnostic → Decision | Yes (after grade) |
| `HINT_REQUESTED` | UI | Loop → Explanation | Hint signals; mastery usually unchanged until next answer |
| `HINT_SHOWN` | Loop | analytics | No |
| `EXPLANATION_SHOWN` | Loop | analytics | No |
| `EXPLANATION_VIEWED` | UI | Loop → Decision (re-test) | May advance remediation state |
| `QUESTION_SKIPPED` | UI | Loop → Diagnostic (weak/no mastery evidence) | Minimal |
| `SESSION_ENDED` | UI / Loop | Recommendation, Report, analytics | No direct mastery; may enqueue revision |

### ANSWER_SUBMITTED — required / optional

```ts
interface AnswerSubmittedEvent {
  eventId: string; // required, client ULID/UUID, unique
  eventType: "ANSWER_SUBMITTED";
  studentId: string;
  sessionId: string;
  questionId: string;
  questionVersion: number;
  submittedAnswer: string;
  timeToFirstResponseMs: number;
  totalTimeMs: number;
  idleTimeMs: number;
  attemptNumber: number;
  hintCount: number;
  highestHintLevel: number;
  selfRatedConfidence: 1 | 2 | 3 | 4 | 5 | null;
  answerChangedBeforeSubmit: boolean;
  clientTimestamp: string; // ISO-8601
}
```

### HINT_REQUESTED

```ts
interface HintRequestedEvent {
  eventId: string;
  eventType: "HINT_REQUESTED";
  studentId: string;
  sessionId: string;
  questionId: string;
  requestedLevel?: number; // optional; server assigns next
  clientTimestamp: string;
}
```

Idempotency: same `eventId` → return stored result; never double-apply profile/decision.

---

## 7. REST API (MVP)

### Auth

Parent and student JWTs; parent owns billing linkage.

### Session

```text
POST   /sessions
  body: { studentId, sessionMode?: "BASELINE" | "ADAPTIVE_PRACTICE" }
  → { sessionId, sessionMode, nextAction }

POST   /sessions/:id/end
  → { sessionId, summaryReportId?, revisionProposed: boolean }

GET    /sessions/:id
```

### Practice

```text
GET    /practice/next?sessionId=
  → { decision: LearningDecision, payload: QuestionPayload | ExplanationPayload | HintPayload | SessionEndPayload }

POST   /practice/answer
  body: AnswerSubmittedEvent
  → { processingStatus, grade, decision, payload }

POST   /practice/hint
  body: HintRequestedEvent
  → { hint, highestHintLevel }

POST   /practice/skip
  body: { eventId, sessionId, questionId, clientTimestamp }
  → { decision, payload }
```

### Profile / revision / reports

```text
GET    /students/:id/profile
GET    /students/:id/mastery
GET    /students/:id/revision-queue

GET    /students/:id/reports/latest
POST   /students/:id/reports/generate   // PARENT_REQUESTED_REPORT only from parent role

GET    /parents/me/students
GET    /parents/me/students/:studentId/summary
```

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Bad payload |
| `UNAUTHORIZED` | 401 | Auth |
| `FORBIDDEN` | 403 | Role/ownership |
| `NOT_FOUND` | 404 | Missing entity |
| `CONFLICT_DUPLICATE_EVENT` | 409 | eventId already processed (body may include prior result) |
| `NO_ELIGIBLE_QUESTION` | 422 | Bank exhausted for request; session may end |
| `FAILED_RETRYABLE` | 503 | Transient; client may resubmit same eventId |
| `FAILED_PERMANENT` | 500 | Needs ops; do not invent diagnosis |

---

## 8. Version strings (frozen for v1)

```text
diagnostic-rules-v1
mastery-formula-v1
decision-rules-v1
question-selector-v1
recommendation-rules-v1
report-templates-v1
```

Changing constants requires a new version id.

---

## 9. Terminology

| Internal | External |
|---|---|
| LearnerProfile | Learner Profile |
| diagnostic factors | Learning Insights |
| mastery | Learning-state estimate |

Never present as medical/psychological cognitive assessment.
