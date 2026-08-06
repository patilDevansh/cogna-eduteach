# MVP 3.0 — Personalization

> **Delta from MVP 2.0:** Personalization remains evidence-based. Experiment arms may change **how** legal actions are ranked; they do not invent new personalization labels.

## Carry-forward

From MVP 2.0:

- Calibration-aware difficulty caution
- Misconception targeting via remediation machine
- Retention / transfer / fatigue intents
- Weak evidence abstains

## Experiment-aware personalization

| Arm | Behavior |
|---|---|
| `control` | Exact MVP 2.0 / `decision-rules-v2`–compatible baseline |
| `scored_v1` | Rank legal candidates with `candidate-score-rules-v1` |

Personalization still requires:

```text
minimum evidence for the factor used
traceable reasoning string
versioned decision + optional candidateScoreId
```

## What still must not personalize

- Clinical / attention / personality inference
- Permanent labels from one session
- Different grading standards by arm
- Different APPROVED content gates by arm

## Shadow personalization

Before enabling `scored_v1` for live traffic, run shadow scoring for ≥ N decisions (pilot plan) and compare agreement rate with control.

**Shadow mode default:** N = 500 decisions per experiment-eligible student cohort (suggested pilot default; may be adjusted by ops based on variance).

**Agreement analysis:**

```text
Agreement rate = decisions where shadow == control / total shadow decisions
Target: ≥ 80% agreement before considering live experiment arm
If < 80%: review scorer term weights, feature distributions, and candidate generation logic
```

Shadow logs feed experiment design; low agreement may indicate either useful personalization signal or scorer miscalibration.
