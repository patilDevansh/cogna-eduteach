# MVP 4.0 — Observability

> **Delta from MVP 3.0:** Unit unlock rates, plan refresh health, cross-unit retention, bank coverage per unit.

## Metrics

| Group | Examples |
|---|---|
| Curriculum | unlock events, blocked unlock reasons |
| Planning | plan refresh success, horizon adherence % |
| Content | APPROVED coverage by unitId |
| Safety | serve attempts with mismatched unit/concept |

## Alerts

```text
P0: non-APPROVED serve
P1: plan refresh failure rate
P1: unit bank below pilot floor while unit unlocked for cohort
```
