# MVP 3.0 — Retention & Revision

> **Delta from MVP 2.0:** Retention formulas and revision queue semantics carry forward. Experiments may score among legal revision intents but cannot skip hard due revision gates.

## Carry-forward

- `retention-rules-v2` estimate formula
- Due bands (`< 0.40` high priority, `< 0.55` eligible)
- Daily / weekly revision plans with workload caps
- `RETENTION_REVIEW` / `EXECUTE_DUE_REVISION` intents

## Experiment interaction

```text
IF hard due PENDING revision exists:
  candidate set MUST include the due revision action
  scorer may only choose among legal due items if multiple
ELSE:
  scorer may rank practice/transfer/etc. candidates
```

## Non-goals

- Calendar mastery decay
- Multi-unit spaced curriculum graph (MVP 4.0 planning horizon)
- Learned forgetting curves (research; evaluate in MVP 5.0)
