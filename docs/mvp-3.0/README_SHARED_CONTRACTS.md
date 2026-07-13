# MVP 3.0 — Shared Contracts

> **Delta from MVP 2.0:** Additive contracts for content drafts, experiment assignment payloads, candidate action scores, and analysis exports. UI actions unchanged.

## Compatibility

- Additive over MVP 2.0. All `*-v2` decisions must still replay.
- New version strings for experiment/scoring/content-draft rules only.
- Do not invent flat UI actions. Do not remove MVP 2.0 intents.

### Version strings (proposed)

```ts
export const DECISION_RULES_V3 = "decision-rules-v3"; // baseline + experiment hooks
export const CANDIDATE_SCORE_RULES_V1 = "candidate-score-rules-v1";
export const EXPERIMENT_RULES_V1 = "experiment-rules-v1";
export const CONTENT_DRAFT_RULES_V1 = "content-draft-rules-v1";
export const CONTENT_VALIDATION_RULES_V1 = "content-validation-rules-v1";
// Carry forward:
export const MASTERY_FORMULA_V2 = "mastery-formula-v2";
export const DIAGNOSTIC_RULES_V2 = "diagnostic-rules-v2";
export const RETENTION_RULES_V2 = "retention-rules-v2";
export const RECOMMENDATION_RULES_V2 = "recommendation-rules-v2";
```

---

## 1. LearningDecision (unchanged uiAction surface)

```ts
type UiAction =
  | "SHOW_QUESTION"
  | "SHOW_EXPLANATION"
  | "SHOW_HINT"
  | "END_SESSION"
  | "SUGGEST_BREAK";

/** All MVP 2.0 intents remain. No new intents required for MVP 3.0 core. */
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
  | "RETENTION_REVIEW"
  | "TRANSFER_CHECK"
  | "BREAK_FOR_FATIGUE";

interface DecisionParameters {
  conceptId: string;
  difficulty?: number;
  targetMisconception?: string;
  revisionItemId?: string;
  explanationId?: string;
  hintLevel?: number;
  retentionEstimateId?: string;
  transferConceptId?: string;
  sessionPlanId?: string;
  maxQuestionCount?: number;
  breakMinutes?: number;
  explanationOutcomeId?: string;
  /** NEW MVP 3.0 */
  experimentId?: string;
  experimentArmId?: string;
  candidateScoreId?: string;
  draftOriginId?: string; // analytics only; never student-facing
}

interface LearningDecision {
  uiAction: UiAction;
  learningIntent: LearningIntent;
  contentStyle?: ContentStyle;
  parameters: DecisionParameters;
  confidence: number;
  reasoning: string;
  decisionVersion: string;
  fallbackGenerated?: boolean;
}
```

---

## 2. CandidateActionScore

Legal candidates are produced by Decision Engine rules first. Scorer **ranks**; it does not invent actions.

```ts
interface CandidateAction {
  uiAction: UiAction;
  learningIntent: LearningIntent;
  contentStyle?: ContentStyle;
  parameters: DecisionParameters;
  legalityReason: string; // which rule made this candidate legal
}

interface CandidateActionScore {
  id: string;
  studentId: string;
  sessionId: string;
  eventId: string; // decision trigger event
  candidates: Array<{
    candidate: CandidateAction;
    score: number; // higher = preferred
    scoreVersion: string; // candidate-score-rules-v1
    features: Record<string, number | string | boolean>;
  }>;
  selectedIndex: number;
  experimentId?: string;
  experimentArmId?: string;
  createdAt: string; // ISO
}
```

### Scoring contract rules

1. Empty legal set → fall back to control policy (`STANDARD_PRACTICE` / session end rules).
2. Scorer must not emit `uiAction` outside the allowed five.
3. Scorer must not pick a candidate that violates hard session gates (`END_SESSION` still wins).
4. Feature vectors are versioned; changing features bumps `candidate-score-rules-v*`.

---

## 3. ExperimentAssignment

```ts
type ExperimentArm = "control" | "scored_v1" | string;

interface ExperimentDefinition {
  experimentKey: string; // e.g. "policy_score_linear_eq_2026q3"
  status: "DRAFT" | "RUNNING" | "PAUSED" | "COMPLETED";
  arms: ExperimentArm[];
  allocation: Record<ExperimentArm, number>; // must sum to 1.0
  eligibility: {
    unitId?: string;
    minSessionsCompleted?: number;
    excludeBaselineOnly?: boolean;
  };
  startAt: string;
  endAt?: string;
  rulesVersion: string; // experiment-rules-v1
}

interface ExperimentAssignment {
  id: string;
  studentId: string;
  experimentKey: string;
  arm: ExperimentArm;
  assignedAt: string;
  sticky: true; // MVP 3.0 requires sticky assignment
  metadata?: Record<string, string>;
}
```

Assignment is **sticky** for the experiment lifetime unless explicitly re-randomized under a new experiment key.

---

## 4. ContentDraft

```ts
type DraftStatus =
  | "DRAFT"
  | "VALIDATING"
  | "VALIDATED"
  | "VALIDATION_FAILED"
  | "PENDING_REVIEW"
  | "REJECTED"
  | "APPROVED_PROMOTED";

interface ContentDraft {
  id: string;
  draftType: "QUESTION" | "EXPLANATION_TEMPLATE" | "HINT_LADDER";
  conceptId: string;
  difficulty?: number;
  targetMisconception?: string;
  payload: Record<string, unknown>; // mirrors question/explanation schema
  source: "HUMAN" | "LLM_ASSISTED" | "PROGRAMMATIC";
  provider?: string;
  promptVersion?: string;
  status: DraftStatus;
  validationErrors?: string[];
  reviewNotes?: string;
  promotedContentId?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Invariant:** `status === APPROVED_PROMOTED` is the only path from draft to student bank. Students never read `ContentDraft` rows.

---

## 5. Events (additive)

| Event type | When |
|---|---|
| `EXPERIMENT_ASSIGNED` | First sticky assignment |
| `CANDIDATE_SCORED` | Scorer ran (experiment or shadow mode) |
| `CONTENT_DRAFT_CREATED` | Draft stored |
| `CONTENT_DRAFT_VALIDATED` | Validation passed |
| `CONTENT_DRAFT_VALIDATION_FAILED` | Validation failed |
| `CONTENT_DRAFT_PROMOTED` | Promoted to APPROVED bank |

---

## 6. API shapes (sketch)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/content/drafts` | Create draft (human or enqueue LLM) |
| `POST` | `/content/drafts/:id/validate` | Run validation |
| `POST` | `/content/drafts/:id/review` | Approve/reject |
| `GET` | `/experiments` | List definitions |
| `POST` | `/experiments/:key/assign/:studentId` | Force/resolve assignment (admin) |
| `GET` | `/experiments/:key/assignments` | Export assignments |
| `POST` | `/jobs/experiment-analysis/export` | Offline outcomes export |
| `POST` | `/decision/shadow-score` | Shadow scoring without applying (ops) |

Parent/student learning APIs remain MVP 2.0 shapes with optional experiment fields in decision snapshots only.
