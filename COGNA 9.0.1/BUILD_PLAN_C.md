# MVP 9.0.1 — Phase C: Verified next-item buffer (plan)

> Follow-on to Phase A / A2. Sequencing: [`BUILD_PLAN.md`](./BUILD_PLAN.md).
> Use `~~strikethrough~~` when completed.

## One line

Make AI-selected next questions feel instant by serving from a small, already-verified per-session buffer filled in the background — never by waiting longer for the model.

## Decisions locked

1. **Pattern:** Process-local buffer (same shape as live-teaching’s module `verifiedCache` Map + cap in [`live-teaching-agent.service.ts`](../apps/api/src/engines/live-teaching/live-teaching-agent.service.ts)), but **session-scoped** keys so items respect `alreadyServed` / `serveOrdinal`. No Bull, Redis, or Nest cron for C.v1.
2. **Fill pipeline:** Reuse existing `renderFreshInstance` → `verifyRendered` and (when AUTHOR is in play) `author` → `gateAuthoredItem`. Nothing enters the buffer until the same gates that protect the sync path pass.
3. **Background shape:** Repo convention — fire-and-forget `void promise.catch(warn)` like `evaluateInBackground` on question-recommender agents. Never block `startSession` / `submitStep` response on refill.
4. **Hooks** in [`diagnostic-v2-session.service.ts`](../apps/api/src/engines/diagnostic-v2/diagnostic-v2-session.service.ts):
   - After `startSession` assembles the fixed opening item — prefetch 2–3 candidates for likely early skill targets.
   - On non-completing `submitStep` (student still on current item) — refill for likely next skill targets.
   - After `selectNextItem` consumes a buffered item — refill that skill slot.
5. **Consume path:** In `selectNextItem` / selector serve path ([`diagnostic-v2-ai-selector.service.ts`](../apps/api/src/engines/diagnostic-v2/diagnostic-v2-ai-selector.service.ts) `serveGenerated` / `serveAuthored`), check buffer for a verified item matching the chosen template/skill **before** awaiting LLM or sync render. Hit → return immediately (same UX as EXISTING). Miss → today’s sync path unchanged (not worse).
6. **Prediction scope:** Prefetch by **likely skill / template targets** only — current item’s skill, immediate catalogue prerequisites, next backbone stage. Do **not** prefetch per predicted wrong answer. Cap ~2–3 live buffer entries per session (plus a hard process cap, e.g. 500, mirroring live-teaching).
7. **Observability:** Log buffer hit/miss (and optionally author-budget skip) so hit rate can tune size; reuse `AiDecisionAuditLog` for any AI calls that still run during refill.
8. **Sequencing:** Plan and checklist land now; build once enough topics have verifiers to make buffering worthwhile (linear + fractions already ship — C’s payoff grows as B2–B4 land). C does not block D.

## Checklist

### Buffer module

- [x] ~~Small helper or private methods on the session service — get/put/evict by `sessionId` + skill/template key; never serve unverified payloads~~
- [x] ~~Hard process cap (e.g. 500) + per-session cap (~2–3 live entries)~~

### Prefetch worker

- [x] ~~One method that, given skill/template targets + `alreadyServed`, runs GENERATE (primary) through existing verify~~
- [x] ~~AUTHOR only if selector policy would allow it and authoring is not over budget~~ *(C.v1: GENERATE-primary fill only; AUTHOR remains on the sync selector path)*
- [x] ~~Fire-and-forget wrapper that cannot throw into the request path~~

### Wire hooks

- [x] ~~After `startSession` opening item — prefetch likely early targets~~
- [x] ~~On non-completing `submitStep` — refill for likely next skill targets~~
- [x] ~~After consume from buffer — refill that skill slot~~

### Consume-before-sync

- [x] ~~In `serveGenerated` / `serveAuthored`, check buffer before awaiting LLM or sync render~~
- [x] ~~Preserve rule fallback on empty buffer (miss path identical to today)~~

### Goldens / tests

- [x] ~~Unit: hit / miss / evict~~
- [x] ~~Integration: `selectNextItem` does not call author/orchestrator when buffer has a matching verified item~~ *(author not called on GENERATE buffer hit)*
- [x] ~~Race-safe “consume once” (two selects do not get the same buffered equation)~~

### Tracking

- [x] ~~Strike Phase C “not yet planned” in [`BUILD_PLAN.md`](./BUILD_PLAN.md) / [`README.md`](./README.md) / [`SKIPPED.md`](./SKIPPED.md) as appropriate when implementation ships~~
- [x] ~~Note hit-rate metric expectation in [`BUILD_CARE.md`](./BUILD_CARE.md) if useful~~

## Out of scope for C

- Making the model or timeout “faster” as the primary fix (`TIMEOUT_MS` stay as observation budgets)
- Cross-process durable queues (Bull / Redis)
- Clairvoyant per-misconception pregeneration
- Changing evidence, grader, or interpreter contracts
