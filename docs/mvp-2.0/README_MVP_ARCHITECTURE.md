# MVP 2.0 — Architecture

> MVP 2.0 keeps the MVP 1.0 modular monolith and adds pilot-scale content, retention, reporting, observability, and production integration paths.  
> Do not implement mature `COGNA/` architecture directly unless this spec promotes it.

## Architecture Principle

Cogna remains an **event-driven learning loop** with bounded engines:

```text
Student action
  -> raw event
  -> grading / evidence
  -> Diagnostic Engine
  -> Learner Profile v2
  -> Decision Engine
  -> content provider
  -> response
  -> reports / revision / observability
```

The "brain" is not one LLM. It is the combination of:

- immutable evidence
- versioned inference rules
- learner profile memory
- decision policy
- reviewed content
- measurable outcomes

## Modules

| Module | MVP 2.0 responsibility |
|---|---|
| Learning Loop | Orchestrates Tx1-Tx4, stage latency logs, retry, idempotency |
| Diagnostic Engine | Updates mastery, misconception, retention, velocity, calibration, hint dependence, explanation effectiveness |
| Decision Engine | Emits canonical `LearningDecision`; supports break, revision, transfer, confidence-aware decisions |
| Question Generator | Selects from full APPROVED bank using intent, concept, difficulty, misconception, retention, item statistics |
| Explanation Engine | Serves approved templates and style variants; measures outcome after explanation |
| Recommendation Engine | Builds daily and weekly revision plans with workload caps |
| Revision Service | Owns queue, dedupe, status, due dates, completion outcomes |
| Report Generator | Session and weekly parent/student reports, email-ready delivery records |
| Content Review Service | Tracks PENDING_REVIEW -> APPROVED gates and reviewer sign-off |
| Observability Service | Emits product, learning, reliability, and safety metrics |

## Runtime Topology

MVP 2.0 stays deployable as:

```text
apps/web     Next.js
apps/api     NestJS modular monolith
postgres     primary state + event log
jobs         same API process or worker command
```

Queues may be simulated with database-backed job rows. A full message broker is not required for MVP 2.0.

## Data Flow: Session End

```text
POST /sessions/:id/end
  -> write SESSION_ENDED
  -> ReportGenerator.generateSessionSummary
  -> RecommendationEngine.planDailyRevision
  -> RevisionService.applyPlan
  -> Observability.recordSessionClosed
```

Weekly reports run from a scheduled job, not the answer hot path.

## Data Flow: Explanation Effectiveness

```text
SHOW_EXPLANATION
  -> EXPLANATION_VIEWED
  -> RETEST_AFTER_EXPLANATION
  -> answer outcome
  -> explanation_outcome row
  -> Diagnostic Engine updates explanationEffectiveness
```

## New Pilot-Scale Capabilities

- Weekly parent reports and report delivery state
- Retention estimates per concept
- Item statistics feeding QG ranking
- Content review workflow for ~200 APPROVED questions
- Production auth and billing status surfaces
- Observability event catalog and dashboard metrics

## Anti-Scope

- No microservice split
- No autonomous LLM agent calling engines freely
- No unchecked generated content
- No clinical diagnosis
- No global learned model retraining

## External Integrations

| Integration | MVP 2.0 role | Failure mode |
|---|---|---|
| Clerk | Production auth | Dev auth fallback only in local |
| Stripe or billing stub | Trial / subscription status | App still allows dev practice |
| Email provider | Parent reports | Store failed `report_delivery` and retry |
| PostHog | Product analytics | Log locally if missing |
| Sentry | Error monitoring | Console fallback |

## Success Criteria

- 10-50 pilot students can use the system for at least one week.
- Every student-visible math item is APPROVED.
- Every decision has a replayable rule version and input snapshot.
- Weekly report language separates observation from inference.
- Golden and CLI tests cover all new rule paths.
