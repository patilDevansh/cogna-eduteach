# MVP 2.0 — Engine Ownership

> Ownership boundaries prevent the "agentic" system from becoming chaotic. Engines may become smarter, but each concern still has one owner.

## Core Rule

Engines do not call each other directly. The Learning Loop and scheduled jobs orchestrate flow.

## Ownership Matrix

| Concern | Owner | Must not |
|---|---|---|
| Event validation and idempotency | Learning Loop | Infer diagnosis |
| Attempt grading | Grader | Decide next action |
| Mastery updates | Diagnostic Engine | Select next question |
| Misconception confidence | Diagnostic Engine | Write revision queue |
| Confidence calibration | Diagnostic Engine | Show labels to student |
| Retention estimate | Diagnostic Engine | Schedule workload alone |
| Learning velocity | Diagnostic Engine | Promote concept alone |
| Explanation effectiveness | Diagnostic Engine | Rewrite explanations |
| Live next action | Decision Engine | Fetch content |
| Content selection | Question Generator | Change learner profile |
| Explanation template selection | Explanation Engine | Decide whether explanation is needed |
| Daily/weekly revision proposals | Recommendation Engine | Mutate attempts |
| Revision queue write/dedupe/status | Revision Service | Infer misconceptions |
| Session/weekly reports | Report Generator | Change decisions |
| Content approval | Content Review Service | Auto-approve generated math |
| Metrics and alerts | Observability Service | Own product logic |

## Agentic Mapping

If using "agent" language, map it to bounded engines:

| Product metaphor | Implementation unit |
|---|---|
| Main brain | Learning Loop + Learner Profile + Decision Engine |
| Diagnostic agent | Diagnostic Engine |
| Teaching agent | Explanation Engine + Question Generator |
| Revision agent | Recommendation Engine + Revision Service |
| Parent communication agent | Report Generator |
| Safety agent | Content Review Service + contract tests |

An LLM may assist a bounded engine later, but it does not own the brain.

## Cross-Cutting Flows

### Due Revision

```text
Revision Service exposes due item
Decision Engine sees dueRevision
Decision emits SHOW_QUESTION + EXECUTE_DUE_REVISION
QG selects appropriate item
Learning Loop marks in-progress / completed
Diagnostic records revision outcome
```

### Weak Evidence

```text
Diagnostic confidence below threshold
  -> Decision must choose STANDARD_PRACTICE or REVIEW_PREREQUISITE
  -> Report may say "still gathering evidence"
  -> Student UI must not display internal labels
```

### Parent Report

```text
Report Generator reads profile/report inputs
  -> observation: "12 questions completed"
  -> inference: "possible sign-handling gap"
  -> uncertainty: "still being confirmed"
```

## Future-Agent Rule

Any future agent must declare:

- Inputs it can read
- Outputs it can write
- Version string
- Abstention threshold
- Test cases
- Human review gate if it creates student-facing content
