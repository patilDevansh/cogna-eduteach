# Lotus Factorisation — handoff for testing

**For:** Codex (tester)
**From:** Claude (builder), 18 September 2026
**Branch:** `codex/2026-08-12-improvements` (nothing committed yet — all changes are in the working tree)

This is a new diagnostic topic inside Cogna Lotus: a Grade 8 factorisation test that finds exactly where a student's factorisation breaks down. Please test it hard and report anything that doesn't match what this document promises. The design is in `FACTORISATION_SKILL_MAP.md` (sections 4, 5, 6 and 8).

---

## 1. The architecture in one page

**The problem it solves.** We wanted three things that fight each other: the next question must appear the instant the student presses Submit, every student must get their own questions, and every question must be checked before a student sees it. AI writing takes 4–20 seconds per question, so it can't happen on Submit.

**The answer: a planned test that is built early and changes quietly.**

1. **A skeleton of 25 questions, one per skill slot.** The slots come from a skill map of 31 factorisation skills (common factors, grouping, the identities, trinomials, factorising fully, cancelling), plus foundations underneath (HCF, signs, powers, expanding).
2. **Q1 starts with a fixed, checked opener fallback** (4 versions; the student's id picks one), while an AI version is prepared. The fixed item is used only if generation fails or the preparation timeout is reached.
3. **At start, all 25 slots have a checked fallback**, so there is always a safe question available. The student-facing test waits until 10 AI-written questions are ready.
4. **The AI writes this student's own version of every question, including Q1**, in order, 4 at a time. Each one must pass code checks before use (section 3). If it passes before the student begins, it replaces the fallback. If the AI fails twice, the checked fallback stays.
5. **On Submit, code marks the answer instantly**: right, wrong, or "equal but not finished" (e.g. `3(x² − 4)` for `3x² − 12`). If the answer matches one of the question's predicted wrong answers, code knows the mistake and the skill straight away.
6. **The AI reviews the working in the background**, using the same 4-stage pipeline as the brackets topic: two reviewers, a debate, and a closing call. We keep both reviewers for now so the stored data can show whether one AI is enough. The AI only says *which step* went wrong. Each step of every question is tagged with a skill, so the step maps to a skill. The AI can never overrule code.
7. **A skill ledger, built from every answer in order:**
   - one mistake → **SUSPECTED**
   - the same skill wrong again on a later question → **CONFIRMED**
   - right on a later question → **cleared** (it was a slip)
   - a confirmed gap stays confirmed.
8. **The unseen part of the test is re-planned** after every answer and whenever a background review lands:
   - Every suspicion gets a later question that can confirm or clear it, and that question is protected.
   - A **confirmed** gap:
     - removes later questions whose main skill depends on it
     - has the AI rewrite questions that only touch it in a side step
     - uses freed turns to **go down** to up to 2 untested skills underneath
   - **The question the browser already holds for the next Submit is never changed** by background work.
9. **The report:**
   - confirmed gaps, starting from the deepest one
   - strengths
   - suspected-but-unconfirmed areas
   - removed questions listed as **"not tested — depends on X"**, never as wrong
   - skill-by-skill states.
10. **No early exit.** The test runs until the plan runs out. A gap has to be seen twice to count, so "confident after 2 questions" can't happen.

---

## 2. What was built (files)

All paths are relative to the repo root. Other sessions also have uncommitted changes on this branch. The files below are the ones for this work.

### New files

| File | What it does |
|---|---|
| `apps/api/src/lotus/lotus-algebra.ts` | Exact algebra checker. Parses an expression into polynomials and answers: is it equal (cross-multiplying for fractions)? Is it fully factorised? Are these the same factors in any order, up to sign? Verdicts: CORRECT, UNFINISHED (with a reason), INCORRECT, UNREADABLE. |
| `apps/api/src/lotus/lotus-factorisation-catalogue.ts` | The 31 skills with dependencies and mistake codes, the 25 slot specs with a fixed fallback question each, 4 openers, and 13 fixed foundation questions. **Every fixed question is proven by code when the module loads.** If one is wrong, the server refuses to start. |
| `apps/api/src/lotus/lotus-question-factory.ts` | The AI writes one question from a slot spec; code checks it; worded questions go to a blind second AI. Up to 2 attempts, then it gives up. |
| `apps/api/src/lotus/lotus-factorisation.ts` | Pure logic, no AI: `instantVerdict`, `evidenceFromAnalysis`, `foldLedger`, `planAdjustments`, `nextOpenTurn`, `buildFactorisationReport`. |
| `apps/api/test/golden/lotus-algebra.v1.spec.ts` | 35 checker tests, built from real AI-written answers. |
| `apps/api/test/golden/lotus-factorisation.v1.spec.ts` | 26 tests of the ledger and re-planning rules. |
| `apps/api/test/golden/lotus-factorisation-session.v1.spec.ts` | 19 end-to-end tests through `LotusService` with a fake AI: 3 full persona runs, the instant-Submit check, redaction, idempotency, a frozen next question, END_NOW, the factory's checks, and the x² display. |
| `apps/api/src/lotus/lotus-coverage-plan.ts` | **Restored**, not new: its source was missing and broke compilation. Recovered from `dist/`. It belongs to the brackets topic. |

### Changed files

| File | Change |
|---|---|
| `packages/shared/src/contracts/lotus.ts` | New types:<ul><li>`LotusTopic`</li><li>`LotusItemDiagnostics` (inside `answerKey`, so redaction removes it)</li><li>`LotusSkillEvidence`, `LotusSkillSummary`, `LotusSkillState`</li><li>`VERIFIED_UNFINISHED`</li><li>`DETERMINISTIC_ALGEBRA`</li><li>`firstWrongStep` / `mistakeDescription` on the closure</li><li>`notTested` / `skills` on the report</li><li>`skillEvidence` on an audit</li><li>`topic` on the session</li></ul> |
| `apps/api/src/lotus/lotus.service.ts` | Factorisation branch:<ul><li>`start(studentId, topic)` and `startFactorisation`</li><li>`buildSkeleton` and a per-session write queue (4 at a time; plan changes jump the queue; stale results are thrown away by a version number)</li><li>`resolveFactorisationTurn`, `adaptFactorisationPlan`, `applyPlanAction`, `completeFactorisation`</li><li>background-review hook</li><li>redaction in `publicCopy`</li><li>demo-fill personas</li><li>END_NOW report</li><li>REPLACE_QUESTION refused for this topic</li></ul> |
| `apps/api/src/lotus/lotus.dto.ts`, `lotus.controller.ts` | Optional `topic` on `POST /lotus/sessions` (`BRACKETS` or `FACTORISATION`). |
| `apps/api/src/lotus/lotus-prompts.ts` | `lotusPolicy(topic)`: a factorisation context, and a closure that returns `firstWrongStep` and `mistakeDescription`. |
| `apps/api/src/lotus/lotus-model.service.ts`, `lotus-latency-policy.ts` | `writeQuestion` (primary model) and `solveBlind` (challenger model) calls. |
| `apps/web/src/lib/api.ts` | `startLotusSession(studentId, topic?)`. |
| `apps/web/src/app/student/lotus/page.tsx` | `?topic=factorisation` start screen, "Question N of M" (shrinks when questions are removed), no 20-minute cut-off for staging, and report sections "Not tested" and "Skill by skill". |
| `apps/web/src/app/student/home/page.tsx` | "Lotus: factorisation" button next to the Lotus demo. |
| `COGNA 10.0/FACTORISATION_SKILL_MAP.md` | Section 8: how it runs now. |

The brackets topic is unchanged when no topic is given.

---

## 3. How a question is checked before a student sees it

- **Maths (factorise / simplify):**
  - the answer key must be exactly equal to the expression, checked symbolically, not by trying numbers
  - the key must be fully factorised
  - every predicted wrong answer must really be wrong, or "equal but unfinished" with an unfinished-type mistake code
  - the prompt must show the expression
  - the question must not repeat anything already in this student's test
  - there must be at least 2 predicted wrong answers (fewer only if the slot has fewer mistakes listed)
- **Multiple choice:**
  - 4 distinct options
  - the key is one of the options
  - each predicted mistake is a wrong option
  - a second AI answers it blind and must pick the key
- **Rewrites that avoid a confirmed gap:** no step may still need the broken skill.

---

## 4. How to run it

- **Env** (root `.env`, already set up):
  - `LOTUS_EXPERIMENTAL_ENABLED=true`
  - `LOTUS_STANDALONE_DEMO=true`: sessions live in memory only, so an API restart wipes them
  - `LOTUS_OPENAI_MODEL=gpt-5.6-terra` (writer, primary reviewer)
  - `LOTUS_CHALLENGER_MODEL=gpt-5.6-sol` (blind solver, challenger)
  - `OPENAI_API_KEY` is real. **Never print it or overwrite `.env`.**
- **Servers:** `.claude/launch.json` has `api` (port 3001, `nest start --watch`) and `web` (port 3000, or another port if 3000 is taken).
  - **Warning:** the API runs in watch mode. Saving any file under `apps/api/src` restarts it and wipes every in-memory Lotus session.
- **In the browser:**
  - The student login page needs a practice code. For the demo, set `localStorage.cogna_student = {"studentId":"demo_aarav","name":"Aarav Choudhury"}`.
  - Then open `/student/lotus?topic=factorisation&observer=1`. Start mints the signed demo token itself.
  - The "Fill demo response" button asks the server for a persona answer:
    - `demo_aarav` makes sign mistakes
    - `demo_meena` makes grouping / "is it factorised?" mistakes
    - `demo_rohan` stops early
    - `demo_divya` and `demo_kabir` answer correctly
- **Through the API directly:**
  - Mint a token with `POST <web>/api/session/student {"studentId":"demo_aarav","name":"Aarav"}`.
  - Then call `http://localhost:3001/lotus/...` with the headers `x-cogna-role: student`, `x-cogna-student-id`, and `x-cogna-student-token`.
  - Endpoints:
    - `POST /lotus/sessions {studentId, topic:"FACTORISATION"}`
    - `GET /lotus/sessions/:id`
    - `POST /lotus/sessions/:id/answers {studentId, answer, working, confidence, responseTimeMs, didNotKnow, submissionId, questionId, nextQuestionId}`
    - `GET /lotus/sessions/:id/demo-fill?studentId=`
    - `POST /lotus/sessions/:id/override {studentId, action}`
- **API log lines to watch:**
  - `Factorisation write <session> turn N <purpose>: USED|REJECTED|STALE|DUPLICATE in X ms` (with rejection reasons)
  - `Factorisation plan <session> turn N: SKIP|REPURPOSE ...`

### Automated tests

```bash
cd apps/api && node --import tsx --test test/golden/lotus-*.spec.ts
```

The result was **111 / 111 passing**.

```bash
pnpm --filter @cogna/api exec tsc --noEmit -p tsconfig.json
```

```bash
pnpm --filter @cogna/web exec tsc --noEmit -p tsconfig.json
```

Both typechecks are clean.

**Already failing, unrelated to this work:** running *all* golden tests (`test/golden/*.spec.ts`) gave 79 failures. They are all in `diagnostic-v2-*` specs, where the Prisma transaction has no `diagnosticV2EvidenceRecord` because `packages/database/prisma/schema.prisma` has uncommitted changes from another session. There is also one Remotion render test (`lesson-video-render`). None of them touch Lotus.

---

## 5. What to test — checklist with expected behaviour

### A. Instant questions

- [ ] `POST /lotus/sessions` with FACTORISATION returns a preparation response with Q1 plus 24 staged fallbacks; the student UI waits for 10 AI-written questions before revealing Q1.
- [ ] On every answer that sends `nextQuestionId = upcomingQuestions[0].id`, the returned `currentQuestion.id` equals it. The submit takes milliseconds, and no AI call happens on the request path.
- [ ] Within about 60–90 s of start, most `upcomingQuestions` prompts change from the fixed versions to AI-written ones. Watch the `Factorisation write` log lines.
- [ ] Race: take `upcomingQuestions[0].id`, wait for an AI write to replace that turn, then submit with the *old* id. It must still be accepted (old versions stay authorized).
- [ ] An id the server never offered for the next turn → 400 "not authorized".

### B. Nothing leaks while the test is active

- [ ] While ACTIVE, no response contains any of these:
  - `canonicalAnswer` text (it must be `""`)
  - `workedSolution` lines
  - `diagnostics`, `predictedMistakes` or `stepSkills`
  - `skillEvidence`
  - the server-side `factorisation` plan object
  - a non-empty `questionSelection.reason`

  Check `currentQuestion`, `upcomingQuestions`, `openingAudit` and `audits[]`.
- [ ] Past turns' own question, response and verification *are* visible. The verification text must not name a mistake code.
- [ ] After COMPLETE, everything is released: `skillEvidence` on audits, and `finalReport.skills` / `notTested`.
- [ ] `demo-fill` for a non-demo student id → 403. Another student's session → 400.

### C. Marking (code)

- [ ] Equivalent forms are CORRECT:
  - factors in any order
  - `(x + 5)(x + 5)` vs `(x + 5)²`
  - `−4(x + 2)` vs `−(4x + 8)` handled sensibly
  - `x²` vs `x^2`
  - `−`, `×`, `·`, spaces
- [ ] Unfinished answers are `VERIFIED_UNFINISHED` with the right mistake:
  - `2(6x + 9)` → COMMON_NOT_HIGHEST
  - `3(x² − 4)` → INCOMPLETE_FACTORISATION
  - `2y(x + 1) + 3(x + 1)` → SUM_ACCEPTED_AS_FACTORISED
  - `(2x + 4)(x + 3)` → SKIPPED_COMMON_FACTOR_CHECK
- [ ] Words, or garbage like "banana" → UNREADABLE, handed to the AI.
- [ ] A quick skip (didNotKnow, under 15 s, nothing written) → no evidence, no AI review, counted in `fastSkips`.

### D. Ledger and re-planning

- [ ] One mistake never produces a confirmed gap, and the report never says SOLID_GAP from one mistake.
- [ ] Second mistake on the same skill → CONFIRMED. A later correct answer → cleared, with "looked like a slip".
- [ ] After a confirmation:
  - dependent later questions disappear from `upcomingQuestions`
  - "Question N of M" shrinks
  - up to 2 foundation / "going down" questions appear
  - removed ones appear in the report under "Not tested"
- [ ] A background review that lands late never changes `upcomingQuestions[0]`, only later items.
- [ ] Persona runs to try:

  | Persona | Expected outcome |
  |---|---|
  | `demo_divya` | 25 questions, ADVANCEMENT |
  | `demo_aarav` | sign-related gap confirmed |
  | `demo_meena` | "what factorised means" gap; many later questions removed |
  | `demo_rohan` | "take out the full common factor" / "factorise fully" gaps |

### E. Other

- [ ] END_NOW ends with a report whose first limitation says how many questions were reached. REPLACE_QUESTION → 400 for this topic.
- [ ] The brackets topic (no `topic` field) behaves exactly as before, including its existing tests.
- [ ] The web page shows:
  - the factorisation start screen
  - the counter
  - an instant next question on Submit
  - the report sections

  Check the report sections in dark mode and at phone width too.

---

## 6. Known problems and limits (please confirm or refute)

**The two most important ones came from the live run (section 7):**

A. **A suspicion can be "cleared" by a question that couldn't show the mistake.**
   - Aarav got "product 18, sum −9" wrong (a sign mistake, Q12).
   - Then he got `x² + 6x + 5` right (Q13). It has only plus signs, so it can't show a sign mistake.
   - The ledger still cleared the suspicion as a slip, and the report calls "two numbers with a given product and sum" *secure*. That is exactly his real problem.
   - His sign mistakes on Q14–15 were then pinned on "factorising x² + bx + c" instead, because `ownerOfMistake` prefers the question's main skill.
   - The skill map's own worked example (section 5 of `FACTORISATION_SKILL_MAP.md`) says this must not happen.

   **Suggested fix:**
   - In `foldLedger`, a later right answer clears a suspicion only if that question could have shown the same mistake: its predicted mistakes include the code, or the structure allows it (e.g. a negative middle term for sign mistakes).
   - When both the main skill and a tagged skill own a mistake code, prefer the more basic one.

B. **The AI reviews can't keep up with a fast student.**
   - Each review took 27–71 s (4 AI calls in a row), and they run one at a time per session.
   - With an answer every ~26 s, 10 of 25 reviews were still pending at the end, and the last Submit waited the full 20 s before the report.
   - Code's instant marking carried the whole diagnosis this time, so the report was still right. But the AI's reading of the working was missing for the last 10 answers.

   **Options:**
   - Run reviews for different answers in parallel. They only need earlier answers' *instant* evidence.
   - Use one reviewer instead of two when the answer is correct.
   - Skip the review when code already explained the answer.

**The rest:**

1. **A wrong option can mislabel its mistake.** In the live run, the AI wrote "3 and 4" as the sign-mistake option for "product 18, sum −9". The real sign mistake is "3 and 6", and 3 × 4 isn't even 18. Code only checks that a wrong option is wrong, not that it matches its claimed mistake. A student choosing it gets tagged with that mistake anyway.
2. **The AI sometimes writes harder than the slot asks.** For example, `6x²y + 9x` for an "easy" slot. Nothing checks difficulty.
3. **Fixed after the live run:** powers showed as `x^2` in AI-written prompts. Prompts and options now show `x²` (`prettyPowers` in `lotus-question-factory.ts`), and machine fields keep `^`. The live run in section 7 happened *before* this fix.
4. **Background reviews run one at a time per session.** This is problem B above.
5. **Cost:** an AI review on every answer means 4 calls × up to 25 answers, plus about 24–48 writes and a blind solve per worded question.
6. **Memory-only:** the write queue, and all sessions in standalone demo mode, live in memory. With a real database, the plan is saved inside the session payload, but that path hasn't been tested against a real DB.
7. **Not built:**
   - stretch (non-monic) questions
   - ending early after many quick skips (they're just not counted)
   - REPLACE_QUESTION for this topic
8. **Confirmation rule:** any second mistake on the same skill confirms it, even a different mistake code. This was a deliberate choice, but please check it doesn't over-confirm.
9. **Pages never checked with this topic:** the post-test "Start the learning path" link and the personalized video that's created on COMPLETE were built for brackets.

---

## 7. Live run with the real AI (demo_aarav, one answer every 25 s)

This run went through the real API (`gpt-5.6-terra` and `gpt-5.6-sol`), using Aarav's demo answers (he makes sign mistakes). The browser-like client polled every 2.5 s and always sent `upcomingQuestions[0]` as the next question.

| What | Result |
|---|---|
| Start (Q1 + 24 staged) | 510 ms |
| First AI-written question arrived | 5.6 s after start |
| Questions answered | 25 of 25 |
| Next question was the one the browser already held | **25 of 25** |
| Submit time | median 13 ms; all under 40 ms except the last one (20 s, waiting for reviews) |
| Questions the student saw that the AI wrote for them | 23 of 25 (the other 2: the fixed opener, and a fixed "going down" question) |
| AI reviews finished by the end | 15 of 25 (see problem B) |
| Review time per answer | 27–71 s |

**How the test changed as it went:**

- **Q5:** he kept the wrong signs when taking out −6, so negative common factor became *suspected*.
- **Q12:** he picked "3 and 4", so pairs became *suspected*. Q13 (all positive) was right, so it was wrongly *cleared* (problem A).
- **Q14–15:** he wrote `(x + 4)(x + 5)` for `x² − 9x + 20` and `(x + 5)(x − 4)` for `x² − x − 20`, so trinomials were *confirmed*. Q15 was kept even though it depends on the gap, because the browser already held it. That is correct.
- **After the confirmation:**
  - The AI **rewrote** the later "common factor, then a trinomial" question as `3x² − 27`. It tests factorising fully without needing trinomials.
  - A "going down" question on expanding two brackets was added at the end.
- **Q17:** grouping with a minus became suspected, so the plan **added re-checks**:
  - Q22 (grouping with a minus): wrong again, so confirmed.
  - Q23 (negative common factor): wrong again, so confirmed.

**Final report:**
- Outcome: SOLID_GAP.
- Starting point: "factorising x² + bx + c".
- Confirmed gaps: trinomials, negative common factor, and grouping with a minus.
- Every other skill: secure.

All three confirmed gaps are the same underlying sign problem. That's right about Aarav, but the report should say it more directly (see problem A).

The script and this run's full output are in `COGNA 10.0/lotus-live-run/`. To repeat the run with another persona:

```bash
node "COGNA 10.0/lotus-live-run/live-factorisation.cjs" demo_meena 25000 http://localhost:<web port>
```

It needs the API on port 3001 and the web app running, because the web app is what mints the demo token. A full run costs roughly 150 AI calls.
