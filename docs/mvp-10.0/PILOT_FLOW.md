# MVP 10.0 amendment: the pilot flow

**Status:** Active. Amends `README.md` steps 5 and 7 for pilot runs, at the product owner's direction (2026-10-01).
**Why:** the pilot exists to convince schools to partner with Cogna. A teacher should press one button and see the whole loop happen, so students must not wait on the teacher, or on each other, between stages.

## What changes

| README (frozen) | Pilot runs (`config.autoAdvance`, default on) |
|---|---|
| 5. The teacher launches teaching only after every diagnostic is complete. | Each student's lesson opens the moment **their** diagnostic finishes. No teacher action, no waiting for the class. |
| 7. The teacher launches the exit only after teaching completes. | Each student's independent exit opens the moment **their** lesson and practice finish. |
| (No time box) | The factorisation diagnostic ends at **15 minutes**, or **early once Lotus confirms a starting point**. |

A run created with `config.autoAdvance: false` keeps the frozen teacher-gated lifecycle exactly. All other contract rules are unchanged: deterministic marking is authoritative; diagnostic, practice and exit evidence stay separate; practice and lessons are never counted as mastery; no unchecked LLM maths reaches students.

## The flow

```
Teacher                         Each student, on their own                     Server
───────                         ──────────────────────────                     ──────
Create class → join code
                                Sign in → enter class code ───────────────────▶ enrol
Release Lotus diagnostic ─────────────────────────────────────────────────────▶ DIAGNOSTIC assignment per student
                                                                                 (late joiners get one on join)
                                Diagnostic (≤ 15 min, or stops at starting point)
                                Report → lesson created ──────────────────────▶ complete DIAGNOSTIC
                                                                                 → open TEACHING (or SKIP if no gap)
                                AI-written lesson (verified) → animated practice
                                                              ────────────────▶ complete TEACHING (practice read server-side)
                                                                                 → open INDEPENDENT_EXIT
                                One fresh question, no hints ─────────────────▶ complete EXIT (marked by algebra engine)
Live console: roster, class                                                      run COMPLETE when nothing is open
results, gap groups, progress ◀──── polls every 3 s ──────────────────────────── class report from stored evidence
```

## Components

| Concern | Where | Kind |
|---|---|---|
| When the diagnostic stops | `apps/api/src/lotus/lotus-factorisation.ts` → `factorisationStopReason` | Pure rule, tested |
| Applying it per answer | `lotus.service.ts` → `resolveFactorisationTurn` (reason goes into the report's limitations) | Service |
| Which stage comes next | `apps/api/src/classrooms/pilot-flow.ts` | Pure rules, tested |
| Opening the next stage | `classrooms.service.ts` → `advance` (called from `completeAssignment`; returns `next`) | Service |
| Late joiners | `classrooms.service.ts` → `join` | Service |
| Class results | `apps/api/src/classrooms/class-report.ts` → `buildClassReport` (loaded by `classReport`) | Pure aggregator, tested |
| Teacher console | `apps/web/src/app/teacher/sessions/` | Page |
| Student's next step | `apps/web/src/app/student/classroom/live/` + `classroomAssignmentHref` in `lib/api.ts` | Page |
| Lesson → practice → exit | `apps/web/src/app/student/personalized-video/` (uses the `next` returned by the server) | Page |

AI lesson writing runs as one background job per lesson. The job is claimed atomically before the model is called, so two workers can't each write a lesson and overwrite each other mid-practice. A claim older than 10 minutes counts as a crashed run and may be taken over (`AUTHORING_LOCK_MS`).

The server is the only authority on progression. Pages show what the server returns and follow the `next` assignment it hands back. They never decide a stage is done.

### Stopping rule

- **Time limit:** 15 minutes (`LOTUS_TIME_LIMIT_MINUTES`). The test ends at the first answer after the limit.
- **Starting point found:** at least 8 answers, the most foundational confirmed gap exists, and every skill it depends on has been tested and is secure. More questions wouldn't move the starting point lower. If a prerequisite is untested or shaky, the plan keeps probing.
- Otherwise the planned test runs to its end, as before.

### Class report

Built only from stored evidence: Lotus records, lessons and their practice attempts, and exit events.

- **Students:** stage (joined → diagnostic → lesson → exit → done), starting point, questions and minutes, lesson practice score, and exit result.
- **Gap groups:** "need a bridge in X" with the students in each group, largest first, and how many were right on their own afterwards.
- **Skill map:** secure, unsure and gap counts per skill across the class.
- **Progress:** *Improved* only when the independent exit is right. Practice never counts.

## Not in the pilot (full Cogna, later)

Whole curriculum, teacher input by web or WhatsApp, retention and forgetting curves, next-day reports, peer and parent nudges, teacher chatbots. See the product memory and `COGNA/` vision docs. None of these is built here.

## Open decisions

- **Student identity:** students sign in with an access code, then join with the class code, because the class code alone deliberately doesn't identify anyone. A Kahoot-style "class code + name" join would remove a step for schools, but weakens identity. This is the product owner's call.
- **Idle at 15 minutes:** the limit is applied on the next answer. A student who stops answering stays "in progress" until they submit.

## Recording the walkthrough

`scripts/pilot-walkthrough/` records the whole flow with one teacher and three students in separate browser profiles (`record.mjs`), then edits the clips into one video (`video/`). Student answers are scripted through dev-only endpoints, which are guarded by `NODE_ENV !== "production"`, `COGNA_WALKTHROUGH_FILL=true` and `walk_*` account ids. Everything Cogna does in response is live.

```bash
node scripts/pilot-walkthrough/seed-students.mjs      # reset the three walk_* students
node scripts/pilot-walkthrough/record.mjs             # real GPT (needs OpenAI credit); add --fake for the free stand-in
node scripts/pilot-walkthrough/video/render.mjs       # edits the newest complete run into out/cogna-pilot-walkthrough-*.mp4
```

Each run is kept in `out/runs/<timestamp>/`. Only a run where every student finished is rendered, unless you pass `--force`.
