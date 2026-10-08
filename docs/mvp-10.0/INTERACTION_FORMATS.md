# Games, micro-lessons and the lantern gate

Status: **implemented**. One kill switch for every game format: `COGNA_GAME_FORMATS=off`. The narration voice is the configured TTS provider (`COGNA_TTS_PROVIDER=cartesia` for the pilot).

This is the production version of the Interaction Lab prototypes (`claude.ai/artifact/RBikAZAKiZp9cEBdwfytXj`).

## The rule that keeps it honest

A game changes how a student **enters** an answer or how a question is **staged**. It never changes how the answer is **marked**.

- **Built by the server from a verified key.** Tile sets, game questions and micro-lessons are built by code. Every claim is re-derived with the exact algebra engine (`lotus-algebra.ts`) before use. Anything that fails returns null, and the plain question or lesson is used instead. No model writes any of it.
- **The browser sends picks, not answers.** For tile games, the server rebuilds the answer from the picks against the tiles it issued, then marks it with the existing code (`instantVerdict`, `taskVerdict`, `checkPracticeAnswer`).
- **No answer keys in any payload.** Tile sets, game options, Bit's papers, rush rounds and micro-lesson checks all reach the browser without their keys. The independent exit's expected answer is blank until every exit question is sealed.

## Diagnostic (Lotus)

| Game | Item | When | Server |
|---|---|---|---|
| Bracket bridge / Split it | FACTORISE item, answered with tiles | Turn 1, every repurposed turn (check, descent, widen), every 3rd turn | `lotus-interactions.ts`, `interaction-formats/tile-builder.ts` |
| Garden fences | Positive x² + bx + c, tiles | Easy trinomial slot; trinomial rewritten to avoid a sign gap | `lotus-probes.ts` |
| Firefly catch | CHOICE: the product–sum pair | Pair slot | `lotus-probes.ts` |
| Spot the impostor | CHOICE: the form that isn't equal | Verify-by-expanding slot | `lotus-probes.ts` |
| Detective | CHOICE over `lines`: the first wrong line | Re-check of taking out a negative factor | `lotus-probes.ts` |
| Fishing | SELECT (new item kind): net every fully factorised expression | "What factorised means" slot; re-check of factorising fully | `lotus-probes.ts`, `instantVerdict` |

- **Where game questions come from.** They are installed through the same writer queue as AI questions (`codeProbeFor` runs before the bank and the AI writer). They must pass `checkWrittenItem`, including covering the suspected mistake on a CHECK. They carry `origin: "CODE"` and `provenance: "CODE_BUILT_GAME"`, so observers never see them labelled AI-written.
- **Which questions stay typed.** Everything else keeps typed answers with working, which is the richest evidence.
- **SELECT marking.** The exact set is correct. Netting a wrong option logs that option's named mistake. Leaving a right one out has no named mistake, so the review decides what it means.
- **The pond and the bloom.** The page shows a pond progress map (a frog and a petal per answer) and "Your lotus bloomed" at the end. It never shows a score, and nothing in a game reveals right or wrong.
- **Read it to me.** `GET /lotus/sessions/:id/read-aloud` reads the current question with the configured voice (Cartesia), using `spokenMath` for the maths. It is cached per text and voice, and only reads what is already on the student's screen.

## Typed questions: the final answer is the evidence

Code names most mistakes from the final answer alone: every question carries the wrong answers its typical mistakes produce. Written working was only read by the background AI review, and only for wrong answers that match none of those mistakes. So typed questions no longer ask for it.

- **Working is optional.** A typed question shows the answer box and maths keys. Working sits behind "Add working (optional)", and anything written there still goes to the review. Switch: `LOTUS_WORKING_PROMPT` = `optional` (default), `lines` (the three working lines, shown) or `split` (each student gets one arm, fixed by a hash of their id, for the pilot comparison). The arm is stored on the session as `workingPrompt`.
- **"How did you get it?"** A wrong typed answer that matches none of the question's known mistakes gets one follow-up before the next question (`lotus-reasons.ts`). The choices are up to two of the question's own mistakes in the student's words (or one and "I knew the method but slipped up"), then "I wasn't sure what to do" and "I guessed". The browser gets only the words and opaque ids; the server rebuilds what each choice means from the question.
  - A named mistake or a slip is one negative on the skill: suspected, and only confirmed by a later question, like any other single mistake.
  - "I wasn't sure" is a support need (the planner checks an easier prerequisite).
  - "I guessed" records nothing about any skill.
  - It counts only if nothing (code or AI review) has explained that answer already. The choice is passed to later AI reviews.
  - `POST /lotus/sessions/:id/reasons` `{ studentId, questionId, optionId }`: one answer per follow-up (the same tap again is a no-op; a different one is `409`).
