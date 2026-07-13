# MVP 3.0 — Test Plan (Golden Cases)

> **Delta from MVP 2.0:** New **S##** series for scoring, experiments, and draft gates.  
> **R##** (MVP 2.0) and **G##** (MVP 1.0) remain required regression.

Versions under test: carry `*-v2` plus `decision-rules-v3`, `experiment-rules-v1`, `candidate-score-rules-v1`, `content-validation-rules-v1`, `content-draft-rules-v1`.

---

## Numbering map

| Series | Scope |
|---|---|
| G01–G62 | MVP 1.0 regression |
| R01–R20 | MVP 2.0 regression |
| **S01–S20** | MVP 3.0 additions (this file) |

Numeric confidence ±0.05 unless marked **exact**.

---

## A. Experiments

### S01 — Sticky assignment

```text
Setup: eligible student, experiment policy_score_linear_eq running, 50/50 arms
Action: resolve assignment twice across two sessions
Expected: same arm both times; single ExperimentAssignment row
Expected event: EXPERIMENT_ASSIGNED once
```

### S02 — Ineligible stays control

```text
Setup: baseline-only student, excludeBaselineOnly=true
Expected: no scored arm applied; decisions match control goldens
Expected: no ExperimentAssignment row (preferred)
```

### S03 — Hash allocation within tolerance

```text
Setup: 10_000 synthetic studentIds, 50/50 allocation
Expected: each arm in [48%, 52%] (exact band for test harness)
```

---

## B. Candidate scoring

### S04 — Scorer cannot override END_SESSION

```text
Setup: session past 15 min limit; scored arm assigned
Expected decision:
  uiAction: END_SESSION
  even if scorer would prefer SHOW_QUESTION
Durability: no CandidateActionScore selection applied; optional shadow log only
```

### S05 — Scorer cannot override SUGGEST_BREAK

```text
Setup: fatigue gate matched; scored arm
Expected: uiAction SUGGEST_BREAK / intent BREAK_FOR_FATIGUE
```

### S06 — Due revision remains in candidate set

```text
Setup: PENDING high-priority retention item; scored arm
Expected: selected action learningIntent in {RETENTION_REVIEW, EXECUTE_DUE_REVISION}
```

### S07 — Heuristic score exact (toy features)

```text
Setup features (exact):
  masteryGapTerm=1.0, retentionRiskTerm=0.0, misconceptionSeverity=0.0,
  explanationNeedTerm=0.0, explorationTerm=0.0
Compute: score = 0.30 × 1.0 = 0.30 (exact)
Expected: candidate with higher score selected when both legal
```

### S08 — Shadow mode does not change decision

```text
Setup: shadow=true, scored would differ from control
Expected: decision equals control; CandidateActionScore.shadow=true persisted
```

### S09 — Empty legal set falls back

```text
Setup: scorer invoked with empty candidates (forced)
Expected: control policy decision; fallback logged
```

### S10 — Illegal uiAction rejected

```text
Setup: malformed candidate with uiAction "EASIER_QUESTION"
Expected: validation reject; never persist as selected decision
```

---

## C. Content draft / validation

### S11 — LLM draft never student-visible

```text
Setup: ContentDraft status VALIDATED
Expected: QG cannot select it; only APPROVED bank items served
```

### S12 — Validation failure blocks review queue

```text
Setup: draft with wrong accepted answer for stem
Expected: status VALIDATION_FAILED; cannot transition to PENDING_REVIEW without edit+revalidate
```

### S13 — Promotion creates APPROVED bank item

```text
Setup: PENDING_REVIEW draft approved by reviewer
Expected: status APPROVED_PROMOTED; question.reviewStatus=APPROVED; draftOriginId linked
```

### S14 — Canonical concept ID enforced

```text
Setup: draft conceptId = C6_WORD_PROBLEMS (alias)
Expected: VALIDATION_FAILED (must use C6_SIMPLE_WORD_PROBLEMS)
```

### S15 — Deny-list language

```text
Setup: stem contains clinical label language from deny-list
Expected: VALIDATION_FAILED
```

---

## D. Contracts / durability

### S16 — Decision snapshot includes experiment fields

```text
Setup: scored arm decision applied
Expected: inputSnapshot.experimentKey + experimentArm present; decisionVersion decision-rules-v3 or documented arm version
```

### S17 — MVP 2.0 replay

```text
Setup: stored decision-rules-v2 row
Expected: replay unchanged under MVP 3.0 codepaths
```

### S18 — Hot path has no LLM call

```text
Setup: instrument provider client during answer submit
Expected: zero provider invocations on Tx1–Tx4
```

### S19 — Analysis export idempotent

```text
Setup: run EXPERIMENT_ANALYSIS_EXPORT twice same period key
Expected: single logical export / idempotent job completion
```

### S20 — Control arm matches R01 retention path

```text
Setup: R01 retention fixture; student assigned control
Expected: same decision as R01 (RETENTION_REVIEW when eligible)
```

---

## E. Additional Goldens

### S21 — All candidate scores equal (tie-break)

```text
Setup: 3 legal candidates with identical scores (e.g., all 0.50 exact)
Expected: selected action matches control policy's default intent order (e.g., STANDARD_PRACTICE > RETENTION_REVIEW if both legal and score-tied)
If intent-tied: lexicographic learningIntent + conceptId (e.g., "RETENTION_REVIEW:C1_…" < "STANDARD_PRACTICE:C2_…")
Durability: log candidateScores show all three with score=0.50; selectionReason includes "tie-break"
```

### S22 — LLM provider timeout in draft job (durability / no student impact)

```text
Setup: draft job calls LLM; provider times out after 30s
Expected:
  - Job status: FAILED or RETRYABLE with error logged
  - Draft status remains DRAFT or transitions to VALIDATION_FAILED (no PENDING_REVIEW without successful LLM response + validation pass)
  - Zero student-visible impact: students never served non-APPROVED content
  - Alert or job retry according to worker durability policy
  - No silent fallback to APPROVED without validation
```

---

## Regression requirement

CI for MVP 3.0 implementation must run **G## + R## + S##**. Skipping G/R is a release blocker.
