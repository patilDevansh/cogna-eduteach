# MVP 4.0 — Architecture

> **Delta from MVP 3.0:** Adds Curriculum Graph, Planning Horizon Service, and unit-scoped content providers. Still a modular monolith; still not full multi-modal agentic.

## Principle

```text
Student action
  -> evidence
  -> Diagnostic (per concept, unit-aware)
  -> Learner Profile (multi-unit)
  -> Planning Horizon Service (recommended unit focus)
  -> Decision Engine (unit + concept intents)
  -> content provider (unit bank, APPROVED)
  -> reports / revision across units
```

## New modules

| Module | Responsibility |
|---|---|
| Curriculum Graph Service | Units, concepts, cross-unit prerequisites, unlock rules |
| Planning Horizon Service | Multi-week plan: which unit/concepts to emphasize |
| Unit Content Router | Selects bank by `unitId` |
| Teacher Visibility (optional) | Read-only unit progress for coach accounts |

Carry: Diagnostic, Decision, QG, Explanation, Draft/Validation/Review, Experiments, Reports, Observability.

## Runtime topology

Unchanged deploy shape (web + api + postgres + jobs). Curriculum and plans are data, not new services.

## Anti-scope

- No open-ended multi-agent debate on hot path
- No multi-subject ontology yet
- No modality orchestrator (MVP 5.0)
