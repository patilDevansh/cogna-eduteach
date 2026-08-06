# Cogna — Documentation Map

## Repo & GitHub organization

Branches, PR checks, labels, milestones, and folder authority:

→ [`COGNA 2.0/REPO_AND_GITHUB.md`](../COGNA%202.0/REPO_AND_GITHUB.md)

Also see [`AGENTS.md`](../AGENTS.md) (dual era: 1.0 archive / 2.0 active).

## Canonical MVP implementation specs

**MVP 1.0 (frozen / archive):**

```text
/docs/mvp-1.0/
```

Start: [`docs/mvp-1.0/README.md`](../docs/mvp-1.0/README.md)

Especially: [`docs/mvp-1.0/README_SHARED_CONTRACTS.md`](../docs/mvp-1.0/README_SHARED_CONTRACTS.md)

**MVP 2.0 (active spec for new work):**

```text
/docs/mvp-2.0/
```

Start: [`docs/mvp-2.0/README.md`](../docs/mvp-2.0/README.md)

## MVP 1.0 build tracking (archive)

```text
/COGNA 1.0/
```

- [BUILD_PLAN_7_DAY.md](../COGNA%201.0/BUILD_PLAN_7_DAY.md) — day tasks (historical)
- [SKIPPED.md](../COGNA%201.0/SKIPPED.md) — deferred items
- [BUILD_CARE.md](../COGNA%201.0/BUILD_CARE.md) — guardrails

Use only for archive reference or explicit 1.0 hotfixes (see `/AGENTS.md`).

## MVP 2.0 build tracking (active)

```text
/COGNA 2.0/
```

- [BUILD_PLAN.md](../COGNA%202.0/BUILD_PLAN.md) — phase plan
- [SKIPPED.md](../COGNA%202.0/SKIPPED.md) — MVP 2.0 deferrals
- [BUILD_CARE.md](../COGNA%202.0/BUILD_CARE.md) — MVP 2.0 guardrails
- [REPO_AND_GITHUB.md](../COGNA%202.0/REPO_AND_GITHUB.md) — branches, PRs, labels

**Always update the active tracking set when doing MVP 2.0 work** (see `/AGENTS.md`).

## This `COGNA/` folder

> **Future architecture only. Do not use as the MVP implementation specification.**

Mature engine essays below may describe long-term vision. If they conflict with `/docs/mvp-2.0/` (active) or `/docs/mvp-1.0/` (archive), **the MVP docs win** for that era.

## Manager / live-agentic visibility (plain English)

| File | Purpose |
|---|---|
| [`HOW_THE_PRODUCT_WORKS.md`](./HOW_THE_PRODUCT_WORKS.md) | How kids are assessed and what they see |
| [`LANGUAGE_AND_VOICE.md`](./LANGUAGE_AND_VOICE.md) | Child-safe / parent-letter voice (from testUI-claude) |
| [`PRIVACY_AND_DATA.md`](./PRIVACY_AND_DATA.md) | Minors, DPDP, OpenAI prompts without PII |
| [`LIVE_AGENTIC_PLAN.md`](./LIVE_AGENTIC_PLAN.md) | Stages, flags, flip criteria, ops metrics |
| [`QUESTION_BANK_ATLAS.md`](./QUESTION_BANK_ATLAS.md) | Question bank map and sample stems |
| [`DEMO_STUDENTS_AND_TRAINING.md`](./DEMO_STUDENTS_AND_TRAINING.md) | Demo accounts and what “training” means |

| File | Status |
|---|---|
| `README_LEARNING_LOOP.md` | Future architecture only |
| `README_DIAGNOSTIC_ENGINE.md` | Future architecture only |
| `README_DECISION_ENGINE.md` | Future architecture only |
| `README_QUESTION_GENERATOR.md` | Future architecture only |
| `README_EXPLANATION_ENGINE.md` | Future architecture only |
| `README_RECOMMENDATION_ENGINE.md` | Future architecture only |
| `README_REPORT_GENERATOR.md` | Future architecture only |
| `PRODUCT_VISION.md` | Future product vision bridge — agentic Cogna roadmap |
| `README_MVP_ARCHITECTURE.md` | Superseded stub |
| `COGNA MVP- 1.0/` | **Superseded draft** → use `/docs/mvp-1.0/` |
| [`CLI_DEVELOPMENT_TESTING.md`](./CLI_DEVELOPMENT_TESTING.md) | **Engineering guide** — CLI/HTTP scenario testing parallel to UI (not MVP spec) |
