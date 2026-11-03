# Build care

## MVP 10.0 diagnostic evidence qualification — 2026-10-26

- The planner's existing `SECURE` signals remain provisional. Reports require two distinct, verified, directly targeted successes before exposing a demonstrated strength. Supporting tags and unscoped legacy evidence cannot qualify one; copied expressions/variable-only renaming count once. The threshold is a product rule, not a validated psychometric cutoff.
- `OBSERVED` is an additive report state. `evidenceAssessment` is optional for historical report compatibility; current reports include source turns and explicitly leave retention unmeasured. Existing persisted reports are not rewritten or retrospectively validated.
- Advancement/catch-up report outcomes use qualified strengths. Student copy no longer states that everything tested is secure or that no teaching is needed.
- `teachingStart` chooses an existing confirmed ledger entry. It cannot invent a confirmed sign-multiplication prerequisite from errors on two different skills. Common-cause hypotheses need their own check.
- Verification: shared build and API/web TypeScript pass; 218 focused tests pass, including seven new evidence-qualification regressions and existing diagnostic/session/lesson/video tests. Full golden was attempted but blocked from the listening local PostgreSQL server by sandbox connectivity and stopped after repeated connection failures. No database cleanup, live-model call, browser acceptance, or student-data evaluation was performed.
- The original diagnostic slot planning and provisional evidence transitions remain unchanged. This reporting repair does not close the empirical validation, prerequisite-design, or internal-routing backlog.

## MVP 10.0 workflow review fixes — 2026-10-15

- A student who says "I don't know this yet" on two questions about a skill (or once alongside a mistake) now has that skill confirmed as "not learned yet". Lotus drops to its foundations, ends early, names a starting point, and makes a lesson; the teacher roster says "teach from the basics". One "I don't know" alone still only earns an easier question. "I don't know" answers count as lesson evidence (`SAID_NOT_KNOWN`).
- The check's 15-minute limit counts active time (each question at most 3 minutes, `lotusActiveSeconds` in shared), so time away doesn't use it up; the student's clock uses the same rule. "Carry on" reopens the current question.
- Students no longer see lab internals (Experimental AI Lab, model names, phase and provenance labels); the dev "Skip test as…" shortcut is hidden on class assignments because it signs in as a demo student.
- Fake-model items can't enter the shared question bank; 12 leaked items were deactivated locally. A written question must carry at least one mistake its slot tests, and repeats are compared with letters renamed.
- "Quick check" is the one name for the first check (teacher, student, parent); practice is "Practice". Teacher counters read "In class" and "Gap found". Class switcher: 5 recent classes plus "More classes", same names told apart by join code, a warning on a reused name. Today has one start path. The home page describes the current class flow.
- Lesson videos say "Narrated" only when narration audio was made. Practice items offer "Show me how" (the worked answer, as after two misses). The crossword formats powers. The report says "You finished the check", and an unclear result no longer promises a check or "no lesson needed".
- Golden tests: 1,392 pass. Browser walkthrough on the fake model: teacher class and class list, student check, report, lesson, practice, parent dashboard.
- Still open: a student added after a check has finished can't be sent it (their home now says so); Cartesia credit for narration; wrong-answer labels are not yet checked against the maths.

## MVP 10.0 UI maintenance — 2026-10-08

- Stable answer and working refs prevent rerenders from redirecting math keys. Each toolbar names its target and preserves cursor/selection.
- Workshop and constellation visuals use unchanged server-issued tile payloads; placement animations never indicate correctness. Tile boxes remain keyboard accessible and motion respects reduced-motion preferences.
- Initial negative-factor coverage may use Detective. Incompatible targeted checks stay with the writer. Garden candidates retry when they lack the required misconception distractors.
- Reused AI bank items recompute their answer-entry scene for the new turn instead of inheriting a previous session's layout.
- Live fake-model browser checks verified workshop placement, Detective, fishing, fireflies and constellation, plus repeated math insertion and selection replacement across answer/working fields.
- Shared, web and API TypeScript checks pass. All 1,304 golden tests pass, including 46 interaction-format tests and repeated-seed early-game installation checks.

- Preserve all older demo and prototype routes.
- Never fall back from a failed production request to mock data.
- Do not merge assisted or gamified practice into independent exit evidence.
- Preserve user changes already present in the worktree.
- Every schema change requires a checked-in migration and Prisma validation.
- Complete browser acceptance before marking this era shipped.

## Lotus puzzle maintenance — 2026-10-09

- Crossword grades all four crossings but contributes only one skill observation. No partial result grants secure evidence; unknown causes remain for background review.
- Studio geometry is a neutral scratchpad. Only selected side lengths are submitted; moving, rotating or resetting pieces never marks an answer correct.
- New games are limited to compatible coverage, preserve adaptive checks and stay outside independent exit/practice. Correctness and ordered solutions are never added to public interaction metadata.
- Shared/API/web TypeScript and 56 focused tests pass. Full golden run was blocked from localhost PostgreSQL by the sandbox; its unsandboxed retry was not executed because automatic approval review hit a usage limit. Browser preview navigation timed out. Full regression and browser acceptance remain unverified.
- Temporary component-check route removed; no changes to the user's existing browser diagnostic session.

## Verification — 2026-09-11

