# Lotus — fast path architecture

**Status:** Historical first fast-path design, partially implemented by September 2026. The opener bank, server-side reserve, arithmetic routing, and deferred full analysis exist; the full design and cost estimates below are not verified outcomes. A live browser run reached Question 8 with one fast numeric transition and six slow algebra/symbolic transitions. The proposed next target is [`LOTUS_CONTINUOUS_DIAGNOSTIC.md`](./LOTUS_CONTINUOUS_DIAGNOSTIC.md).

This is the specific plan for how the next question appears quickly. It fills in section 5 of [`LOTUS_ARCHITECTURE.md`](./LOTUS_ARCHITECTURE.md), which stays the wider document covering syllabus grounding, the item bank, and evaluation.

---

## The idea in one paragraph

There are two kinds of time in the app. Time the student waits, and time the student works. Right now all our AI work happens while they wait. We are moving it to happen while they work. The AI is not getting faster — it still takes about ten seconds. It just takes them behind the student instead of in front of them.

---

## How it works

### Question 1

A good standard opener. No AI call.

For a brand new student we know nothing about, there is nothing to personalise from, so a personalised opener would be personalisation based on nothing. Keep a small set (5-10) and pick between them using whatever we do know — grade, class, time of year. If the student is returning, or we have prior evidence, then question 1 **is** personalised, because now there is something real to personalise from.

Question 1 is the least important question in the session. It exists to get evidence flowing. The personalisation compounds from question 2 onward.

### While the student solves

About 40 seconds of free time. In the background:

The AI prepares roughly 5 questions:

- one or two that would tell our current suspicions apart
- one harder, in case they are doing fine
- one easier, in case they are lost
- one spare

Every prepared question is checked before it can be shown, and is stored with its **correct working steps**.

The browser downloads these questions **with the answers stripped out**. Question text only.

### At submit

Three things happen at the same moment.

**The screen changes immediately.** The question is already in the browser. Nothing to download.

**The server scores the answer.** It compares the student's working steps against the correct ones we saved. The first number that does not match is where they went wrong. This is arithmetic, not AI. Milliseconds.

**The slow AI starts reading the working properly.** About ten seconds. Fine — the student is already on the next question.

### While they solve the next one

- The slow AI finishes and writes what it found into the student's record.
- The reserve refills. One question used, one made.
- Any prepared question that no longer fits is thrown out.

---

## The safety rule

**The fast path may only choose the next question. It may never write a conclusion.**

Only the slow, careful analysis can add anything to the student's record or report.

Choosing a slightly wrong question costs nothing — we ask another one. Writing a wrong conclusion about a child is serious. This is a structural rule, not a matter of being careful.

---

## How we decide what to keep ready

Not one question per possible mistake — there are too many.

Instead: **one question ready for each thing we currently suspect**, capped at three suspicions, plus one harder and one easier.

If we are chasing eight theories at once we are not diagnosing, we are guessing. Drop the weak ones.

One good question also kills several theories at once. Like twenty questions — you do not ask "is it a dog, is it a cat, is it a horse", you ask "is it an animal". A good question splits the possibilities.

This is what keeps cost flat. The number of questions we hold is driven by how many things we are investigating, not by how many mistakes exist in the world. It never grows into a tree of possible futures.

---

## Finding where they went wrong, instantly

We do not predict wrong answers. For a big question there are too many combinations.

Instead we store the **correct** working steps, which we get free when the question is generated.

```
Correct chain:  12  →  −21  →  −9
Student wrote:  12  →    5
                       ↑ broke here
```

Step 1 fine, step 2 broke. We know **where** without predicting anything.

- Costs nothing. The correct steps come out of the same call that writes the question — a few extra words in one response, not a second call.
- Works at any size. Longer chains are easier, more checkpoints.
- Works on any topic. No list of known mistakes needed.

*Where* they broke is enough to pick the next question. *Why* they broke is the slow AI's job.

**When there are no numbers** — working written in words, like "i did the bracket first then times by three" — arithmetic cannot help. Use a small fast model instead. Half a second, cheap, good enough to say "looks like a sign error". The big model still writes the record either way.

