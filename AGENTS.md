# AGENTS.md — Cogna / eduTeach

## Dual era (read this first)

| Era | Spec | Tracking | Status |
|---|---|---|---|
| **MVP 1.0** | [`/docs/mvp-1.0/`](./docs/mvp-1.0/) | [`/COGNA 1.0/`](./COGNA%201.0/) | **Complete / archive** — reference and hotfixes only |
| **MVP 2.0** | [`/docs/mvp-2.0/`](./docs/mvp-2.0/) | [`/COGNA 2.0/`](./COGNA%202.0/) | **Complete** — pilot shipped; maintenance only |
| **MVP 3.0** | [`/docs/mvp-3.0/`](./docs/mvp-3.0/) | [`/COGNA 3.0/`](./COGNA%203.0/) | **Complete** — engineering done; maintenance only |
| **MVP 4.0** | [`/docs/mvp-4.0/`](./docs/mvp-4.0/) | [`/COGNA 4.0/`](./COGNA%204.0/) | **Complete** — engineering done; maintenance only |
| **MVP 5.0** | [`/docs/mvp-5.0/`](./docs/mvp-5.0/) | [`/COGNA 5.0/`](./COGNA%205.0/) | **Active** — all new product work |

- **Do not implement from:** [`/COGNA/`](./COGNA/README.md) mature docs (future architecture only).
- **Do not implement from** `/docs/mvp-5.0/` until that era's README status is Canonical / Frozen **and** this table marks it **Active**.
- **Repo / GitHub ops:** [`COGNA 2.0/REPO_AND_GITHUB.md`](./COGNA%202.0/REPO_AND_GITHUB.md) (3.0/4.0/5.0 folders point here).

## MVP 5.0 — active source of truth

- **Spec:** `/docs/mvp-5.0/` for new work 
- **Build tracking:** `/COGNA 5.0/` 
- Prefer branch `feat/mvp-2.0-build` (see repo org doc)

### Mandatory tracking updates (MVP 5.0)

When you complete, skip, or discover work on Cogna MVP 5.0, **in the same turn** update:

1. [`COGNA 5.0/BUILD_PLAN.md`](./COGNA%205.0/BUILD_PLAN.md) — strikethrough finished tasks (`~~…~~`) 
2. [`COGNA 5.0/SKIPPED.md`](./COGNA%205.0/SKIPPED.md) — log intentional deferrals 
3. [`COGNA 5.0/BUILD_CARE.md`](./COGNA%205.0/BUILD_CARE.md) — add/check guardrails 
4. [`COGNA 5.0/README.md`](./COGNA%205.0/README.md) — keep status snapshot current 

Do not leave these stale after code or content changes.

## Completed eras (MVP 3.0 / 4.0)

- **MVP 3.0 / 4.0** engineering complete; specs and tracking frozen.
- Use only for maintenance, hotfixes, or reference.
- If hotfixing, update the same four files under the appropriate `/COGNA X.0/` folder and label the work with era tag.

## Planning eras (Future)

- Future eras will be documented under `/docs/mvp-X.0/` with tracking under `/COGNA X.0/`.
- When a new era is created, it starts as **Draft / Vision** status.
- When promoted to active implementation, update this table, freeze the era README, and apply the same four-file tracking discipline.

## MVP 1.0 — archive

- **Spec:** `/docs/mvp-1.0/` (frozen) 
- **Build tracking:** `/COGNA 1.0/` (historical) 
- Use only for archive reference, demo walkthrough, or explicit 1.0 hotfixes.
- If you must change 1.0 tracking for a hotfix, update the same four files under `/COGNA 1.0/` and label the work `mvp-1.0-archive`.

## Contracts reminder

- `LearningDecision`: `uiAction` + `learningIntent` + `contentStyle` + `parameters` 
- `uiAction` only: `SHOW_QUESTION` | `SHOW_EXPLANATION` | `SHOW_HINT` | `END_SESSION` | `SUGGEST_BREAK` 
- No legacy flat actions (`EASIER_QUESTION`, etc.) 
- Active-era extensions only as specified in `/docs/mvp-5.0/` today — never invent flat UI action aliases. Future eras may add intents/parameters only after that era is Canonical and Active.
- **No unchecked LLM math to students** (carries through 3.0–5.0).
