# Cogna MVP 1.0 — Recommendation Engine

> Depends on [Shared Contracts](./README_MVP_CONTRACTS.md). Proposes revision items; does not write the queue or pick the live next question.

## Purpose

Plan what the student should practice in the next session or over the next few days.

> Decision Engine: immediate next `LearningDecision`  
> Recommendation Engine: longer-horizon revision proposals  
> Revision Service: durable queue writes / dedupe / status (Contracts §6)

---

## MVP Scope

- Triggered primarily on `SESSION_ENDED` (also safe on explicit jobs)
- Propose 3–5 question-equivalents of work for the next session
- Rule-based priorities
- Weak concepts, active misconceptions, prerequisite gaps, time-since-practice
- Simple workload cap
- No weekly calendar product, no learned ranker

---

## Inputs

- Mastery by concept
- Active misconceptions + confidence
- Revision-need **signals** from Diagnostic (not queue rows)
- Days since practice
- Recent improvement
- Existing queue (to avoid duplicate proposals)
- Session summary

---

## Output Example

```json
{
  "proposals": [
    {
      "conceptId": "one-step-equations",
      "type": "MISCONCEPTION_PRACTICE",
      "targetMisconception": "sign_handling",
      "priority": 0.88,
      "dueAt": "2026-07-12T18:00:00Z",
      "questionCount": 3,
      "reasoning": "Sign-handling error appeared in three recent attempts.",
      "confidence": 0.76
    }
  ],
  "recommendationVersion": "recommendation-rules-v1"
}
```

Learning Loop passes `proposals` to **Revision Service**, which upserts/dedupes `RevisionQueueItem` rows.

---

## MVP Rules

```text
active misconception confidence > 0.6
→ propose 3 targeted questions

mastery < 0.4
→ propose concept reinforcement

prerequisite gap active
→ propose prerequisite review before progression

concept not practiced for 5+ days
→ propose revision

high mastery with stable success
→ no immediate revision proposal
```

---

## Priority Formula (placeholder, versioned)

```text
priority =
0.35 × weakness
+ 0.30 × misconception severity
+ 0.20 × time since practice
+ 0.15 × prerequisite importance
```

---

## Workload Guardrail

- Max 10 questions / day recommended
- Max ~15 minutes
- ≤ 3 active concepts
- No duplicate open queue items (enforced in Revision Service)

---

## Interface

```ts
interface RecommendationInput {
  studentId: string;
  mastery: MasterySummary[];
  diagnosticFactors: DiagnosticFactorSummary[];
  revisionNeedSignals: RevisionNeedSignal[];
  existingQueue: RevisionQueueItem[];
  sessionSummary: SessionSummary;
}

interface RecommendationResult {
  proposals: RevisionQueueItemDraft[];
  recommendationVersion: string;
}
```

---

## Outcome Tracking

Revision Service / Loop store completion, accuracy, hints, mastery before/after, misconception status before/after.

---

## Acceptance Criteria

- Every proposal has evidence, confidence, reasoning
- Engine does not write DB queue rows directly
- Does not emit live `LearningDecision`
- Workload cap respected in proposals
- Rules versioned

---

## Simplest Definition

> **The MVP Recommendation Engine builds small, explainable revision proposals for the Revision Service to enqueue.**