- Full `pnpm build` passes, including all 38 web pages. Added required Suspense boundaries to teacher evidence, teacher Lotus evidence, and student Lotus routes.
- Focused classroom and personalized-video suites: 44 tests pass, zero failures. Coverage now includes rejection of browser-claimed independent exit completion when no persisted exit evidence event exists.
- Production classroom handoffs keep students in the live queue: diagnostic completion returns to `/student/classroom/live`, production teaching requires a signed student identity, hides demo-fill helpers, and completed teaching returns to the classroom queue instead of the old pilot report.
- Student home now exposes the live production classroom entry point directly, so signed-in students can move from `/student/home` to `/student/classroom/live` instead of being stranded in the older individual-practice/demo flow.
- Web BFF session/media routes mint or verify the existing HMAC token format without importing API/Nest access helpers into those route bundles. Lotus and personalized-video proxy routes now use the same web-local auth helper instead of importing API auth helpers.
- Next output file tracing is pinned to the repo root in web config, removing the multiple-lockfile root inference warning.
- Web CSS compatibility warnings for classroom/teacher flex alignment have been removed.
- Prisma schema validation passes against the current checked-in schema.
- `git diff --check` passes.
- Runtime acceptance remains unverified: current checks show no PostgreSQL response on `/tmp:5432` and no web/API listener on `localhost:3000` or `localhost:4000`. Docker is not installed, and an isolated local Postgres cluster under `/tmp` cannot initialize because this sandbox blocks the required shared-memory syscall. The visible `localhost:3002/student/home` instance is running from `/Users/dp/eduTeach/.claude/worktrees/cogna-teacher-report-528ac3/apps/web`, not from this active checkout, and therefore returns 404 for the new `/student/classroom/live` route. The checked-in migration has not been verified against a running database. Do not treat passing builds or mocked service tests as proof of the cross-device classroom workflow.
- Nonfatal build warning still present: the Next personalized-video proxy route imports the API service implementation, which pulls Nest internals into that route bundle. The build succeeds, but a cleaner future shape is to call the API over HTTP or split shared service code away from Nest exceptions.

## Shared AI delivery coordination (2026-10-28)

- Follow AGENTS.md for the active era; obsolete Cursor/operations guidance must not direct new work to an archived era.
- Preserve other chats' unfinished edits. Use one owner per task, one implementation writer per checkout and serialized edits to shared tracking/contracts.
- The public code repository must not receive private release planning. Local coordination tests are not product, live-model or scientific-validation evidence.
- GitHub Project fields are not atomic locks: use the designated coordinator for assignments; do not infer distributed locking from an owner field.

## Teaching-first contract amendment (2026-10-28)

The default pilot already auto-advances per student; class-wide diagnostic gates apply only when autoAdvance is false. Do not remove either mode when adding module learning. Preserve existing exit counts/attempt sealing and the five UI actions.

## Verified local staging during provider outage (2026-10-28)

Provider failure must gate model calls, not validated local content. Preserve content-exhaustion backoff, item verification, required-expression constraints and disable switches. Fresh-session assertReady and preparation limits still apply; do not promise complete outage operation from this staging fix.


## Typed-practice evidence and recovery — 29 October 2026

Use immutable-content hashes excluding progress; retain null/UNKNOWN context rather than inventing no help or retention. Preserve the assignment-row lock for both receipt and legacy aggregate writes. A lost acknowledgement must replay the same committed receipt. Browser pending storage is tab-scoped, bounded and not full offline support. Verification used actual UI/proxy/controller/service with disposable PostgreSQL, not production bootstrap; never run test harnesses against real students.


### Unsubmitted practice refresh correction — 29 October 2026

Draft storage must be namespaced by learner/assignment/item/content and bound to the last checked event. Pending immutable submissions take precedence. Never count locally recovered drafts as submitted learning evidence.


### Exercise and Lotus interaction context — 30 October 2026

Never treat hidden/offline time as attention or sum overlapping durations. No-input is null. Prior reason prompts and disabled previews must not start question clocks. Re-shown questions get fresh partial observations. New analysis must prefer actual confidence provenance over legacy Lotus60/idle0 defaults.


### Recovery, joined history and contextual support —30October2026

Preserve authoritative current delivery and answer reservations under the same session advisory lock/CAS. Do not replay stale cached teaching as authority. Quarantine permanent presentation failures without blocking valid later events. Bind support offer/choice/delivery/recheck to exact content; delivery retry must not issue new help. Withhold exit correctness until all required items seal; historical receipts cannot inherit changed prompts.

### Draft-process review correction — 2 November 2026

Draft checkpoints are ungraded, may be missing after rapid close/network failure, and can reflect notebook pauses or typing exploration. Keep local draft recovery separate from server evidence. Do not infer frustration, attention or mastery from edit counts or wall time; independently verified later maths and explicit learner reports are separate.

### Teaching-first reference module — 2 November 2026

The new path requires `MODULE_LEARNING_ENABLED=true` on the API and `NEXT_PUBLIC_MODULE_LEARNING_ENABLED=true` for home links; disabling creation preserves existing run reads/actions. Its `PRESENTED` receipt is a learner-client report, not proof of attention or comprehension. The server locks the run's start event before transitions; event IDs and expected revisions prevent duplicate advance. Keep exact content/package versions and preserve the old diagnostic flow. The browser keeps an unsaved answer and immutable pending action locally, but this is not general offline synchronisation. Use reviewed static slides during provider loss; never serve unchecked math.

Reserve independent items under a learner-scoped transaction lock; a repeat must not silently reuse the prior exit. If no reviewed item remains, report exhaustion and retain earlier work. Recheck current classroom ownership before teacher read/control actions; do not rely only on the original assigning teacher ID.

Class assignment uses one transaction across its target learners, with student locks acquired in sorted order. A depleted target rolls back the entire launch rather than leaving partial teacher work.
