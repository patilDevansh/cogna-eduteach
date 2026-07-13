# MVP 3.0 — Observability

> **Delta from MVP 2.0:** Add draft funnel, experiment arm, and scorer metrics. Carry pilot dashboard foundations.

## Metric groups

| Group | Examples |
|---|---|
| Product | sessions, retention, weekly report success (MVP 2.0) |
| Content draft funnel | created, validated, failed, pending, rejected, promoted |
| Experiments | assignments by arm, sticky reuse rate, eligibility misses |
| Scoring | shadow vs live apply rate, control agreement %, Tx4 score latency |
| Safety | non-APPROVED serve attempts (must be 0), LLM called on hot path (must be 0) |

## Alerts (proposed)

```text
P0: student served non-APPROVED content
P0: LLM invoked on answer hot path
P1: experiment arm imbalance > threshold for > 24h
P1: draft validation failure rate > 50% over 100 drafts
P2: scorer fallback-to-control rate > 10%
```

## Dashboards

- Extend `GET /observability/pilot-dashboard` with experiment + draft sections (feature-flagged).
- Analysis harness exports are source of truth for causal claims; dashboards are operational.

## Latency

Candidate scoring p95 added to Tx4 stage logs. Draft/LLM latencies are job metrics only.

---

## Feature Flag Behavior Matrix

**Purpose:** Control rollout and feature gate behavior across environments. All experiments and LLM-assisted features require explicit enable in production; staging must be safe for internal testing without pilot parent exposure.

### Flag precedence

```text
1. EXPERIMENTS_ENABLED (master switch)
2. CONTENT_LLM_DRAFTS_ENABLED (authoring gate)
3. Per-experiment enable flags (if implemented)
```

### Flag matrix

| Flag | Staging Default | Production Default | Purpose |
|---|---|---|---|
| `EXPERIMENTS_ENABLED` | `true` | `false` until pilot consent | Master switch for all experiment assignment and branching |
| `CONTENT_LLM_DRAFTS_ENABLED` | `true` | `false` until review owner ready | Enables LLM-assisted draft job and review queue |
| `CANDIDATE_SCORING_SHADOW` | `true` | `false` until shadow N met | Logs candidate scores without applying selection |

### Safety rules

```text
- Production pilot parents never assigned to experiment arms without explicit parent consent and EXPERIMENTS_ENABLED=true
- Staging may shadow-log experiments for testing; no real parent data
- Disabling CONTENT_LLM_DRAFTS_ENABLED pauses new draft creation; existing APPROVED items remain available
- Disabling EXPERIMENTS_ENABLED mid-pilot: existing sticky assignments may continue or default to control per cutover policy (requires operational plan before disable)
```

### Observability

- Emit flag state on session start
- Alert if experiment assigned when `EXPERIMENTS_ENABLED=false` (P0 violation)
