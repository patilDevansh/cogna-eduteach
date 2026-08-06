# MVP 2.0 — Shared Contracts

> Single source for action schema, enums, events, API shapes, and validation.  
> **Canonical UI action names only:** `SHOW_QUESTION` | `SHOW_EXPLANATION` | `SHOW_HINT` | `END_SESSION` | `SUGGEST_BREAK`.  
> Do not invent aliases (`EASIER_QUESTION`, `TARGET_MISCONCEPTION` as a top-level action, etc.).

## Compatibility (additive over MVP 1.0)

- MVP 2.0 contracts are **additive**. Existing MVP 1.0 `LearningDecision` shapes remain valid.
- **v1 decisions must still replay** under stored `decisionVersion` (`decision-rules-v1` / `mastery-formula-v1`, etc.).
- New `learningIntent` values require a **`packages/shared` enum migration** before implementation serves them.
- Do not remove or rename MVP 1.0 intents; only append.

### NEW intents (require shared enum migration)

| Intent | Status | Typical `uiAction` |
|---|---|---|
| `RETENTION_REVIEW` | **NEW in MVP 2.0** | `SHOW_QUESTION` |
| `TRANSFER_CHECK` | **NEW in MVP 2.0** | `SHOW_QUESTION` |
| `BREAK_FOR_FATIGUE` | **NEW in MVP 2.0** | `SUGGEST_BREAK` |

Until migration lands, code must not emit these intents in production paths.

---

## Version Strings

```ts
export const MASTERY_FORMULA_V2 = "mastery-formula-v2";
export const DIAGNOSTIC_RULES_V2 = "diagnostic-rules-v2";
export const DECISION_RULES_V2 = "decision-rules-v2";
export const RETENTION_RULES_V2 = "retention-rules-v2";
export const RECOMMENDATION_RULES_V2 = "recommendation-rules-v2";
export const REPORT_TEMPLATES_V2 = "report-templates-v2";
export const CONTENT_REVIEW_RULES_V2 = "content-review-rules-v2";
```

Changing constants requires a new version id. MVP 1.0 version strings remain valid for historical rows.

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
  | "BASELINE_ASSESSMENT"
  // NEW MVP 2.0 — packages/shared migration required
  | "RETENTION_REVIEW"
  | "TRANSFER_CHECK"
  | "BREAK_FOR_FATIGUE";

type QuestionFormat = "NUMERIC" | "MCQ" | "WORD_PROBLEM";
type ExplanationStyle = "HINT" | "STEP_BY_STEP" | "ANALOGY";

/**
 * ContentStyle — how the Loop/QG should present the next payload.
 * Unchanged semantics from MVP 1.0.
 */
interface ContentStyle {
  /** Preferred question surface when uiAction is SHOW_QUESTION */
  questionFormat?: QuestionFormat;
  /** Preferred explanation/hint style when uiAction is SHOW_EXPLANATION or SHOW_HINT */
  explanationStyle?: ExplanationStyle;
}

/**
 * QuestionFormat
 * - NUMERIC: free-response number / simple equation answer
 * - MCQ: multiple choice
 * - WORD_PROBLEM: story stem mapping to an equation or numeric answer
 *
 * ExplanationStyle
 * - HINT: ladder step only (partial help)
 * - STEP_BY_STEP: full worked explanation template
 * - ANALOGY: optional analogy template when approved; not required for every misconception
 */

interface DecisionParameters {
  conceptId: string;
  difficulty?: number; // 1–5 within concept
  targetMisconception?: string;
  revisionItemId?: string;
  explanationId?: string;
  hintLevel?: number;
  // NEW MVP 2.0 optional fields
  retentionEstimateId?: string;
  transferConceptId?: string;
  sessionPlanId?: string;
  maxQuestionCount?: number;
  breakMinutes?: number;
  explanationOutcomeId?: string;
}

