# MVP 1.0 — Architecture

> Canonical. Supersedes all prior MVP architecture drafts.

## Purpose

Cogna MVP 1.0 is a student-first, parent-bought learning companion for Grade 8 CBSE Mathematics, scoped to the **Linear Equations Learning Unit** defined in [Content Spec](./README_CONTENT_SPEC.md).

Hypothesis:

> Observe answers → build evidence-based learner-state estimates → adapt the next action → improve learning.

Not a chatbot, LMS, video platform, or school SIS.

## Actors

| Role | Responsibility |
|---|---|
| Parent | Buyer; creates account; creates student profiles; views reports |
| Student | Primary user; practices; does not own billing |
| System | Learning Loop + engines |

## Modules

| Module | MVP role |
|---|---|
| Learning Loop | Orchestration, grading, staged durability |
| Question Generator | Select reviewed questions |
| Diagnostic Engine | Mastery / misconception / calibration estimates |
| Decision Engine | Emit `LearningDecision` only |
| Explanation Engine | Approved text + hints |
| Recommendation Engine | Propose revision items |
| Revision Service | Write/dedupe/status queue |
| Report Generator | Session/parent summaries off hot path |

Ownership details: [Engine Ownership](./README_ENGINE_OWNERSHIP.md).

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind
- Backend: NestJS modular monolith, TypeScript, REST
- DB: PostgreSQL + Prisma
- Auth: Supabase Auth or Clerk (parent + student roles)
- Deploy: Vercel + Railway/Render/Fly; Sentry; PostHog
- AI: optional polish only; never unchecked math to students

## Core loop

```text
SESSION_STARTED (BASELINE or ADAPTIVE)
→ Decision → content (question / explanation / hint)
→ student event
→ Learning Loop staged processing (see durability doc)
→ Diagnostic → profile
→ Decision → next content
→ SESSION_ENDED → Recommendation + Report
```

## Safety

- No clinical / IQ / ADHD / learning-style labels
- External terms: Learner Profile, Learning Insights, Learning-State Model
- Raw events immutable; inferences versioned
- Only `reviewStatus: APPROVED` content reaches students

## Anti-scope

Multiple subjects, full syllabus, teacher/school dashboards, open chat, video/voice gen, handwriting, webcam, leaderboards, live class, clinical diagnosis, real-time global ML retraining, microservices, general CAS grading.