---

## Checking the question itself, not just the answer

Everything above assumes the question is correct. It might not be — the AI writes both the prompt ("Evaluate 3(4 − 7)") and the answer key (`expression: "3*(4-7)"`) in the same pass, and if it drops the bracket in the expression while leaving it in the prompt, we'd confidently grade the student against the wrong thing. Same numbers, wrong structure — the student could get `5` (skipped the bracket) and be told they're right, or `−9` (correct) and be told they're wrong.

The fix: pull a second expression straight out of the prompt's own wording — a completely different piece of text, parsed a different way — and require the two to agree before the question can ever be shown. Two independently derived answers to "what does this question actually ask," not the same one read twice.

```
Prompt:      "Evaluate 3(4 − 7)."          →  extracted: 3*(4 - 7)  =  -9
Answer key:  expression: "3*(4-7)"          →  key says:            =  -9
                                                                agree ✓

Prompt:      "Evaluate 3(4 − 7)."          →  extracted: 3*(4 - 7)  =  -9
Answer key:  expression: "3*4-7"  (bug)     →  key says:            =   5
                                                              MISMATCH ✗ — rejected
```

A question that mismatches is rejected wherever it's produced — as a reserve candidate, as the slow path's selection, as an observer's replacement — and there's one final backstop before any question becomes what's shown: nothing gets past it unverified.

Not every question can be checked this way — a word problem like "5 less than 3 times a number x" doesn't state its expression literally, so there's nothing to extract. That's an honest **can't check**, not a false pass — those questions go through unverified, same as before, rather than being wrongly rejected or wrongly trusted.

---

## Two checks, not one

Both run on **every** answer. Nothing is skipped and nothing gets a shallower treatment.

| | Answers | Speed | Used for |
|---|---|---|---|
| Arithmetic check | **Where** did they go wrong? | milliseconds | Picking the next question |
| Slow AI | **Why** did they go wrong? | ~10 seconds | Writing the record and report |

The slow AI is handed the arithmetic result, so it does not start cold. It is told *"step 2 broke, now tell me why."* Narrower job, so faster, cheaper and more accurate than working it out from scratch.

We are not trading depth for speed. Only changing when the depth arrives.

---

## The AI is still doing all the thinking

Worth being clear, because the plan is easy to misread as "we replaced the AI with arithmetic".

The AI still writes every question, shaped around this student's evidence. It still fully evaluates every answer including the written working. It still decides what to suspect and what should be sitting in the reserve.

The only change is **when** it thinks.

> Before: a teacher who reads the answer while the student sits watching, thinks about it, then writes the next question in front of them.
>
> After: the same teacher reads the previous work during the break, thinks just as hard, and walks in with five questions ready.

Same teacher, same thinking, same quality. The thinking happened before the bell.

The one step that is not AI is the split-second "which of these five do I hand over" — and even that follows a plan the AI wrote. The AI designs the menu. The instant check reads it.

---

## Where the decision happens

**Later design correction:** This section explains why the *first implementation* kept its reserve server-side. It is possible to stage a **server-authorized, prompt-only** question in the browser without sending the answer key. What cannot happen with zero network wait is choosing that prompt based on the answer being submitted at that same instant. The proposed continuous diagnostic design accepts a one-question adaptation delay and uses a syllabus-coverage fallback deck to guarantee immediate prompt display. The original reasoning below remains as implementation history, not as a claim that prompt-only staging is impossible.

**Correction (built version differs from the original plan here):** the original plan below said the browser would hold the next few questions so the screen could change with no network wait at all. We looked at actually building that and decided against it — not skipped, decided against, for a real reason.

The instant "where did they break" check needs the correct-steps chain to compare against. That chain *is* the answer key. There is no version where the browser can run the check itself without also holding the answer — the two requirements ("check instantly" and "never expose the answer first") are in direct tension, and the only way to get genuine zero-network instant is to give up one of them. We are not willing to give up either.

