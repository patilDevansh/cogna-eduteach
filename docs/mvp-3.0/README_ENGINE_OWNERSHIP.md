# MVP 3.0 — Engine Ownership

> **Delta from MVP 2.0:** New owners for drafts, validation, experiments, and candidate scoring. Existing engines keep boundaries.

## Ownership matrix

| Engine / Service | Owns | Must not |
|---|---|---|
| Learning Loop | Tx1–Tx4 orchestration, idempotency | Diagnose or invent content |
| Diagnostic Engine | Mastery, misconceptions, retention, velocity, etc. | Emit `LearningDecision` or call LLM |
| Decision Engine | Legal candidates, control policy, hard gates | Call LLM; write drafts; assign experiments (reads only) |
| Candidate Scorer | Rank legal candidates; persist scores | Invent illegal actions; bypass END_SESSION |
| Experiment Registry | Definitions, sticky assignment | Change mastery formulas ad hoc |
| Question Generator | Select APPROVED items | Serve DRAFT / PENDING_REVIEW |
| Explanation Engine | APPROVED templates + outcomes | Generate live explanations via LLM |
| Content Draft Service | Create/store drafts; enqueue LLM jobs | Promote without review; touch student sessions |
| Validation Service | Schema + math checks on drafts | Approve for students |
| Content Review Service | Human approve/reject; promote | Auto-approve LLM output |
| Recommendation / Revision | Plans and queues | Experiment branching without registry |
| Report Generator | Session/weekly copy | Reveal raw experiment arm unless consented policy |
| Observability | Metrics, alerts | Mutate learning state |
| Analysis Harness | Offline exports | Online decision mutation |

## Call graph rules

```text
Loop → Diagnostic → Decision → (optional Scorer) → QG / Explanation
Loop ↛ LLM
Decision ↛ Content Draft
Scorer → Decision candidates only
Draft → Validation → Review → Bank
Bank → QG
```

## Conflict resolution

If ownership is unclear: **default to MVP 2.0 behavior** and log a SKIPPED item rather than inventing a cross-engine shortcut.
