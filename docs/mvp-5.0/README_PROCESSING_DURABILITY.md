# MVP 5.0 — Processing & Durability

> Tx1–Tx4 preserved. Modality playback and policy inference have strict budgets; heavy training is offline.

## Hot path

```text
Policy inference (learned): local/CPU or low-latency service with timeout
On timeout / error → baseline rules decision
Modality: return asset reference only; streaming is client/CDN
```

## Offline jobs

| Job | Purpose |
|---|---|
| `POLICY_DATASET_BUILD` | Export features/actions/outcomes |
| `POLICY_OFFLINE_EVAL` | Safety + value metrics |
| `MODALITY_TRANSCODE` | Media processing |
| `MODALITY_OUTCOME_AGG` | Effectiveness stats |

## Idempotency

Policy promotion and rollback are audited, single-active `PROMOTED` per subject (or explicit multi-policy map).
