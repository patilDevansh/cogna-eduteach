# Cogna — Repo & GitHub Organization (MVP 2.0)

> Short ops guide for branches, PRs, and folder authority.  
> Does **not** replace product specs under `/docs/mvp-2.0/`.

## Folder authority

| Path | Role | Rule |
|---|---|---|
| `/docs/mvp-1.0/` | MVP 1.0 **frozen** spec | Archive / reference only. Do not extend for new product work. Bugfix patches to 1.0 behavior must cite this folder. |
| `/COGNA 1.0/` | MVP 1.0 **archive** tracking | Historical build plan / skipped / care. Do not use as the active execution board. |
| `/docs/mvp-2.0/` | MVP 2.0 **active** spec | Source of truth for new implementation. |
| `/COGNA 2.0/` | MVP 2.0 **active** tracking | Update on every complete / skip / pitfall (see `AGENTS.md`). |
| `/COGNA/` | **Future architecture only** | Mature essays and vision. Never treat as MVP implementation spec. If conflict with `/docs/mvp-2.0/`, the MVP 2.0 docs win. |
| `/apps/`, `/packages/`, `/scripts/` | Shared codebase | Evolves under MVP 2.0 rules while preserving 1.0 contract locks until explicitly superseded in `/docs/mvp-2.0/`. |

## Branch strategy

1. **Tag `mvp-1.0` when the tree is clean**  
   Create the annotated tag only from a committed snapshot that represents the MVP 1.0 demo line (no mixed 1.0/2.0 WIP). See [Tag `mvp-1.0` (deferred while dirty)](#tag-mvp-10-deferred-while-dirty).

2. **Long-lived integration branch: `feat/mvp-2.0-build`**  
   All MVP 2.0 work merges here first (or opens PRs into it). Treat as the active build line after 1.0 is tagged/archived.

3. **Short-lived feature branches**  
   Name from the work unit, e.g.:
   - `feat/mvp-2.0-content-pipeline`
   - `feat/mvp-2.0-retention-v2`
   - `fix/mvp-2.0-<bug>`
   - `chore/mvp-2.0-repo-org`

   Prefer branching from `feat/mvp-2.0-build` (or from `mvp-1.0` tag once it exists for pure 1.0 hotfix work).

4. **Hotfixes to frozen 1.0**  
   Branch from the `mvp-1.0` tag → PR → cherry-pick or merge carefully into `feat/mvp-2.0-build` if still needed.

## PR types

Use the PR title prefix and fill [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md).

| Type | Prefix | When |
|---|---|---|
| Spec | `docs:` | Changes under `/docs/mvp-2.0/` (or clarifying 1.0 archive notes) |
| Feature | `feat:` | Product behavior for MVP 2.0 |
| Fix | `fix:` | Bugs (state whether 1.0 archive vs 2.0 active) |
| Test | `test:` | Golden / CLI / UI / content checks only |
| Chore | `chore:` | Repo org, tooling, non-product docs |

### Required checks (by change surface)

Map ownership in the PR template. Run what applies before merge:

| Check | Command / location | Required when |
|---|---|---|
| **Golden** | `pnpm test:golden` (`apps/api/test/golden/`) | Decision, diagnostic, durability, contracts, learning-loop |
| **CLI scenarios** | `pnpm test:scenario:all` (`scripts/cogna-cli/`) | Session / event / targeting / skip / revision HTTP flows |
| **UI smoke** | `pnpm test:smoke:ui` | Student/parent UI flows that the script covers |
| **Content** | Manifest + review checklist under `docs/mvp-2.0/content/` (and 1.0 checklist if touching frozen bank) | Question bank, explanations, review workflow |

PRs that only touch tracking (`COGNA 2.0/*.md`) or repo-org docs may skip runtime checks; note that in the template.

## Suggested labels

| Label | Use |
|---|---|
| `mvp-1.0-archive` | Touching frozen 1.0 spec/tracking or 1.0-only hotfixes |
| `mvp-2.0` | Active 2.0 work |
| `spec` | `/docs/mvp-*` |
| `tracking` | `/COGNA 1.0/` or `/COGNA 2.0/` |
| `contracts` | Shared `LearningDecision` / events / durability |
| `content` | Question bank / review pipeline |
| `golden` / `cli` / `ui` | Test-surface ownership |
| `do-not-merge` | Blocked on spec or content review |

## Suggested milestones

| Milestone | Intent |
|---|---|
| `MVP 1.0 — archived` | Tag + any remaining 1.0 hotfixes |
| `MVP 2.0 — Phase 0` | Spec freeze / migration prep |
| `MVP 2.0 — content & review` | Phase 1 |
| `MVP 2.0 — diagnostic v2` | Phase 2 |
| `MVP 2.0 — personalization` | Phase 3 |
| `MVP 2.0 — pilot ready` | Reports, auth, observability, retention as defined in build plan |

Align phase names with [`BUILD_PLAN.md`](./BUILD_PLAN.md).

## What not to do

- Do **not** implement new features from `/COGNA/` mature READMEs.
- Do **not** rewrite or extend `/docs/mvp-1.0/` as if it were the active product roadmap.
- Do **not** leave `/COGNA 2.0/` tracking stale after completing or skipping work.
- Do **not** use legacy flat decision actions (`EASIER_QUESTION`, `HARDER_QUESTION`, etc.) as the UI action field.
- Do **not** ship non-`APPROVED` questions to students (except explicit local-dev paths allowed by spec).
- Do **not** force-push shared branches (`main`, `feat/mvp-2.0-build`) unless explicitly agreed.
- Do **not** create tag `mvp-1.0` while the working tree has mixed uncommitted 1.0 + 2.0 changes — commit/clean first.

## Tag `mvp-1.0` (deferred while dirty)

Run only when `git status` is clean (or you intentionally commit a pure 1.0 snapshot first):

```bash
# Confirm clean tree and intended commit
git status
git log -1 --oneline

# Annotated tag on that commit
git tag -a mvp-1.0 -m "Cogna MVP 1.0 demo baseline"

# Push tag when ready (explicit)
git push origin mvp-1.0
```

If you are mid-migration with mixed WIP, finish or stash non-1.0 work, commit the 1.0 baseline, tag that commit, then continue 2.0 on `feat/mvp-2.0-build`.
