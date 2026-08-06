# MVP 2.0 — Test Plan (Golden Cases)

> Golden cases for MVP 2.0 rules/contracts. Engines must match expected outputs under versioned rules.  
> Numbering: **R##** = retention/personalization/ops cases new to MVP 2.0.  
> MVP 1.0 **G##** cases remain in force; R cases extend them. Mapping noted per case.

Versions under test: `mastery-formula-v2`, `diagnostic-rules-v2`, `decision-rules-v2`, `retention-rules-v2`, `recommendation-rules-v2`.

---

## How to use

Each case lists: setup, events (when needed), expected diagnosis/numbers (exact where marked), expected `LearningDecision` (`uiAction` + `learningIntent`), durability notes.

Numeric confidence may be ±0.05 unless marked **exact**.

### Numbering map

| Series | Scope |
|---|---|
| G01–G62 | MVP 1.0 goldens — still required regression suite ([mvp-1.0/README_TEST_PLAN.md](../mvp-1.0/README_TEST_PLAN.md)) |
| R01–R20 | MVP 2.0 additions (this file) |

---

## A. Retention (`retention-rules-v2`)

### R01 — Retention due (exact formula)

```text
Setup:
  conceptId: C2_ONE_STEP_SUBTRACTION
  masteryScore.value = 0.70
  evidenceCount >= 2 independent attempts, ≥1 independent CORRECT
  daysSinceSuccess = 7
  completedRevisionsLast14Days = 0

Compute (exact):
  revisionBoost = min(0.20, 0.05 × 0) = 0
  forgettingPenalty = min(0.45, 0.04 × 7) = 0.28
  retentionEstimate = clamp(0.70 + 0 − 0.28, 0, 1) = 0.42

Expected:
  retentionEstimate = 0.42 (exact)
  retentionEstimate < 0.55 → RETENTION_REVIEW eligible
  retentionEstimate >= 0.40 → not high-priority band

Expected decision (when retention item is highest due PENDING and gates 1–4 do not match):
  uiAction: SHOW_QUESTION
  learningIntent: RETENTION_REVIEW
  parameters.conceptId: C2_ONE_STEP_SUBTRACTION
  decisionVersion: decision-rules-v2

Durability:
  Retention factor write is versioned (retention-rules-v2); replay from attempts + mastery snapshot.
  Must not block answer hot path (Tx1–Tx4).
```

Maps: extends G40 (due revision priority) with retention-specific intent.

### R02 — Weak retention evidence abstains

```text
Setup: only 1 independent attempt on concept
Expected: no retentionEstimate factor; RETENTION_ESTIMATE_INSUFFICIENT path
Expected decision: must NOT emit RETENTION_REVIEW from retention factor
  (may still STANDARD_PRACTICE)
Durability: abstention logged; no fake estimate row with confidence > 0
```

### R03 — High-priority retention band

```text
Setup: mastery 0.55, daysSinceSuccess = 10, completedRevisionsLast14Days = 0
Compute (exact):
  forgettingPenalty = min(0.45, 0.40) = 0.40
  retentionEstimate = clamp(0.55 − 0.40, 0, 1) = 0.15
Expected: retentionEstimate = 0.15 (exact); high-priority revision (< 0.40)
Expected: retentionRisk term = 1 − 0.15 = 0.85 in recommendation formula
```

---

## B. Diagnostic extensions

### R04 — Learning velocity improving

```text
Setup:
  masterySevenDaysAgo = 0.50
  masteryNow = 0.62
  eligibleAttempts in window = 4
Compute (exact):
  velocity = (0.62 − 0.50) / 4 = 0.03
Expected: interpretation = improving
Student UI: no velocity label shown
```

### R05 — Error recovery low → prefer STEP_BY_STEP

```text
Setup:
  feedbackOpportunities = 4
  correctAfterFeedbackAttempts = 1
  remediation state = EXPLANATION_REQUIRED
  misconceptionConfidence >= 0.60
Compute (exact): errorRecoveryRate = 1 / 4 = 0.25 (< 0.35)
Expected decision:
  uiAction: SHOW_EXPLANATION
  learningIntent: TARGET_MISCONCEPTION
  contentStyle.explanationStyle: STEP_BY_STEP
Durability: explanation decision stored with decision-rules-v2; does not mutate mastery
```

### R06 — Explanation effective

```text
Setup:
  EXPLANATION_VIEWED for template E1
  next comparable attempt CORRECT, highestHintLevel <= 1
Expected: explanation_outcomes.effective = true
Durability: outcome row keyed to viewed_event_id; idempotent on same eventId
```

---

## C. Fatigue / session priority

### R07 — Fatigue break before hard stop

```text
Setup:
  sessionMinutes = 12
  idleSpikeCount = 2
  questionCount < sessionLimit
  no prior break this session
Expected decision:
  uiAction: SUGGEST_BREAK
  learningIntent: BREAK_FOR_FATIGUE
  parameters.breakMinutes: 3
Durability: break suggestion recorded once per session; second evaluate does not re-fire unless policy allows
```

### R08 — END_SESSION beats SUGGEST_BREAK

