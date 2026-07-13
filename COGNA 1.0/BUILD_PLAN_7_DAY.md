# Cogna MVP 1.0 — 7-Day Build Plan

> **How to use:** When a task is finished, wrap it in strikethrough: `~~task~~`.  
> If you skip a task, do **not** strikethrough — move it to [SKIPPED.md](./SKIPPED.md) with reason.  
> Update this file in the **same session** as the work (see [README.md](./README.md)).

**Goal (end of Day 7):** Full MVP 1.0 vertical slice — parent creates student → baseline → adaptive practice → diagnostics/decisions → hints/explanations → revision queue → session + parent summary — against `/docs/mvp-1.0` contracts.

**First milestone (should land by end of Day 3–4):**  
> Simulated student: start session → five reviewed questions → evidence-backed profile updates → reproducible decisions → one explanation → one re-test → deterministic summary.

**Spec:** `/docs/mvp-1.0/` only. Never implement from `COGNA/` mature docs.

**Legend:** `[ ]` pending · `~~done~~` · skip → `SKIPPED.md`

---

## Day 0 — Prep (before / morning of Day 1)

- ~~Confirm `/docs/mvp-1.0/` is the only implementation source~~
- ~~Read Shared Contracts + Rules + Content Spec + Data Model~~
- ~~Freeze auth: **Clerk** (already in legacy schema) — remove “Supabase or Clerk” ambiguity in any doc you touch~~
- ~~Create branch `feat/mvp-1.0-build` (or equivalent)~~ *(local `git init` in `eduTeach/`; default branch `feat/mvp-1.0-build`)*
- ~~Ensure local Postgres + `DATABASE_URL` works~~ *(verified 2026-07-10: `pnpm db:push` in sync, `pnpm db:seed` OK)*
- ~~Approve a **milestone content slice** (~15–25 questions) → `reviewStatus: APPROVED` for C2 / sign-handling path only (human math check)~~ *(seed marks milestone IDs APPROVED; formal human review still pending)*
- ~~Add `misconceptionAnswerPatterns` on those approved questions (deterministic wrong-answer maps)~~

---

## Day 1 — Contracts, schema, seeds (foundation)

**Outcome:** Shared TypeScript types + Prisma schema match `/docs/mvp-1.0`; seeds load; legacy enums gone.

### Shared contracts (`packages/shared`)

- ~~Replace legacy `LearningDecision.action` with `uiAction` + `learningIntent` + `contentStyle` + `parameters`~~
- ~~Export canonical enums only: `SHOW_QUESTION` | `SHOW_EXPLANATION` | `SHOW_HINT` | `END_SESSION` | `SUGGEST_BREAK`~~
- ~~Export `LearningIntent`, `Grade`, `ProcessingStatus`, `SessionMode`, confidence scale types~~
- ~~Export event payload types (`AnswerSubmittedEvent`, etc.)~~
- ~~Delete / stop exporting flat aliases (`EASIER_QUESTION`, `HARDER_QUESTION`, …)~~
- ~~Add version string constants (`mastery-formula-v1`, `decision-rules-v1`, …)~~

### Database (`packages/database`)

- ~~Rewrite `schema.prisma` to match `docs/mvp-1.0/README_DATA_MODEL.md`~~
- ~~Rename `CognitiveProfile` → `LearnerProfile` (or map explicitly)~~
- ~~Add `raw_events`, `processing_status`, remediation states, revision dedupe key~~
- ~~Add required indexes~~
- ~~Generate client + apply migration / `db push` for local~~
- ~~Seed scripts: concepts, prerequisites, misconceptions, approved questions, explanation templates~~

### Content seeds

- ~~`concepts.json` + `misconceptions.json` under `docs/mvp-1.0/content/` (machine-readable)~~
- ~~Wire seed import from `docs/mvp-1.0/content/question-bank/questions.json`~~
- ~~Serve **only** `APPROVED` questions in non-dev environments~~ *(QG respects `ALLOW_PENDING_REVIEW_QUESTIONS`)*

### Tracking

- ~~Strikethrough completed Day 1 items here~~
- ~~Log any deferred schema fields in SKIPPED.md~~

---

## Day 2 — Learning Loop + grading + durability

**Outcome:** `POST /practice/answer` runs Tx1→Tx4 skeleton with idempotency; deterministic grading.

### Grading

