# MVP 3.0 — Reports & Delivery

> **Delta from MVP 2.0:** Weekly/session reports carry forward. Experiment participation is omitted from parent copy by default.

## Carry-forward

- Session summaries
- Weekly parent reports + email delivery jobs
- Observation vs inference language
- Workload-safe next steps

## Experiment disclosure policy (default)

```text
Parent reports: do NOT mention experiment arm or scoring
Internal ops exports: include arm, candidateScoreId, outcomes
Student UI: no experiment jargon
```

If a regulated pilot requires consent language, add a one-time parent notice **outside** the weekly learning narrative (Pilot Plan).

## New optional ops report

`EXPERIMENT_ANALYSIS_EXPORT` CSV/Parquet columns (sketch):

```text
studentId, experimentKey, arm, sessionCount, avgMasteryDelta,
retentionReviewsCompleted, misconceptionActivations, decisionCount
```

No student-facing math content in exports without APPROVED IDs only.
