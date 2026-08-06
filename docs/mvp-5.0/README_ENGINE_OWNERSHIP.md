# MVP 5.0 — Engine Ownership

> Multi-agent names map to bounded engines.

| Agent (product) | Engine owner | Must not |
|---|---|---|
| Orchestrator | Learning Loop | Diagnose; generate media |
| Diagnostic Agent | Diagnostic Engine | Decide policy; call media APIs |
| Policy Agent | Decision + Learned Policy runtime | Bypass safety gate |
| Teaching Agent | QG + Explanation + Modality Director | Approve content |
| Revision Agent | Recommendation + Revision | Train models online |
| Parent Communication Agent | Report Generator | Reveal unsafe inferences |
| Safety Agent | Review + Safety Eval + Observability | Silently waive APPROVED |

Specialists communicate via Loop/contracts only.
