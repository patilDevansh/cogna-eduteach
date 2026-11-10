# Build plan

10 November 2026 Lotus maintenance: implement evidence-qualified ratings/clearance notes, board-aware sessions, rated classroom summaries, bounded follow-ups and stable paper slots. Acceptance remains open until fresh HTTP/browser gates and regression checks pass.

## Teacher AI Studio access — 3 November 2026

- [x] Add teacher workspace entry and saved Lotus diagnostic list, with answer, evidence, uncertainty, decision and report details.
- [x] Authorize observer reads from current classroom ownership and active enrollment; limit standalone demo access to the local development teacher.
- [x] Verify API/web TypeScript, an isolated PostgreSQL access test and the local teacher browser journey.
- [ ] Complete the existing AI Studio redesign and usability gates below; this observer entry does not complete those phases.

## MVP 10.0 evidence qualification — 2026-10-26

- [x] Qualify report strengths using distinct direct successful questions; keep supporting, unscoped and one-off success as observations.
- [x] Expose source turns, policy version and retention-not-measured metadata; base report advancement on qualified strengths.
- [x] Remove synthetic confirmed sign-root teaching targets and blanket student-facing mastery claims.
- [x] Write the factorisation educator-review and real-student validation protocol.
- [x] Shared build, API/web type checks and 218 focused diagnostic/lesson/video regression tests pass.
- [ ] Full golden/database regression and browser acceptance: the full golden run was stopped after sandbox database connection failures; no phase gate or production readiness is claimed.
- [ ] Conditional prerequisites, calibrated internal routing, misconception-label validation and cross-board alignment remain follow-up blueprint work.
- [ ] Execute consented real-student evaluation with independent educator judgments and predeclared release criteria.

See [validation plan](./FACTORISATION_VALIDATION_PLAN.md) for scope and dependencies.

- [x] Persistent teacher, classroom, enrollment, run, and assignment schema
- [x] Teacher and student classroom APIs with ownership boundaries
- [x] Production classroom creation and code-join screens
- [x] Teacher phase launcher and student assignment polling
- [x] Lotus completion persisted into classroom assignments
- [x] Verified personalized video connected to teaching assignments
- [x] Scored gamified practice stored separately from independent evidence
- [x] Personalized independent exit route and persistence
- [x] Real-data teacher report with explicit demo report mode
- [x] Automated lifecycle test suite (ownership, enrollment isolation, gates, idempotency, phase transitions, aggregation)
- [ ] Full browser acceptance walkthrough
- [ ] Production deployment migration verification
- [x] Lotus code-path latency policy (bounded output, cache-friendly prompts, configurable reasoning budgets)
- [ ] Syllabus ingestion, versioned objectives, provenance, and vetted Lotus question generation ([architecture](./LOTUS_ARCHITECTURE.md))
- [ ] Durable full-history Lotus learner state and high-confidence ready-item shortlisting
- [ ] Shadow evaluation of fast-next selection, diagnostic quality, safety, and student-visible latency before rollout

## Diagnostic-quality and adaptive-action repair

- [x] MVP 10.0 UI maintenance (2026-10-08): math keys target final answers and selected working steps; workshop/constellation scenes and early Detective increase format variety; Garden instances pass the complete installation gate before selection.