interface LearningDecision {
  uiAction: UiAction;
  learningIntent: LearningIntent;
  contentStyle?: ContentStyle;
  parameters: DecisionParameters;
  confidence: number; // 0–1
  reasoning: string;
  decisionVersion: string; // e.g. decision-rules-v2
  fallbackGenerated?: boolean;
}
```

### JSON examples — new intents

#### RETENTION_REVIEW

```json
{
  "uiAction": "SHOW_QUESTION",
  "learningIntent": "RETENTION_REVIEW",
  "contentStyle": { "questionFormat": "NUMERIC" },
  "parameters": {
    "conceptId": "C2_ONE_STEP_SUBTRACTION",
    "difficulty": 2,
    "revisionItemId": "rev_01HZX…",
    "retentionEstimateId": "ret_01HZX…"
  },
  "confidence": 0.78,
  "reasoning": "retentionEstimate=0.42 (<0.55); due PENDING retention item.",
  "decisionVersion": "decision-rules-v2"
}
```

#### TRANSFER_CHECK

```json
{
  "uiAction": "SHOW_QUESTION",
  "learningIntent": "TRANSFER_CHECK",
  "contentStyle": { "questionFormat": "WORD_PROBLEM" },
  "parameters": {
    "conceptId": "C5_TWO_STEP_EQUATIONS",
    "difficulty": 3,
    "transferConceptId": "C5_TWO_STEP_EQUATIONS"
  },
  "confidence": 0.71,
  "reasoning": "Mastery stable above threshold; no active misconception >0.6; transfer item available.",
  "decisionVersion": "decision-rules-v2"
}
```

#### BREAK_FOR_FATIGUE

```json
{
  "uiAction": "SUGGEST_BREAK",
  "learningIntent": "BREAK_FOR_FATIGUE",
  "parameters": {
    "conceptId": "C2_ONE_STEP_SUBTRACTION",
    "breakMinutes": 3
  },
  "confidence": 0.80,
  "reasoning": "fatigueRisk: sessionMinutes>=12 and idleSpikeCount>=2; hard stop not yet reached.",
  "decisionVersion": "decision-rules-v2"
}
```

#### Carried example — TARGET_MISCONCEPTION (still valid)

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
  "decisionVersion": "decision-rules-v2"
}
```

#### SHOW_EXPLANATION + ContentStyle

```json
{
  "uiAction": "SHOW_EXPLANATION",
  "learningIntent": "TARGET_MISCONCEPTION",
  "contentStyle": { "explanationStyle": "STEP_BY_STEP" },
  "parameters": {
    "conceptId": "C2_ONE_STEP_SUBTRACTION",
    "targetMisconception": "SIGN_HANDLING",
    "explanationId": "EXP_C2_SIGN_STEP_001"
  },
  "confidence": 0.88,
  "reasoning": "Remediation EXPLANATION_REQUIRED after maxTargetedAttemptsBeforeExplanation.",
  "decisionVersion": "decision-rules-v2"
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

MVP grading: normalized final-answer match only. No general symbolic CAS.

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

## 6. Diagnostic Factor Catalog

```ts
type DiagnosticFactorType =
  | "MASTERY"
  | "MISCONCEPTION"
  | "CONFIDENCE_CALIBRATION"
  | "HINT_DEPENDENCE"
  | "RETENTION"
  | "LEARNING_VELOCITY"
  | "ERROR_RECOVERY"
  | "EXPLANATION_EFFECTIVENESS"
  | "ENGAGEMENT_PATTERN"
  | "ITEM_STATISTIC";

