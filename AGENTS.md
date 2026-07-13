# AGENTS.md — Cogna / eduTeach

## Dual era (read this first)

| Era | Spec | Tracking | Status |
|---|---|---|---|
| **MVP 1.0** | [`/docs/mvp-1.0/`](./docs/mvp-1.0/) | [`/COGNA 1.0/`](./COGNA%201.0/) | **Complete / archive** — reference and hotfixes only |
| **MVP 2.0** | [`/docs/mvp-2.0/`](./docs/mvp-2.0/) | [`/COGNA 2.0/`](./COGNA%202.0/) | **Active** — all new product work |

- **Do not implement from:** [`/COGNA/`](./COGNA/README.md) mature docs (future architecture only).
- **Repo / GitHub ops:** [`COGNA 2.0/REPO_AND_GITHUB.md`](./COGNA%202.0/REPO_AND_GITHUB.md)

## MVP 2.0 — active source of truth

- **Spec:** `/docs/mvp-2.0/` only for new work  
- **Build tracking:** `/COGNA 2.0/`  
- Prefer branch `feat/mvp-2.0-build` (see repo org doc)

### Mandatory tracking updates (MVP 2.0)

When you complete, skip, or discover work on Cogna MVP 2.0, **in the same turn** update:

1. [`COGNA 2.0/BUILD_PLAN.md`](./COGNA%202.0/BUILD_PLAN.md) — strikethrough finished tasks (`~~…~~`)  
2. [`COGNA 2.0/SKIPPED.md`](./COGNA%202.0/SKIPPED.md) — log intentional deferrals  
3. [`COGNA 2.0/BUILD_CARE.md`](./COGNA%202.0/BUILD_CARE.md) — add/check guardrails  
4. [`COGNA 2.0/README.md`](./COGNA%202.0/README.md) — keep status snapshot current  

Do not leave these stale after code or content changes.

## MVP 1.0 — archive

- **Spec:** `/docs/mvp-1.0/` (frozen)  
- **Build tracking:** `/COGNA 1.0/` (historical)  
- Use only for archive reference, demo walkthrough, or explicit 1.0 hotfixes.
- If you must change 1.0 tracking for a hotfix, update the same four files under `/COGNA 1.0/` and label the work `mvp-1.0-archive`.

## Contracts reminder

- `LearningDecision`: `uiAction` + `learningIntent` + `contentStyle` + `parameters`  
- `uiAction` only: `SHOW_QUESTION` | `SHOW_EXPLANATION` | `SHOW_HINT` | `END_SESSION` | `SUGGEST_BREAK`  
- No legacy flat actions (`EASIER_QUESTION`, etc.)  
- MVP 2.0 may extend intents/parameters **only** as specified in `/docs/mvp-2.0/` — never invent flat UI action aliases.
