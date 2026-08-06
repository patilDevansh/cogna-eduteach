# Demo Students and Training

## Demo accounts (local)

| Role | How | Detail |
|---|---|---|
| Student | Access code **`demo1234`** | Seeded “Demo Student” (`dev_student_001`) |
| Parent | **Use demo parent** / `POST /parents/dev/demo-login` | Demo Parent linked to Demo Student |

Setup:

```bash
pnpm db:push && pnpm db:seed
ALLOW_PENDING_REVIEW_QUESTIONS=true pnpm dev
```

- Web: http://localhost:3000  
- API: http://localhost:3001/health  

Design preview (offline quiet-classroom mock):  
`cd testUI-claude && npm run dev -- -p 3100` (code **MATH42** offline; production path uses demo1234 on apps/web).

## What “training” means here

| Sense | Meaning |
|---|---|
| **Learner profile updates** | After each attempt, mastery / patterns / retention estimates update. This is always on. |
| **Shadow generation training corpus** | Verified generated items logged for quality and bank promotion — not “the product got smarter overnight.” |
| **Learned policy training** | Offline job from large production logs — **deferred** until volume exists (see MVP 5.0 skips). |

## Cognitive demo session (10 minutes)

1. Student login `demo1234` → Start baseline or Skip to practice.  
2. Answer **wrong** once → Not quite → confidence “I was sure” or “I guessed.”  
3. Use a **Hint**, then continue.  
4. If explanation appears: read steps → **Continue** / Got it.  
5. End session → parent demo login → Session summary + Weekly letter.  
6. With `LIVE_AGENTIC_GENERATE=true` and serve still `false`: bank is served; shadow logs should appear in API logs for ops.

## Stage 1 pilot gate

At least **one real child, real phone, observed live** — no automated gate replaces that.

See [`COGNA 2.0/DEMO_WALKTHROUGH.md`](../COGNA%202.0/DEMO_WALKTHROUGH.md).
