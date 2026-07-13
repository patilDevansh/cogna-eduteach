# MVP 4.0 — Content Spec

> **Delta from MVP 3.0:** Multiple units. Linear Equations IDs **frozen forever**. New units introduce new concept ID namespaces.

## Unit catalog (draft)

**Freeze policy:** Linear Equations is **frozen forever** (concept IDs from MVP 1–3 never change). A **second unit** must be selected and frozen before Canonical promotion. A third unit is optional / stretch for pilot.

| unitId | Title | Prerequisite units | Status | Canonical requirement |
|---|---|---|---|---|
| `linear-equations-one-variable` | Linear equations in one variable | — | **Frozen** (MVP 1–3) | Required |
| `algebraic-expressions-grade8` | Algebraic expressions | linear-equations-one-variable (soft) | Draft / illustrative | **Second unit required for Canonical** (this ID or replacement must be frozen) |
| `linear-equations-two-variable-intro` | Introduction to two-variable ideas | linear-equations-one-variable | Draft / illustrative | Optional / stretch |
| `geometry-triangles-basics` | Triangles basics | — (parallel track) | Draft / lower priority | Optional / stretch |

**Canonical gate:** Before MVP 4.0 promotion to Canonical, one additional unit beyond Linear Equations must be selected, concept IDs frozen, and bank targets established. The second unit ID above (`algebraic-expressions-grade8`) is **illustrative**; the final choice may differ, but the requirement is firm.

## Linear Equations concepts (KEEP)

`P1_INTEGER_ADD_SUB` … `C6_SIMPLE_WORD_PROBLEMS` — unchanged. See [`docs/mvp-2.0/README_CONTENT_SPEC.md`](../mvp-2.0/README_CONTENT_SPEC.md).

## New unit concept ID convention

```text
{UNIT_SHORT}_{ROLE}{N}_{SLUG}

Examples (illustrative, not frozen):
  AE_P1_LIKE_TERMS
  AE_C1_SIMPLIFY_EXPRESSIONS
  TVI_C1_ORDERED_PAIRS
```

Do not collide with Linear Equations IDs. Do not reuse aliases banned in MVP 2.0.

## Bank targets (stub)

| Unit | Target APPROVED (vision) |
|---|---:|
| linear-equations-one-variable | ≥ 280 (from MVP 3.0) |
| algebraic-expressions-grade8 | ≥ 120 |
| linear-equations-two-variable-intro | ≥ 80 |

## Misconceptions

Per-unit taxonomies; cross-unit reuse only when pattern truly shared (document explicitly). No runtime invention.

---

## Core vs optional concepts (unlock rule)

For each unit, concepts are classified as **core** or **optional** for the ≥70% unlock threshold:

**Linear Equations (frozen):**

| Concept ID | Classification | Notes |
|---|---|---|
| `P1_INTEGER_ADD_SUB` | PREREQ / core equivalent | Counts toward unlock threshold |
| `P2_NEGATIVE_OPS` | PREREQ / core equivalent | Counts toward unlock threshold |
| `P3_VARIABLES_CONSTANTS` | PREREQ / core equivalent | Counts toward unlock threshold |
| `P4_SIMPLE_EXPRESSIONS` | PREREQ / core equivalent | Counts toward unlock threshold |
| `P5_EQUALITY_BALANCE` | PREREQ / core equivalent | Counts toward unlock threshold |
| `C1_ONE_STEP_ADDITION` | CORE | Required for unlock calculation |
| `C2_ONE_STEP_SUBTRACTION` | CORE | Required for unlock calculation |
| `C3_ONE_STEP_MULTIPLICATION` | CORE | Required for unlock calculation |
| `C4_ONE_STEP_DIVISION` | CORE | Required for unlock calculation |
| `C5_TWO_STEP_EQUATIONS` | CORE | Required for unlock calculation |
| `C6_SIMPLE_WORD_PROBLEMS` | CORE | Required for unlock calculation |

All 11 Linear Equations concepts count as core (or core-equivalent prereqs) for unlock purposes.

**Second unit (TBD before Canonical):**

The frozen second unit's Content Spec must define which concepts are core vs optional. Core concepts must represent the non-negotiable mastery threshold for progression; optional concepts are enrichment that does not block subsequent units.

**Unlock rule reminder:** A unit unlocks when ≥70% of the **prerequisite unit's core concepts** reach mastery threshold with minimum evidence. Optional concepts do not block unlock.