interface DiagnosticFactorV2 {
  factorType: DiagnosticFactorType;
  conceptId?: string;
  factorKey?: string;
  value: unknown;
  confidence: number;
  reasoning: string;
  evidenceAttemptIds?: string[];
  evidenceEventIds?: string[];
  alternativeExplanations?: string[];
  validUntil?: string;
  modelVersion: string;
}
```

---

## 7. Events

| Event | Producer | Consumer | Profile update? |
|---|---|---|---|
| `SESSION_STARTED` | UI / Loop | Loop, analytics | No (session row only) |
| `QUESTION_SHOWN` | Loop | analytics | No |
| `ANSWER_SUBMITTED` | UI | Loop → Diagnostic → Decision | Yes (after grade) |
| `HINT_REQUESTED` | UI | Loop → Explanation | Hint signals |
| `HINT_SHOWN` | Loop | analytics | No |
| `EXPLANATION_SHOWN` | Loop | analytics | No |
| `EXPLANATION_VIEWED` | UI | Loop → Decision (re-test) | May advance remediation; starts explanation outcome window |
| `QUESTION_SKIPPED` | UI | Loop → Diagnostic | Minimal; may affect engagement |
| `SESSION_ENDED` | UI / Loop | Recommendation, Report, analytics | May enqueue revision |
| `REVISION_ITEM_COMPLETED` | Learning Loop | Recommendation, Report | Records revision outcome |
| `WEEKLY_REPORT_REQUESTED` | Job / parent | Report Generator | Async-safe |
| `REPORT_DELIVERY_ATTEMPTED` | Report Delivery | Observability | Email outcome |
| `CONTENT_REVIEWED` | Reviewer | Content Review Service | Approval gate |

### ANSWER_SUBMITTED — required / optional (unchanged from MVP 1.0)

```ts
interface AnswerSubmittedEvent {
  eventId: string;
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

### HINT_REQUESTED (unchanged from MVP 1.0)

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

## 8. REST API

### Carried from MVP 1.0

```text
POST   /sessions
  body: { studentId, sessionMode?: "BASELINE" | "ADAPTIVE_PRACTICE" }
  → { sessionId, sessionMode, nextAction }

POST   /sessions/:id/end
  → { sessionId, summaryReportId?, revisionProposed: boolean }

GET    /sessions/:id

GET    /practice/next?sessionId=
  → { decision: LearningDecision, payload: QuestionPayload | ExplanationPayload | HintPayload | SessionEndPayload | BreakPayload }

POST   /practice/answer
  body: AnswerSubmittedEvent
  → { processingStatus, grade, decision, payload }

POST   /practice/hint
  body: HintRequestedEvent
  → { hint, highestHintLevel }

POST   /practice/skip
  body: { eventId, sessionId, questionId, clientTimestamp }
  → { decision, payload }

GET    /students/:id/profile
GET    /students/:id/mastery
GET    /students/:id/revision-queue
GET    /students/:id/reports/latest
POST   /students/:id/reports/generate
GET    /parents/me/students
GET    /parents/me/students/:studentId/summary
```

### NEW MVP 2.0 routes — request/response shapes

#### Learning insights (student-safe)

```text
GET /students/:id/learning-insights
→ {
    studentId,
    masterySummary: { conceptId, value, confidence }[],
    activePatterns: { misconceptionId, conceptId, state, confidence }[],
    calibration: "unknown" | "reasonably_calibrated" | "possibly_overconfident" | "possibly_underconfident",
    hintDependence?: number,
    generatedAt: string
  }
```

No clinical wording. Weak evidence → omit or mark `"still gathering evidence"`.

#### Retention estimates (internal / pilot)

```text
GET /students/:id/retention
→ {
    studentId,
    estimates: {
      conceptId,
      estimate: number,
      confidence: number,
      daysSinceSuccess: number,
      modelVersion: "retention-rules-v2",
      validUntil: string
    }[],
    abstainedConceptIds?: string[]
  }
```

#### Revision plan

```text
GET /students/:id/revision-plan
→ {
    studentId,
    daily: { date, items: { revisionItemId, type, conceptId, priority, dueAt, questionCount }[], cappedAt: 10 },
    weekly: { weekStart, retentionConceptIds, misconceptionPaths, transferEligible: boolean }
  }
```

#### Weekly report

```text
POST /students/:id/reports/weekly
  body: { periodStart: string, periodEnd: string, requestId?: string }
  → { reportId, status: "COMPLETED" | "PENDING", idempotencyKey }

POST /students/:id/reports/email
  body: { reportId, parentId?, channel?: "EMAIL" }
  → { deliveryId, status: "PENDING" | "SENT" | "FAILED" | "RETRYING" }

GET /parents/me/students/:id/weekly-summary
  → { studentId, reportId?, structuredSummary, renderedText?, periodStart, periodEnd }
```

#### Content review

```text
POST /content/review/:questionId
  body: {
    contentVersion: number,
    status: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED",
    checklist: { mathCorrect: boolean, wordingClear: boolean, tagsAccurate: boolean },
    notes?: string,
    reviewer: string
  }
  → { reviewId, contentId, contentVersion, status, reviewedAt }
```

#### Observability

```text
GET /observability/pilot-dashboard
  → { sessionsToday, answerLatencyP50Ms, answerLatencyP95Ms, failureRetryableCount, approvedContentGaps, generatedAt }
```

### Break payload (when `SUGGEST_BREAK`)

```ts
interface BreakPayload {
  breakMinutes: number;
  message: string; // supportive, non-clinical
  continueAllowed: true;
}
```

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Bad payload |
| `UNAUTHORIZED` | 401 | Auth |
| `FORBIDDEN` | 403 | Role/ownership |
| `NOT_FOUND` | 404 | Missing entity |
| `CONFLICT_DUPLICATE_EVENT` | 409 | eventId already processed |
| `NO_ELIGIBLE_QUESTION` | 422 | Bank exhausted; session may end |
| `WEAK_EVIDENCE_ABSTAINED` | 422 | Engine refused to over-personalize |
| `NO_APPROVED_CONTENT` | 422 | QG cannot serve reviewed item |
| `CONTENT_REVIEW_REQUIRED` | 422 | Content cannot reach student |
| `REPORT_DELIVERY_PENDING` | 202 | Email queued or retrying |
| `RETENTION_ESTIMATE_INSUFFICIENT` | 422 | Not enough evidence for retention factor |
| `FAILED_RETRYABLE` | 503 | Transient; client may resubmit same eventId |
| `FAILED_PERMANENT` | 500 | Needs ops |

---

## 9. Terminology

| Internal | External |
|---|---|
| LearnerProfile | Learner Profile |
| diagnostic factors | Learning Insights / Learning signals |
| mastery | Learning-state estimate |
| Misconception | Pattern we are checking |
| Fatigue | Time for a break |
| Weak mastery | Needs more practice |
| Confidence calibration | How sure answers feel vs results |

Never present as medical/psychological cognitive assessment.