- **Checking by expanding is tested directly.** "Checks own answer by expanding" used to be confirmable only from later working, which students don't write. Its base question and every re-check, for either of its mistakes, are now Spot the impostor questions: all four forms share x² and the constant, so only expanding finds the impostor.

## Lessons

- **Targeted micro-lesson.** `micro-lessons.ts` and `MicroLessonCard`: 15–25 seconds, built from the student's own diagnostic answer, which is stored as `script.micro.brief` when the lesson is created. There are five templates:

  | Template | When it's used |
  |---|---|
  | Signs in the pair | Right numbers, wrong signs in x² + bx + c |
  | Equal but not finished | The answer is equal but still splits |
  | Common bracket | Both terms share a bracket |
  | Negative times a bracket | A sign slip expanding a negative factor |
  | Your answer vs the right one | Anything else |

  The maths moves on screen as a declarative script: highlights, arcs, tokens flying between rows. Each line is narrated in the theme's voice through `LessonNarrator.lines` (Cartesia: Sana, Kabir or Siya). One quick check follows, marked by `POST assignments/:id/micro-check`. It plays first on the lesson page, before the longer lesson.
- **New lesson visuals.** `tiles` (algebra tiles slide into a rectangle) and `number-line` (signed hops) are added to the authored-lesson catalogue, the AI prompt, the verifier and the Remotion `AuthoredLesson`. The verifier checks that the sides add to b and multiply to c, and that a number-line caption names where the walk actually lands.
- **Cartesia voice.** The pilot `.env` sets `COGNA_TTS_PROVIDER=cartesia`. Lesson beats, micro-lessons and read-aloud all use it.

## Practice

These are code-built formats, each with a server checker and verifier rules. They replace pair hunt and pick-from-three in the trinomial set.

- **Factor safe:** two dials with live product and sum lamps, and a named swapped-sign hint.
- **Make it a rectangle:** move x-strips between the side and the bottom until the corner fits. Positive trinomials only.
- **Marker's desk:** Bit the robot's papers. The algebra engine decides whether each paper is right. The student stamps it, then names the mistake (sign slip, forgot a term, not finished, wrong pair).
- **Bracket rush:** a 45-second round. Every option is classified by the engine when the round is built. Misses come back two questions later. Fluency only.
- **Build it:** a tile build with feedback.

## Independent exit: the lantern gate

- **Two questions.** The main exit question, plus a transfer question: same skill, different form (the other sign pattern), generated by code.
- **One attempt each, enforced on the server.** A second answer returns `409`, and an unknown question returns `400`.
- **Results open together.** Neither result shows until both are sealed, and the expected answers stay blank until then.
- **What counts.** Classroom completion requires both questions, and counts as right only if both are. The teacher roster shows "Alone, after the lesson: n of 2 right".
- **Storage.** `PersonalizedVideoEvent.exitItem` (migration `20261005120000_add_exit_item`) records which question an answer belongs to. Older rows count as question 0.

## Tests

- `test/golden/interaction-formats.v1.spec.ts` (40 tests): tile building and safety, tampered picks, the Lotus policy, every diagnostic game probe and its marking, SELECT marking, practice games, the one-attempt exit, the lantern gate.
- `test/golden/micro-lessons.v1.spec.ts` (9 tests): every template, check integrity, the new visuals in the verifier.
- `scripts/pilot-walkthrough/check-games.mjs`: end-to-end in the real app. A teacher makes a class, a student plays the diagnostic, micro-lesson, practice and exit; it screenshots every game.

## Still open

- **Calibration in the pilot.** Give children the same skill typed and as a game, and compare. Until the results agree, read game answers alongside typed ones.
- **Live waveform.** The micro-lesson waveform follows the voice's timing, not its actual loudness: measuring loudness needs the media served with CORS for Web Audio.
- **The prototype's Lotus side panel.** It is the existing observer audit view; the teacher's class report is the production version.