So what's actually built: everything stays server-side. The reserve, the instant check, the selection — none of it ever reaches the browser until a question is confirmed and ready to show, with no answer key attached. This means there is still one small network round trip on submit. What makes it fast is that the round trip contains **no AI call** — it's a tiny bit of arithmetic and a lookup, not a multi-second model pipeline. On a normal connection that's still on the order of the 100-200ms target; it just isn't zero.

The original text below is kept for context, with its "browser holds it" framing understood as not what got built:

~~The browser holds the questions so the screen can change instantly. It does not hold the answers.~~

~~The server decides for real at the same moment. If the two ever disagree, the server wins — but on the next question, never by swapping the one already on screen.~~

What *is* still true, and enforced in code:

- Answers, worked solutions, and the purpose of a question never reach the browser while a question is live — this is enforced server-side (see "Known problems," now fixed), not by a UI toggle.
- Scoring is always on the server. The browser displays, it never marks.
- A question already on screen is never silently swapped for a different one.
- Every question, however it's chosen, is independently cross-checked (see below) before it can ever reach `withQuestionId` — the actual chokepoint every question passes through before display.

---

## The useful gap

We are not making every transition instant. Sometimes the gap is a question.

> *"Before you move on — how sure are you about that?"*
> *"Which of these is closest to how you did it?"*
> *"In one line: why did you multiply there?"*

This turns dead waiting time into **more evidence** — and specifically the evidence we are short of, because reasoning is the thing we cannot check instantly.

It also buys the AI breathing room on the hard questions where it needs the most time.

Use it on consequential questions, go instant on easy ones. Pace becomes a decision, not a constant. An instant jump after a hard problem discourages reflection; a beat to think is not a flaw.

It gets boring if overused, and a fast clicker will skip it. It is not the whole answer, it stacks with everything else.

---

## Late analysis

Sometimes the analysis of answer 2 arrives after the student has finished question 4.

**Never edit the record. Only add to it.**

Every result carries a label saying which question it belongs to. The record is sorted by question number, not by arrival time. Late results slot into their place. Nothing can overwrite anything, because nothing is ever overwritten.

A question already on screen is never changed. Late findings affect the next question, not the current one.

If an answer arrives after the session has ended, do not finalise the report until the queue has drained. The student has already gone, so the extra seconds cost nothing.

---

## When nothing is ready

In order:

1. **Give up freshness.** Serve a good standard question instead of a custom one. Still correct, still instant, slightly less personal. Almost always the right trade.
2. **Give up personalisation depth.** Serve whatever generic-but-valid question is in the reserve.
3. **Give up speed.** Show an honest "checking your working" message. Not a spinner.

**Never give up:** server-side scoring, checking the maths before display, or the rule that the fast path cannot write conclusions.

---

## What this costs

Rough estimates, not measurements.

**Today:** four AI calls per answer, sometimes five. Plus four just to pick question one. An 8-question session is around 36 calls.

**After:**

| | Cost |
|---|---|
| Instant check | free — arithmetic, not AI |
| Slow analysis | 1 call |
| Refilling the reserve | about 1 call |
| Question 1 | free — standard opener |

Around 16 calls for an 8-question session.

The savings come from four separate things:

1. **Question 1 costs nothing now.** Four calls currently go on choosing a question before the student has done anything, when there is nothing to personalise from.
2. **Arithmetic replaces an AI call.** Finding *where* they went wrong used to need a model. The correct steps come free with generation.
3. **Merging stages.** Two AI calls become one.
4. **We only make questions we will probably use.** About five alive at a time, not a branching tree.

**Being honest about this:** preparing ahead does **not** save money by itself. It moves work earlier and wastes a little — some prepared questions never get used. Unused ones stay in the reserve for the next turn, so waste is maybe 20-30%.

Preparing ahead buys **speed**. The other three changes buy the **cost saving**. Do not report the speed win as a money win.

---

## What we must log from day one

We decided to build this first and measure afterwards. That works — once analysis is in the background, a four-stage pipeline costs money but no longer hurts the student, so we can afford to keep it running while we gather data.

**But it only works if we instrument now.** If we store only the final conclusion, we can never go back and ask whether the debate was earning its keep.

