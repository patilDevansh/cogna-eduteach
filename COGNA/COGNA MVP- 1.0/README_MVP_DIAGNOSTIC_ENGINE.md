# Cogna MVP 1.0 — Diagnostic Engine

> Depends on [Shared Contracts](./README_MVP_CONTRACTS.md). Does not choose next actions or write the revision queue.

## Purpose

Turn a graded attempt and recent behavior into cautious, evidence-backed estimates of learning state.

> **What does the available evidence currently suggest about this learner?**

---

## MVP Factors

1. Concept mastery (`mastery-formula-v1`, Contracts §11)
2. Prerequisite gap signals
3. Repeated misconception patterns + remediation-relevant evidence
4. Confidence calibration
5. Hint dependence
6. Recent learning progress
7. Revision **need signal** only (never queue writes — Contracts §6)

---

## Inputs

- Grade, submitted answer, difficulty, concept, misconceptions tested
- Timings, attempt number, hint count/level, self-rated confidence (1–5 | null)
- Answer changed before submit
- Recent attempt history
- Days since prior practice
- Prior mastery and diagnostic factors
- Current misconception remediation state (read; Decision owns transitions, Diagnostic supplies evidence)

---

## Output Example

```json
{
  "masteryUpdates": [
    {
      "conceptId": "one-step-equations",
      "previousValue": 0.56,
      "newValue": 0.51,
      "confidence": 0.64,
      "formulaVersion": "mastery-formula-v1"
    }
  ],
  "diagnosticFactors": [
    {
      "factorType": "MISCONCEPTION",
      "factorKey": "sign_handling",
      "confidence": 0.68,
      "reasoning": "Three matching errors in five recent attempts.",
      "evidenceAttemptIds": ["att_14", "att_18", "att_21"],
      "alternativeExplanations": ["arithmetic_slip", "question_misread"]
    }
  ],
  "profilePatch": {
    "confidenceCalibration": "possibly_overconfident",
    "hintDependence": 0.42,
    "revisionNeedSignals": [
      {
        "conceptId": "one-step-equations",
        "reason": "mastery_below_threshold",
        "confidence": 0.7
      }
    ]
  },
  "diagnosticVersion": "diagnostic-rules-v1"
}
```

---

## Mastery Update

Use Contracts §11 exactly. Do not invent a parallel formula in this file.

One answer must not radically change mastery.

---

## Misconception Detection

Taxonomy (Linear Equations Learning Unit):

- `sign_handling`
- `incomplete_isolation`
- `distribution_error`
- `equality_imbalance`
- `arithmetic_slip`
- `translation_error`

Flag only when:

- question is tagged to test it,
- answer pattern matches,
- repeated supporting evidence exists.

```text
1 matching event → observation only
2 matching events → possible, low confidence
3+ matching events → active flag if confidence > 0.6
```

Remediation **state machine** (UNCONFIRMED → …) is driven by Decision using this evidence (Contracts §8). Diagnostic does not emit `LearningDecision`.

---

## Confidence Calibration

Compare self-rated confidence with performance over multiple attempts (Contracts §10).

```text
High confidence + repeated incorrect → possibly overconfident
Low confidence + repeated correct → possibly underconfident
Aligned → reasonably calibrated
```

Never label from a single answer.

---

## Hint Dependence

```text
hintDependence = weighted hints used / eligible questions attempted
```

Track direction: increasing | stable | decreasing.

---

## Revision Need Signal

May set a signal when mastery is low, performance declined, or time since success is long.

**Does not write `RevisionQueueItem`.** Recommendation Engine + Revision Service own the queue (Contracts §6).

---

## Required Evidence Fields

Every factor: value, confidence, reasoning, source attempt IDs, alternative explanations, model version, timestamp.

---

## Interface

```ts
interface DiagnosticInput {
  studentId: string;
  attemptId: string;
  question: QuestionDiagnosticMetadata;
  recentAttempts: AttemptSummary[];
  priorProfile: LearnerProfile;
}

interface DiagnosticOutput {
  masteryUpdates: MasteryUpdate[];
  diagnosticFactors: DiagnosticFactorUpdate[];
  profilePatch: Partial<LearnerProfile>;
  diagnosticVersion: string;
}
```

---

## Guardrails

Must not infer IQ, ADHD, autism, depression, anxiety disorder, personality type, permanent learning style, or any clinical condition.

Weak evidence → lower confidence, keep alternatives, abstain if needed.

On engine failure: preserve raw attempt (already in Tx1); return safe no-change; mark retryable (Contracts §2).

---

## Acceptance Criteria

- Every inference links to evidence and confidence
- One attempt cannot radically change mastery
- Raw observations unchanged
- Outputs versioned and reproducible
- Can abstain
- Never writes revision queue
- No prohibited labels

---

## Later Path

Bayesian Knowledge Tracing, IRT, retention models, learned misconception classifiers, explanation effectiveness, transfer analysis — **not MVP**.

---

## Simplest Definition

> **The MVP Diagnostic Engine converts answer behavior into cautious, versioned learning-state estimates — never into queue writes or UI actions.**
