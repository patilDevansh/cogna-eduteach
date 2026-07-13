# Cogna MVP 1.0 — 5-Minute Demo Walkthrough

> **Spec:** `/docs/mvp-1.0/` · **Skips:** [`SKIPPED.md`](./SKIPPED.md)

## What you're demoing

End-to-end vertical slice:

1. **Parent** signs up (dev stub) → creates student → gets access code  
2. **Student** logs in with code → baseline (12 questions) or adaptive practice  
3. **Learning loop** grades → diagnoses → decides → serves APPROVED bank content  
4. **Remediation** — wrong sign-handling answers → targeting → explanation → re-test  
5. **Session end** — student summary + revision proposals + parent report  
6. **Revision queue** — student sees due practice sets; parent sees plain-language summary  

---

## Prerequisites (one-time)

```bash
cd /path/to/eduTeach
docker compose up -d postgres          # or local Postgres on :5432
pnpm install
pnpm db:push && pnpm db:seed
```

Copy `.env.example` → `.env` if needed. For local dev:

```text
ALLOW_PENDING_REVIEW_QUESTIONS=true    # milestone bank includes PENDING_REVIEW in JSON
```

**Staging / pilot:** set `ALLOW_PENDING_REVIEW_QUESTIONS=false` (or unset) so only seed-marked **APPROVED** questions are served (~9 milestone IDs — see S001/S014).

---

## Start the stack (~30s)

**Terminal 1** (keep running):

```bash
ALLOW_PENDING_REVIEW_QUESTIONS=true pnpm dev
```

- Web: http://localhost:3000  
- API: http://localhost:3001/health  

**Seeded dev student** (after seed):

| Field | Value |
|---|---|
| Access code | `demo1234` |
| Student ID | `dev_student_001` (printed by seed) |

---

## Demo script (~5 minutes)

### 1. Parent flow (1 min)

1. Open http://localhost:3000 → **Parent login**  
2. Dev signup: any email + name → lands on dashboard  
3. **Add student** → note the **access code** shown once  
4. (Optional) Complete a session as that student, then **View summary** on dashboard  

### 2. Student baseline (2 min)

1. http://localhost:3000 → **Student login** → enter `demo1234`  
2. **Start baseline** — 12 fixed blueprint questions (not a permanent label)  
3. Answer → rate confidence (or skip) → optional hints  
4. Session ends at question 12 with “You answered 12 questions”  

**Spot-check:** Q1 is `12 + 9`; Q3 introduces a variable (blueprint order).

### 3. Adaptive + remediation (1 min)

1. From baseline intro, **Skip to practice** (or `/student/practice?mode=ADAPTIVE_PRACTICE`)  
2. On C2 subtraction items, submit a sign error (e.g. `4` on `x - 7 = 11`) twice  
3. System targets the misconception → after repeated misses, **explanation** appears  
4. Tap **Continue** → re-test question → correct answer resolves remediation  

### 4. Reports & revision (1 min)

1. **End session** or finish when decision says so  
2. Student: session summary; link to **revision queue** (`/student/revision`)  
3. Parent dashboard → **View summary** — plain language, uncertainty-aware copy  

---

## Run all test layers

```bash
# Golden — pure engines/contracts (no server)
pnpm test:golden

# CLI scenarios — API + DB journeys (API must be up)
pnpm test:scenario:all
# or individually:
pnpm test:scenario:baseline
pnpm test:scenario:targeting
pnpm test:scenario:session-end
pnpm test:scenario:revision
pnpm test:scenario:idempotent

# Thin UI smoke — routes + baseline API path
pnpm test:smoke:ui
```

**CI guidance:** golden always; scenarios when Postgres + API are up (`apps/api/test/scenarios/README.md`).

---

## Privacy defaults (MVP)

- **No student math sent to LLM providers** — question bank + templates only (QG bank-only)  
- **No unchecked LLM grading** — deterministic numeric/MCQ matcher  
- **Student UI** — no internal labels (mastery %, “overconfident”, raw concept IDs)  
- **Consent stub** recorded when parent creates student  

---

## Included vs skipped

| Included in MVP 1.0 | Skipped (see SKIPPED.md) |
|---|---|
| Dev parent signup + access-code student login | Clerk JWT auth (S015) |
| Baseline 12-slot + adaptive practice | POST /practice/skip UI (S016) |
| Tx1–Tx4 durability + idempotent `eventId` | Full ~200 APPROVED bank (S001) |
| Diagnostic + decision engines (versioned) | Payments / Stripe (S002) |
| Hints + explanations + re-test loop | Email report delivery (S007) |
| Session-end + parent reports + revision queue | Cron weekly jobs (S003) |
| ~9 milestone APPROVED questions (C2 path) | Formal CBSE math sign-off (S014) |
| Golden + CLI + thin UI smoke | PostHog/Sentry dashboards (S008) |
| | Client 15-min auto-end timer (S018) |

---

## Known blockers for external pilot

1. **S014** — human math review before non-dev deploy  
2. **S015** — production auth (Clerk)  
3. **S001** — expand APPROVED bank beyond milestone slice  

---

## Quick URLs

| Role | URL |
|---|---|
| Home | http://localhost:3000 |
| Student login | http://localhost:3000/student/login |
| Baseline intro | http://localhost:3000/student/baseline |
| Practice | http://localhost:3000/student/practice |
| Revision queue | http://localhost:3000/student/revision |
| Parent login | http://localhost:3000/parent/login |
| Parent dashboard | http://localhost:3000/parent/dashboard |
| API health | http://localhost:3001/health |
