# MVP 2.0 — Demo Walkthrough

> ~10 minute local pilot demo. Requires `pnpm dev` and seeded DB.

## Setup

```bash
pnpm install
pnpm db:push && pnpm db:seed
ALLOW_PENDING_REVIEW_QUESTIONS=true pnpm dev
```

Fast regression (no browser):

```bash
pnpm test:fast
```

## Student flow (wrong + right answers)

1. Open http://localhost:3000/student/login
2. Click **Use demo code** (`demo1234`)
3. **Start baseline** or **Skip to practice**
4. On a question:
   - Click **Hint** → see hint ladder
   - Submit a **wrong answer** → rate confidence → see “Not quite”
   - Continue → submit **correct answer** → see success feedback
   - Try **Skip question** on another item
5. **End session** → see session summary

## Parent flow

1. Open http://localhost:3000/parent/login
2. Click **Use demo parent** → lands on dashboard with **Demo Student**
3. Open **Session summary** and **Weekly update** for the student
4. (Optional) Add a new student and note the access code

## What automated tests cover

| Command | Covers |
|---|---|
| `pnpm test:golden` | Engine rules R01–R20 + G## regression |
| `pnpm test:scenario:all` | API E2E: wrong→explanation→retest, skip, retention, weekly report, email stub |
| `pnpm test:smoke:ui:mvp2` | Routes + API wiring + revision queue |
| `pnpm test:content` | 220 APPROVED question bank vs manifest |
| `pnpm test:ui:e2e` | Playwright on integrated apps/web (wrong/right, letters) |
| `pnpm test:scenario:live-gen-*` | Live-gen fallback / timeout / invalid-json |

## Live agentic flags (shadow-first)

```bash
# Shadow: generate+verify+log, still serve bank
LIVE_AGENTIC_GENERATE=true LIVE_AGENTIC_SERVE_GENERATED=false OPENAI_API_KEY=... pnpm --filter @cogna/api dev
```

See [`COGNA/LIVE_AGENTIC_PLAN.md`](../COGNA/LIVE_AGENTIC_PLAN.md) and [`COGNA/PRIVACY_AND_DATA.md`](../COGNA/PRIVACY_AND_DATA.md).

## Stage 1 pilot gate

At least **one live child session on a real phone**, observed — automated gates do not replace this.

## Production paths (when configured)

- **Clerk:** set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` → parent login uses Clerk SignIn
- **PostHog/Sentry:** set env keys → observability vendors show ready on pilot dashboard
- **Content review:** `POST /content/review/:questionId` with checklist payload

## Pilot dashboard

```bash
curl http://localhost:3001/observability/pilot-dashboard | jq
curl http://localhost:3001/observability/alert-thresholds | jq
```
