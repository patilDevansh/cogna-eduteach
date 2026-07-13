# Cogna MVP 4.0 — Build Care

## Non-Negotiables

- [ ] Do not implement until Canonical + AGENTS promotion
- [ ] Never rename Linear Equations concept IDs
- [ ] Only APPROVED content; LLM off hot path
- [ ] uiAction + learningIntent contract locked
- [ ] Workload caps across units
- [ ] G/R/S regression required with U##

## Pitfalls

- Breadth before second-unit content quality
- Unlocking units on weak evidence
- Silent cross-unit question substitution
- Teacher write access creep
- Treating vision docs as frozen

## Enforced in P0/P1 Documentation Pass (2026-07-13)

- [x] Unit catalog: Linear Equations frozen forever; second unit required for Canonical (illustrative ID marked)
- [x] Core vs optional concepts defined for Linear Equations (all 11 count as core/prereq); second unit must define before Canonical
- [x] Teacher API allowlist: GET-only endpoints documented; no POST/PUT/DELETE for teacher_coach role
- [x] Planning horizon worked example U16 added with exact numbers (learningNeed calculation, horizon output, decision interaction)
- [x] Cross-unit retention clarified: retention-rules-v2 is unit-agnostic per conceptId; no unit-boundary penalty
- [x] Pilot plan updated: multi-unit cohort depends on MVP 3.0 exit; readiness validation goal added
