# HTTP scenario tests (CI-facing)

Stable end-to-end journeys live in [`scripts/cogna-cli/scenarios/`](../../../scripts/cogna-cli/scenarios/).  
This folder documents how to run them in CI; scenarios are **not** duplicated here.

## When to use

| Layer | Command | Requires |
|---|---|---|
| Golden (always) | `pnpm test:golden` | Node only |
| CLI scenarios | `pnpm test:scenario:all` | API :3001 + Postgres + seed |
| UI smoke | `pnpm test:smoke:ui` | API + Web :3000 |

## CI policy (MVP 1.0)

1. **Block merge on golden failures** — no Docker required.
2. **Run scenarios when API+DB are available** — e.g. `docker compose --profile test up -d postgres`, seed, start API, then `pnpm test:scenario:all`.
3. **UI smoke** — optional pre-pilot or nightly; thin route/API checks only.

## Scenario map

| Script | Golden refs |
|---|---|
| `baseline-12-slot` | G30, G30b |
| `idempotent-retry` | G20 |
| `targeting-explanation-retest` | G10, G11 |
| `session-end-summary` | G41, G42 |
| `revision-queue-proposal` | recommendation/revision journey |

See [`COGNA/CLI_DEVELOPMENT_TESTING.md`](../../../COGNA/CLI_DEVELOPMENT_TESTING.md) for full pyramid guidance.
