# MVP 2.0 — Observability

> Pilot readiness requires knowing whether the learning loop works, whether the product is stable, and whether safety gates are holding.

## Event Categories

| Category | Examples |
|---|---|
| Product | signup, student created, session started, report viewed |
| Learning | answer submitted, hint requested, explanation viewed, revision completed |
| Engine | diagnostic factor created, decision emitted, QG fallback |
| Reliability | API error, retry, failed job, email failure |
| Safety | no approved content, weak evidence abstention, content review blocked |

## Required Metrics

### Learning Metrics

- sessions per student per week
- questions attempted
- independent correct rate
- hint rate
- explanation effectiveness
- misconception resolution rate
- revision completion rate
- retention review success rate

### Product Metrics

- parent signup completion
- student login success
- parent report views
- weekly report email delivery
- return sessions

### Reliability Metrics

- Tx1-Tx4 stage latency
- fallback decision rate
- QG no eligible content count
- report delivery failure rate
- API error rate

## Logs

Structured logs should include:

```json
{
  "event": "learning_loop_stage",
  "stage": "diagnostic",
  "studentId": "stu_...",
  "sessionId": "sess_...",
  "attemptId": "att_...",
  "latencyMs": 42,
  "ruleVersion": "diagnostic-rules-v2"
}
```

## Dashboards

MVP 2.0 should have:

1. Pilot health dashboard
2. Learning loop reliability dashboard
3. Content coverage dashboard
4. Parent report delivery dashboard
5. Safety/abstention dashboard

## Alert Thresholds

| Alert | Threshold |
|---|---|
| API error rate | >2% over 15 min |
| fallback decision rate | >5% over 1 day |
| no approved content | any staging/prod occurrence |
| report delivery failure | >10% over 1 day |
| golden tests fail | block merge |
| scenario tests fail | block release |

## Privacy

Do not send raw submitted answers to third-party analytics unless explicitly approved. Prefer IDs, aggregates, and event types.

## Local Fallback

If PostHog/Sentry keys are missing, observability logs to console and DB event tables. Missing vendor keys must not break local development.