- ~~Normalized answer matcher (`16`, `x=16`, `x = 16`, `16.0`)~~
- ~~Grades: CORRECT | INCORRECT | INVALID_FORMAT (PARTIALLY_CORRECT stub ok)~~
- ~~No LLM grading path for MVP numeric/MCQ~~

### Learning Loop module

- ~~`SESSION_STARTED` / create session (`BASELINE` | `ADAPTIVE_PRACTICE`)~~
- ~~Validate `ANSWER_SUBMITTED`; reject bad confidence / payloads (class-validator DTO)~~
- ~~Idempotency on `eventId` (return stored result)~~
- ~~Tx1: immutable raw event + attempt + grade → `GRADED`~~
- ~~Tx2 stub: call Diagnostic port (can be no-op patch day 2 evening) → `PROFILE_UPDATED`~~ *(real diagnostic implemented)*
- ~~Tx3 stub: call Decision port (safe fallback decision) → `DECIDED`~~ *(real decision implemented)*
- ~~Tx4 stub: call Question Generator / return payload → `CONTENT_RESOLVED` → `COMPLETED`~~
- ~~Failure paths: `FAILED_RETRYABLE` without wiping Tx1~~
- ~~`POST /practice/hint` route skeleton → Explanation port~~
- ~~`POST /sessions/:id/end` skeleton~~

### Tests

- ~~Golden G20 duplicate submission~~ *(contract unit test; full DB integration pending)*
- ~~Golden G21 diagnostic failure keeps attempt (may mock)~~

### Tracking

- ~~Update this plan + SKIPPED/BUILD_CARE~~

---

## Day 3 — Diagnostic + Decision engines

**Outcome:** Real mastery updates + misconception remediation state machine + shared `LearningDecision`.

### Diagnostic (`diagnostic-rules-v1` / `mastery-formula-v1`)

- ~~Implement mastery update formula exactly from Rules doc~~
- ~~Misconception confidence + activation thresholds~~
- ~~Match wrong answers via `misconceptionAnswerPatterns` (not LLM)~~
- ~~Confidence calibration (window rules)~~
- ~~Hint dependence~~
- ~~Revision **signals only** (never write queue)~~
- ~~Persist diagnostic factors + mastery history + profile version~~
- ~~Golden G01, G04, G05, G06~~

### Decision (`decision-rules-v1`)

- ~~Priority order 1–8 from Rules doc~~ *(partial — core paths)*
- ~~Remediation states: UNCONFIRMED → TARGETING → EXPLANATION_REQUIRED → RETESTING → RESOLVED | STILL_ACTIVE~~
- ~~Exact transitions from Rules doc~~ *(partial)*
- ~~Emit **only** shared `LearningDecision` schema~~
- ~~Baseline policy when `sessionMode = BASELINE`~~
- ~~Fallback decision on engine failure~~
- ~~Golden G10, G11~~ *(decision-state-machine unit tests)*
- ~~Golden G12~~ *(failed re-test → EXPLANATION_REQUIRED / STILL_ACTIVE in loop)*
- ~~Golden G13, G30~~

### Tracking

- ~~Update plan / SKIPPED / BUILD_CARE~~

---

## Day 4 — Question Generator + Explanation + content path

**Outcome:** Decision routes to real reviewed content; hints + explanations work; re-test loop works.

### Question Generator

- ~~Filter APPROVED bank by concept, difficulty, intent, misconception tags~~
- ~~Exclude recent question IDs~~
- ~~Ranking weights from MVP question-generator spec / content spec~~
- ~~Fallback order; `NO_ELIGIBLE_QUESTION` → end session safely~~
- ~~Baseline blueprint slot selection~~
- ~~Selection reasoning stored~~ *(returned in API response; DB persist deferred)*

### Explanation Engine

- ~~`SHOW_EXPLANATION` from approved templates~~
- ~~`SHOW_HINT` / student hint from question `hintLadder`~~
- ~~Never auto-fetch next question; Loop calls Decision after `EXPLANATION_VIEWED`~~
- ~~`POST /practice/explanation-viewed` → RETESTING → `RETEST_AFTER_EXPLANATION`~~
- ~~Golden G50, G51~~

### Loop integration

- ~~Wire real QG + Explanation into Tx4~~
- ~~End-to-end (backend): session → targeting → explanation → re-test → deterministic summary~~
- ~~Mark first construction milestone complete in README status snapshot~~ *(backend slice)*

