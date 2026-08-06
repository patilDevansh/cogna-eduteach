# Cogna Product Vision — Agentic Cognitive Learning Platform

> This is a future-facing product vision bridge. Implementation specs live in `/docs/mvp-*`.

## North Star

Cogna should become a diagnosis-driven learning platform where a central learner brain coordinates specialist engines to tailor questions, explanations, revision, reports, and eventually teaching modules for each student.

The goal is not "a chatbot tutor." The goal is:

```text
Every interaction improves the learner model.
Every learner model update improves the next teaching decision.
Every teaching decision is explainable, safe, and measurable.
```

## Agentic Interpretation

Use "agentic" to mean **bounded specialist engines connected to a main orchestrator**, not open-ended LLM agents.

| Product language | Engineering language |
|---|---|
| Main brain | Learning Loop + Learner Profile + Decision Engine |
| Diagnostic agent | Diagnostic Engine |
| Teaching agent | Question Generator + Explanation Engine |
| Revision agent | Recommendation Engine + Revision Service |
| Parent communication agent | Report Generator |
| Safety agent | Content Review + tests + APPROVED gates |

## Final Product Experience

For the student:

- question path adapts to mastery and misconceptions
- explanations adapt to error pattern, confidence, hint use, and recovery
- modules and future animations adapt to what the learner needs
- breaks and session length adapt to fatigue/engagement signals
- revision appears when retention is likely to decay

For the parent:

- reports explain what was observed
- reports separate confidence from uncertainty
- the next recommended practice is clear and short
- long-term trends become visible without diagnostic jargon

For the system:

- every event is evidence
- every inference is versioned
- every decision is replayable
- every content item is reviewed before student use

## Diagnostic Mind Layers

```text
Evidence layer:
  answers, time, idle, hints, skips, confidence, changes

Concept layer:
  mastery, prerequisites, misconceptions, transfer

Behavior layer:
  calibration, hesitation, hint reliance, error recovery

Session layer:
  fatigue, engagement pattern, revision readiness

Narrative layer:
  student copy, parent insights, uncertainty language
```

## Roadmap to Full Agentic Software

| Version | Role | Spec | Tracking |
|---|---|---|---|
| MVP 1.0 | Working brain stem: rule-based loop and reports | [`/docs/mvp-1.0/`](../docs/mvp-1.0/README.md) | [`/COGNA 1.0/`](../COGNA%201.0/) |
| MVP 2.0 | Pilot-ready personalization: full content, retention, weekly reports, observability | [`/docs/mvp-2.0/`](../docs/mvp-2.0/README.md) | [`/COGNA 2.0/`](../COGNA%202.0/) |
| MVP 3.0 | LLM-assisted drafting and candidate scoring under validation | [`/docs/mvp-3.0/`](../docs/mvp-3.0/README.md) | [`/COGNA 3.0/`](../COGNA%203.0/) |
| MVP 4.0 | Multi-unit curriculum and longer planning horizon | [`/docs/mvp-4.0/`](../docs/mvp-4.0/README.md) | [`/COGNA 4.0/`](../COGNA%204.0/) |
| MVP 5.0 | Full agentic platform: multi-subject, learned policies, multi-modal teaching | [`/docs/mvp-5.0/`](../docs/mvp-5.0/README.md) | [`/COGNA 5.0/`](../COGNA%205.0/) |

Implementation authority: **MVP 2.0 is active**. MVP 3.0–5.0 docs are **Draft / Planning or Vision** until promoted (see [`/AGENTS.md`](../AGENTS.md)).

## Guardrails

- No unchecked LLM math to students
- No clinical labels
- No permanent claims from weak evidence
- No engine without ownership boundaries
- No personalized action without traceable evidence
