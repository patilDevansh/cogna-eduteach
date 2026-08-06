# MVP 5.0 — Rules

> **Delta from MVP 4.0:** Safety-gated learned policy; modality selection rules; multi-subject unlock. Baseline rules remain the rollback target.

## Safety gate (`safety-eval-rules-v1`)

A learned policy may apply online only if:

```text
1. Offline eval vs baseline on held-out logs: no significant harm on safety metrics
2. Hard-constraint imitation rate ≥ threshold
   (END_SESSION / SUGGEST_BREAK / due revision legality must match baseline ≥ 99.5%)
3. Shadow agreement period completed
4. Experiment promotion recorded
5. Instant rollback flag available
```

If any gate fails → **baseline only**.

**Concrete safety suite metrics (must pass before promotion):**

| Metric | Threshold | Purpose |
|---|---|---|
| **Mastery delta vs baseline** | ≥ −0.02 (no significant harm) | Ensure learned policy does not degrade learning outcomes |
| **Misconception false-positive rate** | ≤ 5% on held-out logs | Avoid incorrect misconception targeting that wastes time |
| **Session length violation rate** | 0% (hard gate respected) | END_SESSION and time limits never overridden |
| **Hard-constraint imitation** | ≥ 99.5% agreement on due-revision / break / end gates | Policy respects non-negotiable rules |
| **Non-APPROVED content attempts** | 0 in shadow + experiment logs | No policy behavior that selects unvalidated content |
| **Explanation-after-incorrect rate** | Within [baseline − 10%, baseline + 10%] | Learned policy should not skip remediation explanations |
| **Retention item skipped rate** | ≤ baseline + 5% | Policy does not defer high-priority spaced review |

**Harm definition:** Statistically significant negative delta on mastery, retention estimate, or session engagement vs baseline control on held-out evaluation set (≥1000 decisions).

**Offline eval dataset:** Held-out logs from experiment shadow period or prior cohorts; never trained on.

## Learned policy (`learned-policy-v1` sketch)

```text
Input: feature vector from Diagnostic + plan + experiment arm
Output: distribution over legal CandidateActions
Action: argmax among legal candidates that pass hard gates
Forbidden: invent uiAction; skip APPROVED check; emit clinical labels
```

Training is offline; no online gradient updates on live children without a future explicit spec.

## Modality selection (`modality-rules-v1`)

```text
IF learningIntent in teaching set AND APPROVED modality asset exists
  AND misconception/concept match
  AND student modality fatigue not high
THEN contentStyle.modality = asset.modality
ELSE TEXT fallback
```

Voice/video never replace grading. Math claims in scripts must match APPROVED solution text.

## Subject graph (`subject-graph-rules-v1`)

```text
subjectId examples: mathematics, science (draft)
units belong to subjects
cross-subject transfer intents require explicit evidence rules (default: abstain)
```

## Carry-forward

All hard session gates, APPROVED-only content, no silent mastery calendar decay without version bump.