```text
Setup:
  sessionMinutes = 15
  fatigueRisk = true (idleSpikeCount >= 2 or equivalent)
  questionCount may be < sessionLimit
Expected decision:
  uiAction: END_SESSION
  learningIntent: MUST NOT be BREAK_FOR_FATIGUE
  uiAction must NOT be SUGGEST_BREAK
  (session-end may omit learningIntent or use a non-break intent; hard stop wins)
Durability: SESSION_ENDED once; Recommendation proposals after hot path
Maps: extends G41
```

---

## D. Recommendation / workload

### R09 — Daily workload cap

```text
Setup: >10 due revision questions across concepts
Expected: daily plan caps at maxQuestionsPerDay = 10, maxConceptsPerDay = 3
Durability: planner job idempotency key for day; re-run does not inflate queue past caps
```

### R10 — Recommendation term math (spot check)

```text
Setup:
  weakness = 0.40
  misconceptionSeverity = 0.80
  retentionRisk = 0.58
  prereqImportance = 0
  parentGoalBoost = 0
Compute (exact):
  priority = 0.30×0.40 + 0.25×0.80 + 0.20×0.58 + 0.15×0 + 0.10×0
           = 0.12 + 0.20 + 0.116 = 0.436
Expected: priority ≈ 0.436 (exact within float tolerance 1e-9)
```

---

## E. Reports / content / safety

### R11 — Weekly report uncertainty

```text
Setup: weak evidence pattern (calibration unknown, thin mastery evidence)
Expected: parent report text includes "still gathering evidence"
  must not assert a firm misconception label
Durability: report generation is async job; duplicate WEEKLY_REPORT_REQUESTED returns same reportId
```

### R12 — Content approval gate

```text
Setup: PENDING_REVIEW question selected by QG in staging with ALLOW_PENDING off
Expected: NO_APPROVED_CONTENT / safe END_SESSION or alternate APPROVED item
  must not serve PENDING_REVIEW to student
```

### R13 — No clinical labels

```text
Setup: high idle/fatigue signal
Expected: no ADHD/attention disorder wording in report/UI/BreakPayload.message
```

### R14 — Alternative explanation not dominant

```text
Setup:
  SIGN_HANDLING weightedMatchingCount = 2, confidence = 0.65
  ARITHMETIC_SLIP weightedMatchingCount = 2, confidence = 0.70
Expected: alternativeExplanationDominant = true for SIGN_HANDLING
  state remains UNCONFIRMED; learningIntent ≠ TARGET_MISCONCEPTION
Maps: extends G03
```

---

## F. Durability / contracts (MVP 2.0)

### R15 — New intent enum migration guard

```text
Contract test: packages/shared LearningIntent includes
  RETENTION_REVIEW | TRANSFER_CHECK | BREAK_FOR_FATIGUE
Forbidden: emitting those strings before enum migration lands in CI
```

### R16 — v1 decision replay

```text
Setup: stored decision with decisionVersion decision-rules-v1
Expected: replay/read path still accepts; no forced rewrite to v2
```

### R17 — Async weekly report idempotency

```text
Same idempotency key {studentId}:{periodStart}:{periodEnd} twice
Expected: one report row; second returns stored reportId
  answer hot path never awaits this job
```

### R18 — Email delivery idempotency

```text
Same {reportId}:{parentId}:{channel} twice
Expected: one send attempt chain; no double provider send on success
```

### R19 — Transfer check decision

```text
Setup:
  concept C5_TWO_STEP_EQUATIONS
  masteryScore.value = 0.78 (>= masteryThreshold 0.75)
  evidenceCount >= 5
  no active misconception confidence > 0.6
  APPROVED TRANSFER_CHECK item available
Expected:
  uiAction: SHOW_QUESTION
  learningIntent: TRANSFER_CHECK
  contentStyle.questionFormat: WORD_PROBLEM (or as tagged on item)
  decisionVersion: decision-rules-v2
```

### R20 — Mastery does not calendar-decay

```text
Setup: mastery 0.70, no new attempts for 14 days
Expected: masteryScore.value still 0.70
  retentionEstimate may drop via forgettingPenalty
  must NOT auto-subtract mastery
```

---

## CLI scenarios

| Scenario | Covers |
|---|---|
| `retention-review-due` | R01, R03, revision API |
| `weekly-report` | R11, R17 |
| `content-approval-gate` | R12 |
| `fatigue-break` | R07, R08 |
| `explanation-effectiveness` | R06 |
| `email-report-delivery` | R18 |
| `transfer-check` | R19 |

## UI smoke

- parent login with Clerk/dev fallback
- create student and view weekly summary
- student completes one adaptive session
- student sees revision queue
- break suggestion appears when simulated
- report email request button works

## Content tests

- unique IDs
- accepted answers / solution steps / hint ladder present
- concept/misconception IDs exist (canonical mvp-1.0 IDs)
- APPROVED count meets manifest target
- no non-APPROVED content in staging seed

## Release gate

Before pilot:

- G## regression suite green
- R## golden suite green
- CLI scenarios green
- UI smoke green
- content manifest target met
- review checklist signed
- parent auth routes protected
- observability dashboard receiving events

## Automated suite layout (when coding)

```text
apps/api/test/golden/
  retention-rules.v2.spec.ts
  decision-priority.v2.spec.ts
  recommendation-terms.v2.spec.ts
  durability.async-jobs.v2.spec.ts
```
