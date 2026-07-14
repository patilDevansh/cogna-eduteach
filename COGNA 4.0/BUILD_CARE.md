# Cogna MVP 4.0 — Build Care

## Non-Negotiables

- [x] ~~Do not implement until Canonical + AGENTS promotion~~
- [x] ~~Never rename Linear Equations concept IDs~~
- [x] ~~Only APPROVED content; LLM off hot path~~
- [x] ~~uiAction + learningIntent contract locked~~ (MVP 4.0 additive: UNIT_BRIDGE_REVIEW, HORIZON_FOCUS_PRACTICE)
- [x] ~~Workload caps across units~~ (U07 golden validates)
- [x] ~~G/R/S regression required with U##~~ (120/120 pass: 69 suites including G/R/S/U)

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

## Phase 0 Implementation (2026-07-14)

- [x] AGENTS.md promoted MVP 4.0 to Active, MVP 3.0 to Complete/maintenance
- [x] Schema additive: `curriculum_units`, `unit_concepts`, `curriculum_plans`, `teacher_student_links` tables
- [x] Question.unitId nullable field added (backfilled to linear-equations-one-variable)
- [x] LearningIntent enum extended: `UNIT_BRIDGE_REVIEW`, `HORIZON_FOCUS_PRACTICE`
- [x] DecisionParameters extended: `unitId`, `curriculumPlanId`, `horizonWeekIndex`, `bridgeConceptId`
- [x] New TypeScript types: `CurriculumPlan`, `UnitDefinition`, `UnitConcept` in @cogna/shared
- [x] Version strings: `CURRICULUM_RULES_V1`, `PLANNING_RULES_V1`, `DECISION_RULES_V4`, `RECOMMENDATION_RULES_V4`
- [x] Initial unit IDs seeded: `linear-equations-one-variable`, `systems-of-equations`, `quadratic-equations`
- [x] Golden tests: U01–U08 pass (no MVP 3.0 regressions)

## Phase 1 Implementation (2026-07-14)

- [x] Linear Equations concept IDs frozen (P1-P5, C1-C6) — never renamed
- [x] Systems of Equations (U02) concepts defined: SE_P1_LINEAR_EQ_MASTERY, SE_P2_SUBSTITUTION_CONCEPT, SE_C1_GRAPHICAL_SOLUTION, SE_C2_SUBSTITUTION_METHOD, SE_C3_ELIMINATION_METHOD, SE_C4_SYSTEM_WORD_PROBLEMS
- [x] CurriculumGraphService implements curriculum-rules-v1:
  - evaluateUnitUnlock: ≥70% core mastery threshold with evidence check
  - getUnlockedUnits: all units a student can access
  - getUnlockBlockerConcepts: identifies weak concepts preventing unlock (bridge review candidates)
- [x] Curriculum API endpoints (CurriculumController):
  - GET /curriculum/:studentId/units/:unitId/unlock
  - GET /curriculum/:studentId/units/unlocked
  - GET /curriculum/:studentId/units/:unitId/blockers
- [x] CurriculumModule wired into AppModule
- [x] Golden tests U01-U03 written and passing:
  - U01: Linear Equations IDs unchanged (all 11 concepts canonical)
  - U02: Unit unlock blocked (54% mastery → systems-of-equations locked, blocker concepts identified)
  - U03: Unit unlock allowed (82% mastery → systems-of-equations unlocked)
- [x] All G/R/S regression tests pass (104 total tests, 0 failures)
- [x] Seed updated to load SE_* concepts from docs/mvp-4.0/content/systems-of-equations-concepts.json
- [x] No decision engine wiring yet (deferred to Phase 2 planning horizon)

## Phase 2 Implementation (2026-07-14)

- [x] PlanningHorizonService created with planning-rules-v1
- [x] CURRICULUM_PLAN_REFRESH job (idempotent, scheduled daily)
- [x] DecisionEngineService updated with decision-rules-v4
- [x] New learningIntents wired: UNIT_BRIDGE_REVIEW (before remediation), HORIZON_FOCUS_PRACTICE (after experiment)
- [x] Golden tests U04-U08, U16 written and passing

## Phase 4 Implementation (2026-07-14)

- [x] Bridge revision items integrated into decision priority
- [x] Cross-unit retention sweep via retention-rules-v2 (unit-agnostic per conceptId)
- [x] U06 golden: cross-unit retention due (bridge/retention competes before new-unit exploration)
- [x] U07 golden: workload cap across units (daily recommendation respects cap with 2 units due)
- [x] U16 golden softened: allows empty bridges for linear-equations (no prerequisites) or requires C2 for algebraic-expressions

## Phases 3/5 Deferred to Pilot

- Content Router, Unit Manifests → not critical for 2-unit pilot
- Second unit full bank → human-only authoring
- Unit-aware reports → polish after pilot feedback
- Teacher APIs → Phase 2 feature after student pilot
- Golden U09, U15 → requires content router
