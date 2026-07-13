# MVP 5.0 — Observability

## Metric groups

| Group | Examples |
|---|---|
| Policy | baseline vs learned selection, rollback count, safety fail |
| Modality | start/complete rates, retest lift, CDN errors |
| Subject | active subjects, cross-subject abstentions |
| Safety | non-APPROVED attempts, hot-path generative calls (must be 0) |

## Alerts

```text
P0: non-APPROVED modality or text served
P0: learned policy applied when safetyGatePassed=false
P0: generative model called on answer hot path
P1: policy timeout fallback rate high
P1: modality retest lift negative vs text control in experiment
```

---

## Rollback SLO (optional P2)

**Target:** Policy rollback to baseline completes within **5 minutes** from decision to traffic serving baseline-only.

**Mechanism:**

```text
1. policy_ops actor triggers rollback (single-click or API call)
2. System sets active_policy_version = baseline in config/database
3. Decision Engine polls or receives push notification of policy change
4. New sessions use baseline within ≤ 1 minute (cache TTL)
5. In-flight sessions complete current decision; next decision uses baseline
6. Observability confirms rollback: policy selection logs show baseline version within 5 min
```

**Why 5 minutes:** Balances operational urgency (P0 production issue) with reasonable propagation time across distributed Decision Engine workers. Faster rollback requires hot-standby architecture or feature-flag propagation optimization (may be overkill for MVP 5.0 pilot scale).

**Validation:** Rollback drill during staging; measure end-to-end time from trigger to 100% baseline traffic.