Log separately, every turn:

- **Each stage's verdict on its own** — primary assessment, challenger assessment, debate, closure. Separately, not merged. This is the one that answers "would one AI have been enough?"
- Whether the two assessments agreed
- Whether the debate changed the outcome
- Whether the closure changed the outcome
- Time taken by each stage
- Which question the fast path chose, and which the server would have chosen
- Reserve depth at every submit
- Questions prepared but never used
- How late each analysis was, in questions
- Tokens and cache hits per call
- How many questions to reach a conclusion, and how often we exit uncertain

The two questions this data must be able to answer:

1. **Is one AI enough, or do we need two?**
2. **Does delayed analysis make the diagnosis worse, or just later?**

Neither is answerable without the logs above.

---

## Things we might add later

**Two or three questions per screen.** Instead of one at a time. No waiting inside a screen at all, roughly halves the AI calls, and gives two to three times longer to think between screens. The cost is that question 2 cannot react to answer 1 — but the early questions are exploratory anyway and do not need to. Batch the exploring, go one at a time once chasing a specific suspicion. Simpler than the reserve and gets most of the same result. Parked for now.

**Streaming the question as it generates.** Rejected for questions — we cannot check the maths on a half-written question, and we do not show unchecked maths. May still be useful for showing progress.

**Reuse of validated questions.** Behind a toggle. Worth knowing: personalisation lives in *which question comes next*, not in the wording. A reused question on a fully personalised path is still personalised education. The expensive part (fresh wording every time) adds the least diagnostic value.

---

## Known problems — status

All of the below are now fixed in code, except the one still explicitly marked open.

- ~~**Answers are sent to the browser.**~~ **Fixed.** `currentQuestion`, the audit trail, and `liveProgress` are all redacted (no answer key, no `purpose`, no hypotheses) for the whole time a diagnostic is `ACTIVE`. They unlock once the diagnostic is `COMPLETE`, which is also when the "Show AI Lab" panel is meant to be looked at, not mid-solve. The demo auto-fill button now asks a small server endpoint (gated to demo student ids) instead of reading the key off the client.
- ~~**The maths is not independently checked.**~~ **Fixed.** Every candidate's `answerKey.expression` is now cross-checked against a *separately derived* expression, extracted straight from the prompt's own wording — not the same value trusted twice. A candidate that mismatches (same numbers, wrong structure — the exact "missing bracket" failure mode this was written to catch) never reaches a student: it's rejected at generation time, rejected again at selection time, and there's a final backstop at `withQuestionId`, the one chokepoint every question passes through before display. The opener bank itself is asserted clean at process boot — a bad hand-authored opener now fails loudly in dev/CI, not silently for a real student.
- ~~**Question 1 burns four AI calls.**~~ **Fixed.** Opener bank, zero calls.
- ~~**Sessions live in process memory and failed saves are silently swallowed.**~~ **Partially fixed.** Persistence failures are now logged loudly instead of vanishing (`persist()`, and the DB-load path in `requireSession`). The in-memory map is now bounded — a background sweep evicts idle sessions (completed ones after ~15 minutes idle, abandoned active ones after ~45) so a long-running process doesn't grow forever, and a session is never evicted while its latest write hasn't been confirmed durable, so this can't silently roll a session back. **Still open:** this is still a single process's in-memory map as the hot path, not a proper distributed session store — if a request lands on a different instance than the one holding a session hot in memory, it falls back to a DB reload, which works *if* every prior write actually landed in the DB, but there's still no true cross-instance coordination (locking, etc.) for concurrent writes to the same session from two instances at once. That's a bigger infra project than a fix-in-place.

**Also decided, not built:** the original plan for this document described a version where the browser holds upcoming questions so a click needs no network round trip at all. We looked at building that and concluded it can't be done without either leaking the answer key to the browser ahead of time, or breaking the "never silently swap a shown question" rule — see "Where the decision happens" above for why. What's built instead removes the AI call from the round trip but keeps one small network trip. This is a real, deliberate gap from the original aspiration, not an oversight.
