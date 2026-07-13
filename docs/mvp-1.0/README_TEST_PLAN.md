# MVP 1.0 — Test Plan (Golden Cases)

> ~35 contract cases. Engines must match expected outputs under versioned rules.  
> These stop implementers from guessing behavior.

Versions under test: `mastery-formula-v1`, `diagnostic-rules-v1`, `decision-rules-v1`.

---

## How to use

Each case lists: setup, events, expected diagnosis (approx), expected `LearningDecision`, durability notes.

Numeric confidence may be ±0.05 unless marked exact.

---

## A. Happy path / diagnosis

### G01 — Two sign-handling errors, high confidence

```text
Setup: empty-ish profile on C2; mastery 0.50 conf 0.10
Events:
  Q_C2_D2_001 answered "4" (expect 18) confidence 5, no hints
  Q_C2_D2_002 answered "4" (expect 16) confidence 5, no hints
  Both tagged SIGN_HANDLING pattern match

Expected diagnosis:
  SIGN_HANDLING possible/active, confidence ≈ 0.65 (0.35+0.15×2)
  possibly_overconfident if window allows
  mastery decreases gradually (not cliff)

Expected decision:
  uiAction: SHOW_QUESTION
  learningIntent: TARGET_MISCONCEPTION
  parameters.conceptId: C2_ONE_STEP_SUBTRACTION
  parameters.difficulty: same or -1
  remediation state → TARGETING
```

### G02 — Low-confidence single mismatch

```text
One matching incorrect only
Expected: UNCONFIRMED observation; NO TARGET_MISCONCEPTION
learningIntent: STANDARD_PRACTICE
```

### G03 — Arithmetic slip vs sign handling discrimination

```text
Student misses Q_C2_D3_001 with arithmetic-only wrong answer pattern
Expected: prefer ARITHMETIC_SLIP alternative; do not hard-activate SIGN_HANDLING alone
```

### G04 — Mastery increase on independent correct

```text
CORRECT, no hints, difficulty 3, quality 1.0
signedEvidence = 1.0 × 1.0 × 1.0 × 1.0 = 1.0
Δ mastery = 0.12
```

### G05 — Correct with hint level 3

```text
independenceWeight 0.4 → smaller positive Δ
```

### G06 — Invalid format

```text
grade INVALID_FORMAT; signedEvidence 0; mastery unchanged; evidenceCount unchanged
```

---

## B. Remediation state machine

### G10 — Targeting then explanation

```text
State TARGETING; 2 targeted incorrect → EXPLANATION_REQUIRED
Next decision: uiAction SHOW_EXPLANATION
```

### G11 — Explanation then successful re-test

```text
EXPLANATION_VIEWED → RETESTING
RETEST correct, hintLevel <= 1 → RESOLVED
```

### G12 — Explanation then failed re-test

```text
RETESTING incorrect → EXPLANATION_REQUIRED if cycles < 2 else STILL_ACTIVE
```

### G13 — No infinite targeting

```text
After STILL_ACTIVE, next decisions must NOT keep TARGET_MISCONCEPTION forever;
prefer REVIEW_PREREQUISITE or DECREASE_DIFFICULTY
```

---

## C. Durability / failures

### G20 — Duplicate answer submission

```text
Same eventId twice
Expected: one attempt; second returns stored result; mastery not applied twice
```

### G21 — Diagnostic failure after grade

```text
Tx1 committed; Tx2 throws
Expected: attempt durable; processingStatus FAILED_RETRYABLE; no partial profile write
```

### G22 — Decision failure after profile

```text
Profile kept; fallbackGenerated true; uiAction SHOW_QUESTION; STANDARD_PRACTICE; difficulty same or lower
```

### G23 — No eligible question

```text
QG empty → NO_ELIGIBLE_QUESTION path → END_SESSION safe message
```

---

## D. Baseline / empty profile

### G30 — Empty profile cold start

```text
mastery prior 0.50 / 0.10; sessionMode BASELINE; learningIntent BASELINE_ASSESSMENT
```

### G31 — Baseline completion

```text
12 blueprint slots done → next session ADAPTIVE_PRACTICE
```

### G32 — Baseline skip

```text
Skip: no mastery evidence; optional +1 slot; max 2 extensions
```

---

## E. Revision / session

### G40 — Due revision

```text
PENDING high-priority item due
Priority order selects EXECUTE_DUE_REVISION before normal targeting when applicable
(after re-test/explanation gates)
```

### G41 — Session timeout

```text
>= 15 minutes or question limit → END_SESSION
Then Recommendation proposals + student summary report
```

### G42 — Report not on hot path

```text
After ANSWER_SUBMITTED, Report Generator not invoked
```

---

## F. Hints / explanation routing

### G50 — Student hint request

```text
HINT_REQUESTED → Explanation Engine next ladder level → HINT_SHOWN
Decision Engine not required to approve
```

### G51 — Post-explanation does not auto-fetch question inside Explanation Engine

```text
Engine returns followUpIntent hint only; Loop must call Decision for RETEST
```

---

## G. API / validation

### G60 — Confidence out of range

```text
selfRatedConfidence 6 → VALIDATION_ERROR
```

### G61 — Confidence null allowed

```text
null accepted
```

### G62 — Forbidden uiAction alias

```text
Code emitting action: "EASIER_QUESTION" fails contract test
Must be uiAction SHOW_QUESTION + learningIntent DECREASE_DIFFICULTY
```

---

## Automated suite layout (when coding)

```text
apps/api/test/golden/
  mastery-formula.v1.spec.ts
  diagnostic-rules.v1.spec.ts
  decision-state-machine.v1.spec.ts
  durability.idempotency.spec.ts
  api.contracts.spec.ts
```

Fixture histories as JSON under `docs/mvp-1.0/test-fixtures/` (add during implementation).
