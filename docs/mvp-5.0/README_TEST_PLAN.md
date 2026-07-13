# MVP 5.0 — Test Plan (Golden Cases)

> **A##** = agentic / modality / learned-policy cases.  
> G##, R##, S##, U## remain regression when implementing.

| Series | Era |
|---|---|
| G## | 1.0 |
| R## | 2.0 |
| S## | 3.0 |
| U## | 4.0 |
| **A01–A15** | 5.0 |

### A01 — uiAction set unchanged

```text
Expected: only five uiActions; modality via contentStyle
```

### A02 — Safety gate blocks unsafe policy

```text
Setup: safety_evals.passed=false
Expected: baseline only; learned never selected
```

**Safety eval metrics verified (see README_RULES.md safety-eval-rules-v1):**

```text
- Mastery delta ≥ −0.02 vs baseline
- Misconception FP rate ≤ 5%
- Session length violation rate = 0%
- Hard-constraint imitation ≥ 99.5%
- Non-APPROVED content attempts = 0
- Explanation-after-incorrect rate within [baseline − 10%, baseline + 10%]
- Retention item skipped rate ≤ baseline + 5%
```

### A03 — Hard gate imitation

```text
Setup: session should END_SESSION
Expected: learned policy also END_SESSION (or system forces baseline)
```

### A04 — Policy timeout fallback

```text
Expected: on inference timeout → baseline decision; alert metric
```

### A05 — Non-APPROVED modality blocked

```text
Expected: Modality Director will not select PENDING_REVIEW asset
```

### A06 — Modality without retest mapping fails validation

```text
Expected: cannot APPROVE asset lacking retest question link
```

### A07 — Watch time ≠ mastery

```text
Setup: completed video, no retest
Expected: mastery unchanged until attempt evidence
```

### A08 — Shadow policy logs PolicyChoiceRecord

```text
Expected: selected=baseline, learnedDecision present, shadow=true
```

### A09 — Promote requires dual control (ops test)

```text
Expected: single actor cannot promote without second approval in prod config
```

### A10 — Rollback restores baseline

```text
Expected: after rollback, decisions use rules baseline version
```

### A11 — Cross-subject abstain default

```text
Setup: science profile empty, math strong
Expected: no science teaching decision without evidence/placement
```

### A12 — Hot path generative ban

```text
Expected: zero LLM/media-gen calls during Tx1–Tx4
```

### A13 — Transcript claim mismatch fails review

```text
Setup: voice transcript asserts wrong solution
Expected: VALIDATION_FAILED / cannot APPROVE
```

### A14 — Workload includes modality minutes

```text
Expected: recommendation respects combined cap
```

### A15 — Linear Equations IDs still frozen

```text
Expected: P2_NEGATIVE_OPS, C6_SIMPLE_WORD_PROBLEMS unchanged
```

---

## G. Agent ownership test

### A16 — Diagnostic agent never calls QG directly (ownership boundary)

```text
Setup: session in progress; Diagnostic Engine updates misconception confidence
Expected:
  - Diagnostic Engine writes to learner profile / diagnostic state
  - Diagnostic Engine emits diagnostic event
  - Decision Engine (Policy Agent) reads updated profile; selects learning intent
  - Teaching Agent (QG + Modality Director) receives decision; selects content
  - Diagnostic NEVER calls QG.selectQuestion, Modality Director, or content APIs directly
Violations logged as ownership-boundary-violation alert (P1)
```

**Ownership reminder (MVP 5.0 multi-agent architecture):**

| Engine | May call | Must not call |
|---|---|---|
| Diagnostic | Profile writes, diagnostic events | Decision, QG, Modality Director, content approval |
| Decision + Policy | Legal candidate generation, scoring/selection | Diagnostic state writes, QG directly (must go through Teaching Agent contract) |
| QG + Modality Director | Content selection within legal set | Diagnostic writes, decision policy, approval bypass |
| Recommendation + Revision | Revision queue, workload planning | Hot-path decision override, diagnostic |

**Why A16 matters:** Ensures separation of concerns in multi-agent brain; prevents diagnostic logic from bypassing decision policy or content gates.
