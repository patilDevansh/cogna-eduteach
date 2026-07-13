# AGENTS.md — Cogna / eduTeach

## MVP 1.0 source of truth

- **Spec:** `/docs/mvp-1.0/` only  
- **Build tracking:** `/COGNA 1.0/`  
- **Do not implement from:** `/COGNA/` mature docs (future architecture only)

## Mandatory tracking updates (every session)

When you complete, skip, or discover work on Cogna MVP 1.0, **in the same turn** update:

1. [`COGNA 1.0/BUILD_PLAN_7_DAY.md`](./COGNA%201.0/BUILD_PLAN_7_DAY.md) — strikethrough finished tasks (`~~…~~`)  
2. [`COGNA 1.0/SKIPPED.md`](./COGNA%201.0/SKIPPED.md) — log intentional deferrals  
3. [`COGNA 1.0/BUILD_CARE.md`](./COGNA%201.0/BUILD_CARE.md) — add/check guardrails  
4. [`COGNA 1.0/README.md`](./COGNA%201.0/README.md) — keep status snapshot current  

Do not leave these stale after code or content changes.

## Contracts reminder

- `LearningDecision`: `uiAction` + `learningIntent` + `contentStyle` + `parameters`  
- `uiAction` only: `SHOW_QUESTION` | `SHOW_EXPLANATION` | `SHOW_HINT` | `END_SESSION` | `SUGGEST_BREAK`  
- No legacy flat actions (`EASIER_QUESTION`, etc.)
