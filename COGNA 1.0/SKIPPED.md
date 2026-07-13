# Cogna MVP 1.0 — Skipped (must revisit)

> **Living log of intentional deferrals.**  
> When you skip work during the 7-day build: **add a row here** (do not silently omit).  
> When you later complete it: move to **Resolved** with date, or strikethrough the open item.  
> Agents must update this file in the same turn as the skip decision (see [README.md](./README.md)).

## How to add an entry

```markdown
### S### — short title
- **Skipped on:** Day N / YYYY-MM-DD
- **Reason:** …
- **Return when:** …
- **Risk if ignored:** …
- **Owner hint:** eng / content / product
```

---

## Open skips

### S001 — Full ~200 APPROVED question bank
- **Skipped on:** Day 0 (plan freeze)
- **Reason:** Human CBSE review + authoring time; milestone only needs ~15–25 APPROVED items
- **Return when:** Before external pilot with 10–20 students
- **Risk if ignored:** Repetition, weak prerequisite coverage, frustrated learners
- **Owner hint:** content

### S002 — Payment / billing integration
- **Skipped on:** Day 0
- **Reason:** Account ownership model frozen; Stripe/etc. not required for simulated MVP
- **Return when:** Before paid launch
- **Risk if ignored:** Cannot convert trial parents
- **Owner hint:** product + eng

### S003 — Weekly/daily report jobs (cron)
- **Skipped on:** Day 0
- **Reason:** Session-end + parent-requested reports enough for week 1
- **Return when:** Pilot week 2 or post-MVP
- **Risk if ignored:** Parents only see reports if they open the app after sessions
- **Owner hint:** eng

### S004 — Multi-parent invite UX polish
- **Skipped on:** Day 0
- **Reason:** Schema supports `parent_student_links`; UI can be primary-parent-only first
- **Return when:** Pilot feedback requests second guardian
- **Risk if ignored:** Custody/guardian edge cases
- **Owner hint:** product

### S005 — PARTIALLY_CORRECT grading depth
- **Skipped on:** Day 0
- **Reason:** Normalized exact match covers MVP numeric/MCQ
- **Return when:** Short-answer / multi-part items added
- **Risk if ignored:** Over-penalize near-miss answers
- **Owner hint:** eng

### S006 — Symbolic CAS / algebraic equivalence
- **Skipped on:** Day 0 (spec decision)
- **Reason:** Explicitly out of MVP grading
- **Return when:** Post-MVP content needs expression equivalence
- **Risk if ignored:** None for current bank
- **Owner hint:** eng

### S007 — Email delivery of parent reports
- **Skipped on:** Day 0
- **Reason:** In-app summary sufficient for build week
- **Return when:** Pilot parents request email
- **Risk if ignored:** Lower parent engagement
- **Owner hint:** eng

### S008 — PostHog / Sentry full dashboards
- **Skipped on:** Day 0
- **Reason:** Structured DB events + basic logs first; wire vendors if time on Day 7
- **Return when:** Before pilot
- **Risk if ignored:** Weak product analytics in pilot
- **Owner hint:** eng

### S009 — Expand explanation templates to all concept×misconception pairs
- **Skipped on:** Day 0
- **Reason:** Seed templates cover critical path; full matrix is content work
- **Return when:** Parallel to bank expansion
- **Risk if ignored:** Fallback generic explanations
- **Owner hint:** content

### S010 — Mature `COGNA/` doc cleanup / deletion
- **Skipped on:** Day 0
- **Reason:** Already labeled future-only; deletion not required to build
- **Return when:** Docs hygiene pass post-MVP
- **Risk if ignored:** New chats might still open wrong files (mitigated by AGENTS.md + rules)
- **Owner hint:** eng

### S011 — Student email / password accounts
- **Skipped on:** Day 0
- **Reason:** Access code login is MVP path
- **Return when:** Older students need independent login
- **Risk if ignored:** Low for Grade 8 parent-bought MVP
- **Owner hint:** product

### S012 — A/B “targeted vs random sequencing” experiment harness
- **Skipped on:** Day 0
- **Reason:** Pilot research metric, not software acceptance
- **Return when:** Research pilot design approved
- **Risk if ignored:** Cannot scientifically claim superiority
- **Owner hint:** product + research

### S014 — Formal human math review of milestone question slice
- **Skipped on:** Day 0 / Day 1 close-out (2026-07-10)
- **Reason:** Seed marks 9 milestone IDs `APPROVED` for dev loop; CBSE math sign-off is human content work
- **Return when:** Before any non-dev/staging deploy or external pilot
- **Risk if ignored:** Wrong accepted answers or misconception patterns in production bank
- **Owner hint:** content

### S015 — Clerk JWT auth for parent/student
- **Skipped on:** Day 5 (2026-07-10)
- **Reason:** No Clerk keys in local env; dev stub uses `POST /parents/dev/signup` + `X-Parent-Id` header + access-code student login
- **Return when:** Clerk project keys available or pre-pilot hardening
- **Risk if ignored:** No production-grade auth until wired
- **Owner hint:** eng

### S016 — POST /practice/skip + skip UI control
- **Skipped on:** Day 5 (2026-07-10)
- **Reason:** Core practice loop shipped first; skip emits `QUESTION_SKIPPED` with no mastery evidence per spec
- **Return when:** Day 7 polish or pilot feedback
- **Risk if ignored:** Students cannot skip stuck questions in-session
- **Owner hint:** eng

### S017 — QG selection reasoning persisted to DB
- **Skipped on:** Day 4 (2026-07-10)
- **Reason:** Reasoning returned in API `studentMessage`; no `selection_metadata` table in MVP schema yet
- **Return when:** Analytics/replay needs DB audit trail
- **Risk if ignored:** Harder to debug question selection post-hoc
- **Owner hint:** eng

### S018 — Client auto session end at 15 min
- **Skipped on:** Day 5 (2026-07-10)
- **Reason:** Server Decision engine enforces 15-min limit; client has manual “End session” only
- **Return when:** Day 7 UX polish
- **Risk if ignored:** Session may continue until server rejects next answer
- **Owner hint:** eng

---

## Resolved skips

### S013 — Local DB migrate/seed blocked (disk space)
- **Resolved:** 2026-07-10 — disk freed; `brew install postgresql@16`; `db:push` + `db:seed` succeeded