These are **open** requirements in the [continuous diagnostic plan](./LOTUS_CONTINUOUS_DIAGNOSTIC.md#8-repair-diagnostic-interpretation-and-the-action-loop-before-claiming-adaptivity), not completed functionality.

- [ ] Persist pseudonymous standalone-demo and production response, analysis, timing, and plan-decision events so the previous 24 hours can be audited.
- [ ] Calibrate per-skill evidence: separate verified result from hypothesized cause; treat “I don't know” as support, and avoid blanket mastery or gap claims from one nondiagnostic response.
- [ ] Give AI review the remaining 25-slot map and require a specific, uncertainty-aware recommendation with competing explanations and an expected discriminating observation.
- [ ] Bind recommendations to validated near-term unseen questions, prevent duplicate/far-future generic checks, and record when KEEP or deferral is the correct action.
- [ ] Make AI Studio show proposed, installed, and actually shown actions separately; never report “implemented” from placeholder analysis or a generic planning note.
- [ ] Replace all-answer four-call serial review with a measured selective/escalating pipeline, bounded concurrent jobs, deadlines, and version-safe late-result handling.
- [ ] Repair obsolete hardcoded-fixture factorisation tests and add replay, latency, coverage, and educator-scored diagnostic-quality release gates.
- [ ] Build Playwright factorisation journeys for synthetic capability profiles through the real student UI, API, observer view, and final report, with isolated persistent audit data.
- [ ] Run both controlled-model CI scenarios and repeated live-model scenarios; compare each final skill report and actual question path with an independently written educator reference profile.
- [ ] Publish per-skill confusion matrices, missed/false gaps, action relevance, coverage, and latency; block rollout on failed safety invariants or unmet educator-reviewed diagnostic-quality gates.

## Phase gates and AI Studio delivery

- [ ] Phase 0 — mandatory durable database persistence for demo and production diagnostics, isolated persistent audit environment, per-turn event timeline, recovery/outbox tests, and AI Studio review-status strip.
- [ ] Phase 1 — evidence-calibrated learner model and AI Studio Evidence panel.
- [ ] Phase 2 — structured adaptive decisions, near-term validated placement, and AI Studio Decision panel.
- [x] Phase 3 — all-AI question readiness/provenance/validation and AI Studio question-supply panel (51 deterministic API checks and 10/10 PostgreSQL-backed Playwright checks passed, 20 Sep 2026).
- [ ] Phase 4 — selective concurrent review with deadlines and AI Studio latency/effect detail.
- [ ] Phase 5 — truthful proposed/installed/shown action timeline and evidence-traceable teacher report.
- [ ] Phase 6 — controlled and live-model Playwright intellectual-profile evaluation with educator scoring.
- [ ] Phase 7 — consented shadow pilot, educator review, policy promotion, and rollback drills.
- [ ] AI Studio redesign — session overview, compact turn Decision Cards, unseen-plan transparency, question provenance, and advanced audit drawer.
- [ ] AI Studio usability gate — Playwright desktop/mobile/accessibility coverage plus educator task review showing readers can identify evidence, decision, and actual outcome without opening raw model details.

Before executing each phase's test gate, notify the product owner in the active Codex thread with the test scope, environment, live-model/cost impact, expected duration, and any test-data reset; wait for acknowledgment and report the results before starting the next phase.

## Public sample test (2026-10-22)

- [x] `/try`: parent's email, child's first name and consent, then Cogna's factorisation check, free, with no account
- [x] Free summary at the end (answered, right, skills secure / need work, counts only); full report and personal lesson unlocked by payment
- [x] Report locked on the server for unpaid samples (every Lotus response and lesson creation), not just hidden in the page
- [x] Razorpay orders, signature-checked payment callback and webhook; local test payments when no keys are set
- [x] Parent emails: their link at the start, results ready, report unlocked; limits per email, per network and per day
- [x] No payment offered when there weren't enough answers to make a report (free retake instead)
- [ ] Go live with Razorpay (KYC, live keys, webhook), privacy and refund pages, retention for unpaid samples

## Lotus diagnostic puzzle integration (2026-10-09)

- [x] Add Factor crossword on compatible medium monic-trinomial coverage; verify every crossing and record one observation.
- [x] Add Cut-and-build studio on compatible numeric difference-of-squares coverage; mark submitted side lengths with existing algebra.
- [x] Preserve adaptive checks, existing probes, kill switch, key redaction and diagnostic-only stage restrictions.
- [x] Shared/API/web TypeScript and 56 focused interaction/puzzle tests.
- [ ] Complete full database regression and browser acceptance after local-network/approval access is restored.

## Classroom connections (2026-10-08)

- [x] One Lotus session per class assignment (refresh/second tab resumes, never restarts)
- [x] Background filing of finished class steps; teacher roster shows last activity and who has gone quiet
- [x] Live updates (server-sent events) for teacher class page and student pages; polling demoted to a slow fallback
- [x] Parent link codes on school-made students (claim = consent) and in-app parent updates (check finished, catch-up set)
- [x] Parents link through the phone on the school's record, replacing the slip code (2026-10-14): the class list takes parents' mobiles and the school's consent; a parent confirms their number with a texted code and agrees per child; any number of guardians; the school keeps the student (teacher still resets sign-in); teachers edit numbers, unlink, and approve parents who aren't on record
- [ ] Send texts in production: Twilio env (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM) plus a DLT-registered sender and template for India
- [x] Parent updates by text to the verified number (check finished, catch-up set, teacher approved the link), with an opt-out; WhatsApp not built
- [x] A child added at home with the same first name as one from school is flagged; "same child" hides the home copy (kept, not erased), "different" stops asking. Learning histories are not merged
- [x] Parents can stop following a school child (withdraws consent) and change their confirmed number; teachers see new link requests live
- [x] Teacher controls: restart one student, pause/resume, time limit, remind students who haven't started; late joiners in teacher-advanced checks
- [ ] Email delivery for parent updates (no email provider is wired; weekly reports are also stub-only)
- [ ] Rate limit per signed-in user rather than per network address
- [ ] Multi-instance live updates (in-process only today)

## Parent dashboard (2026-10-12, [spec](../docs/mvp-10.0/PARENT_DASHBOARD.md))

- [x] Parent value and home order agreed: work done → what's next (time, due date) → where they struggle
- [x] `dueAt` on class checks (the whole check is one parent task), set at launch: 2 days by default, `dueDays` 1–30 accepted by the API
- [ ] Teacher picks the due date when starting a check (UI), and a roster overdue filter
- [x] Parent-facing task states (done on time / late / not finished / to do / overdue / with the teacher), last-30-days counts and time estimates (`parent-work.ts`, tested)
- [x] Home page rebuilt in the agreed order, phone and laptop (ring, next task with deadline bar, found → lesson → fixed tracker, topic bars)
- [x] Student enters a parent email when joining a class; Cogna emails the parent a link code (rate-limited; link carries the code in the URL fragment); claim page prefills it across sign-in
- [ ] Set `SMTP_USER` / `SMTP_PASS` (cogna.eduteach@gmail.com app password) in each environment
- [ ] Student due-soon banner (24 h before), then parent due-day message, at most one each per assignment
- [x] Email sending (SMTP via nodemailer; Gmail for the pilot)
- [ ] WhatsApp Business provider, approved templates, parent phone number and recorded opt-in

## Shared AI delivery coordination (2026-10-28)

- [x] ~~Create common agent entrypoints and a local claim/evidence/handoff workflow.~~
- [x] ~~Record a source-inspection baseline with explicit runtime-verification limits.~~
- [x] ~~Verify local coordination with 13 isolated tests, including simultaneous claims and edit-scope conflicts.~~
- [x] ~~Activate the private cross-computer Project and verify task import, visibility and single-authority cutover.~~ Follow AGENTS.md; do not mirror private task details into this public repository.
- Product implementation and existing phase gates remain separate; no application acceptance check is marked complete by this setup.

## Teaching-first contract amendment (2026-10-28)

- [x] ~~Define the additive teaching-first module contract, assigned/self-directed entry and compatibility with both diagnostic modes.~~
- [ ] Implement and verify the new module path against MODULE_LEARNING.md; documentation completion does not complete runtime acceptance.

## Verified local staging during provider outage (2026-10-28)

- [x] ~~Keep eligible verified local question staging reachable during provider outages.~~
- [x] ~~Add seven outage regressions; 51 combined focused tests and API TypeScript pass.~~
- [ ] Verify complete entry/resume, reserve coverage and outage recovery through browser/database acceptance; this backend repair does not close those gates.


## Typed-practice evidence and recovery — 29 October 2026

- [x] Add versioned typed-practice observation/receipt contract and additive views.
- [x] Persist receipt + current aggregates atomically under assignment row lock; enforce student ownership, version and replay semantics.
- [x] Show truthful save/retry feedback, recover pending/saved typed work, record actual presentation/help and repair mobile overflow.
- [x] Independent source review and local synthetic gate: 80 API + 4 PostgreSQL + 2 client tests; 16 browser assertions; API/web type checks.
- [ ] Extend remaining formats/history/module progression and run full production/classroom gates before broader claims.


### Unsubmitted practice refresh correction — 29 October 2026

Follow-up acceptance: verify unsubmitted and post-feedback edits survive refresh in the same tab; preserve exact input and server receipts; distinguish local draft recovery from server save.


### Exercise and Lotus interaction context — 30 October 2026

Additive answer-context slice: shared strict v1 shape, post-DOM answerable presentation collector, exercise/Lotus forwarding, original-payload retry checks and existing RawEvent/audit/ANSWER persistence. Verify both actual pages and isolated real storage; full cognitive interpretation remains separate.

Verification for the bounded answer-context change:50 focused API tests,9 client cases,2 real disposable PostgreSQL tests and12 actual-page browser checks passed; shared build/API+web types/whitespace passed. Provider-free seeded harness exercised real controllers/services/storage, not full production bootstrap. Existing regression fixtures were corrected to use a guaranteed wrong answer outside the random opener range.


### Recovery, joined history and contextual support —30October2026

Verification for this increment:50 focused API,12 client and9 disposable PostgreSQL tests;26 browser checks across the main recovery/support/history, tile recovery and explicit practice-check flows. Shared build/API+web types/whitespace passed. Actual pages/controllers/services/storage used in a seeded provider-free fixture; production bootstrap and live-child validation remain separate.

### Draft-process review correction — 2 November 2026

Sprint 1 corrective slice (2 November): expose submitted answer text and observed elapsed time in the student history; persist bounded typed draft candidate/clear checkpoints on the same learner/session/issued question. Verify strict ownership, altered retries, history projection and no answer-key leakage. Broader content and delayed-learning telemetry remain later work.

### Teaching-first reference module — 2 November 2026

- [x] Implement one versioned, rollout-gated factorisation teaching path with separate teacher-assigned and self-directed runs; keep diagnostic routes unchanged.
- [x] Persist client-reported lesson presentation, checkpoint/probe/practice/independent answers, pause/resume, teacher pause and replay-safe revisions in the existing authorised event store.
- [x] Verify the reference content and state policy with focused tests, a disposable PostgreSQL fixture and a provider-free browser journey.
- [ ] Complete the full module contract: teacher release/cancel/due controls, later review, generalised curriculum packages, reporting, access/retention policy and independent product review.

3 November reference hardening: 4/4 state tests, 2/2 isolated PostgreSQL tests and 11/11 browser checks pass after exit-item reservation and classroom-owner checks. API TypeScript passes; full web TypeScript currently fails in concurrent unfinished `sevenways` theme maps and must be rerun after that integration.

### Saved answer with a failed next step — 5 November 2026

An Exercise answer that is saved while the next step fails now offers Try again, which resends the same frozen answer. The earlier correction removed retry for this case as well as for a different already-submitted answer; only that second case can never succeed. Try again survives a refresh and a return from Home in the same tab, and a retry never adds a second answer. Four browser scripts were updated to current behaviour, and the held-out scorecard v1 "found not lower" check now has a stated 3% margin for random question variants. The fixture's next step always fails, so moving on after a retry is shown with one mocked response, not a real temporary failure.


AI Studio observer maintenance (5 November 2026): [x] Replace duplicated primary/challenger display with one review. [x] Expose recorded question/format selection, source, placement, rationale and application state. [x] Show review duration and queue wait separately. [x] Web TypeScript, render assertions, diff check and saved-session browser inspection.


Saved Lotus entry correction (5 November 2026): [x] Explicit session selection with student/topic/assignment checks. [x] Separate recovery scope per selected session. [x] Web types, three existing recovery tests, diff check and browser restore/refresh checks.


Lotus refresh maintenance (5 November 2026): completed focused recovery validation and browser save/resume check. Six recovery tests pass; developer-exit feature verification remains separate and in progress.