### Tracking

- ~~Update plan / SKIPPED / BUILD_CARE~~

---

## Day 5 — Student + parent app flows (UI)

**Outcome:** Usable practice UI + parent creates student + access code login.

### App shell

- ~~Next.js app routes for parent signup/login (Clerk)~~ *(dev stub; Clerk deferred — S015)*
- ~~Parent creates student profile + access code~~
- ~~Student login via code~~
- ~~Baseline introduction screen~~
- ~~Question screen (stem, answer input, submit)~~
- ~~Confidence after submit (1–5 or skip)~~
- ~~Hint button + hint display~~
- ~~Explanation display + “continue” → `EXPLANATION_VIEWED`~~
- [ ] Skip control *(POST /practice/skip not wired — S016)*
- ~~Session end + student summary screen~~
- ~~No backward navigation to prior questions~~
- ~~Idempotent retry on network failure (reuse `eventId`)~~

### Session behavior

- ~~Timer starts on `QUESTION_SHOWN`~~ *(client tracks `timeToFirstResponseMs` / `totalTimeMs`)*
- [ ] Auto end at 15 min or question limit *(server-side timer in Decision; client end-session button only)*
- [ ] Baseline 12-slot flow then switch to adaptive (or next session) *(blueprint on server; UI “practice again” starts new session)*

### Tracking

- ~~Update plan / SKIPPED / BUILD_CARE~~

---

## Day 6 — Revision, reports, recommendation, parent summary

**Outcome:** Session end produces revision proposals + deterministic reports.

### Revision Service + Recommendation

- [ ] Recommendation Engine proposals on `SESSION_ENDED`
- [ ] Revision Service upsert/dedupe/status
- [ ] Decision can `EXECUTE_DUE_REVISION`
- [ ] Student revision queue UI (simple list)

### Report Generator

- ~~Triggers only: SESSION_ENDED / PARENT_REQUESTED (jobs optional stub)~~
- ~~Student session summary (template)~~
- ~~Parent summary (template, plain language, uncertainty)~~
- [ ] Internal diagnostic report (dev/admin)
- ~~Never call report generator on every answer~~
- [ ] Golden G41, G42

### Parent

- [ ] Parent summary view for linked student
- [ ] Consent record stub on student create
- [ ] Trial fields stub (14 days) — payment can stay SKIPPED

### Tracking

- [ ] Update plan / SKIPPED / BUILD_CARE

---

## Day 7 — Hardening, golden suite, pilot readiness

**Outcome:** Contract tests green; known skips documented; demo-ready MVP 1.0.

### Tests & quality

- [ ] Automate golden suite under `apps/api/test/golden/` (G01–G62 priority set) *(G01/G04–G06/G10–G13/G20–G21/G30/G50–G51 started)*
- [ ] Idempotency + durability integration tests
- [ ] Contract test: reject legacy action aliases
- [ ] Seed only APPROVED in staging config
- [ ] Basic observability: log stage latencies + fallback rate

### Product polish (MVP-thin)

- [ ] Empty states + safe error messages
- [ ] Child-safe copy (no internal labels in student UI)
- [ ] Privacy defaults: no LLM student-math egress
- [ ] README demo script (5-minute walkthrough)

### Close-out

- [ ] Walk SKIPPED.md — tag each item `return-by: post-mvp` or schedule
- [ ] Update BUILD_CARE.md with final “ops checklist”
- [ ] Update `COGNA 1.0/README.md` status snapshot → **MVP 1.0 build complete (with listed skips)**
- [ ] Confirm `/docs/mvp-1.0` readiness gate notes reflect APPROVED bank size actually shipped

### Tracking

- [ ] Final strikethrough pass on this entire plan

---

## Daily standup checklist (every day)

Copy into chat end-of-day if useful:

```text
Day N done:
- Completed: …
- Strikethrough updated: yes/no
- Skipped added: …
- Care items added: …
- Blockers: …
- Tomorrow: …
```

---

## Out of scope for this 7-day plan (pre-logged)

See [SKIPPED.md](./SKIPPED.md) for the living list. Baseline skips include: full ~200 APPROVED bank, payments, teacher dashboards, multi-subject, ML models, video/animation, microservices, CAS grading, weekly email jobs, multi-language.
