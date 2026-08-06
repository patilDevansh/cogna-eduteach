# Cogna MVP 1.0 — Report Generator

> Depends on [Shared Contracts](./README_MVP_CONTRACTS.md). Not on the per-answer hot path.

## Purpose

Turn structured learner data into clear summaries for student, parent, and internal audiences.

Must not invent facts or hide uncertainty.

---

## Triggers (only)

Contracts §13:

```text
SESSION_ENDED
DAILY_REPORT_JOB
WEEKLY_REPORT_JOB
PARENT_REQUESTED_REPORT
```

During answers, the Loop only writes evidence. Reports aggregate later.

---

## MVP Reports

### Student session summary

Questions attempted, accuracy, concept practiced, progress, one area to revisit, next recommended action (plain language).

### Parent summary

What was practiced, what improved, possible repeated mistake, revision suggestion, uncertainty note, one actionable suggestion.

### Internal diagnostic report

Evidence, mastery changes, diagnostic factors, decision trail, model versions.

Use external terminology (Contracts §18): Learner Profile, Learning Insights — not clinical “cognitive assessment” language.

---

## Input Example

```json
{
  "studentId": "student_104",
  "audience": "PARENT",
  "periodStart": "2026-07-10T08:00:00Z",
  "periodEnd": "2026-07-10T08:15:00Z",
  "questionsAttempted": 10,
  "correctAnswers": 7,
  "masteryChanges": {
    "one-step-equations": { "from": 0.46, "to": 0.54 }
  },
  "diagnosticFactors": [
    { "factorKey": "sign_handling", "confidence": 0.63 }
  ],
  "revisionItems": 1
}
```

---

## Parent Output Example

```json
{
  "summary": "Devansh practiced one-step equations and improved across the session.",
  "strengths": ["Solved direct one-step equations with less help."],
  "areasForSupport": ["Sign handling may still need reinforcement."],
  "nextStep": "Complete a short 3-question revision tomorrow.",
  "uncertainty": "The sign-error pattern is still being confirmed."
}
```

---

## Generation Method

Deterministic templates only in MVP:

```text
aggregate verified data
→ select approved insights
→ fill audience template
→ validate numbers and claims
→ store versioned report
→ render in app
```

---

## Observation vs Inference vs Recommendation

Reports must keep these distinct (Contracts / architecture safety):

- Observation: “7 of 10 correct”
- Inference: “sign handling may need practice”
- Recommendation: “complete a short revision set tomorrow”

---

## Validation

- Numbers match source data
- Inferences link to evidence
- Confidence language matches diagnostic confidence
- No clinical terminology, permanent labels, shame, or ranks
- Correct student and period
- Parent permissions checked

---

## Interface

```ts
interface ReportRequest {
  studentId: string;
  audience: "STUDENT" | "PARENT" | "INTERNAL";
  periodStart: Date;
  periodEnd: Date;
  trigger:
    | "SESSION_ENDED"
    | "DAILY_REPORT_JOB"
    | "WEEKLY_REPORT_JOB"
    | "PARENT_REQUESTED_REPORT";
}

interface ReportResult {
  structuredData: Record<string, unknown>;
  renderedText: string;
  reportVersion: string;
}
```

---

## Failure Handling

Narrative/template failure → deterministic metrics-only template. Insufficient data → say more evidence is needed; no strong conclusions.

---

## Acceptance Criteria

- Never invoked from per-answer path
- Works without LLM
- Accurate numbers; uncertainty visible
- Parent report understandable in under one minute
- Student tone non-judgmental
- Internal report preserves evidence and versions
- Role-protected

---

## Simplest Definition

> **The MVP Report Generator converts verified learning data into simple, honest, audience-specific summaries after the session — not after every answer.**
