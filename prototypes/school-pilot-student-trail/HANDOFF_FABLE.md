# Handoff to Fable: Cogna school pilot

**What we want from you:** architecture help, better lesson UI and animation, and an honest review of our pilot scope.

You're picking this up from a long working session. Read all of this before answering. If you have the repo, the file map at the end tells you where to look. If you don't, this document is enough on its own.

---

## How to answer

- **Style:** plain English for product and strategy talk. Use code, file or table names only in the architecture section.
- **Recommend, don't survey.** For each section, give your top 3–5 recommendations, ranked. For each one, give one line of why and an effort size (S/M/L).
- **Open with a verdict:** one paragraph saying whether we're doing the right thing and the single biggest change you'd make.
- **Formats we'd like:**
  - Architecture: a text component diagram and a schema sketch.
  - Animation: storyboard tables with columns for scene, what's on screen, the narration line, what the student does, and seconds.
- **Challenge decisions openly.** If you disagree with a decision in section 4, say so clearly and explain why. Don't silently design around it.

---

## 1. What Cogna is

Cogna is a maths learning product for Indian school students (CBSE). The core is **diagnosis plus learning**:

- **Lotus** is the diagnostic check-in. It's an adaptive test that finds what a student has secure, what's shaky, what's missing, and which *mix-ups* (consistent wrong ideas) they have.
- **Core Skill Map:** Lotus is only the start. Every later interaction (lessons, practice, games) updates one skill map per student.
- **Lotus question rule:** questions are AI-written or come from a question bank, never hardcoded in code. Right or wrong is decided by fixed rules, not by the AI. The report waits for the AI's analysis; there is never a rules-only final report.
- **"Shaky until two":** after a student has shown doubt, one right answer only makes a skill *shaky*. It takes two rights to call it *secure*.
- **The textbook is a reference, not a gate.** Our own skill map can go beyond the NCERT book, and we see that as a strength.

The long-term vision includes parents, WhatsApp nudges and retention. That comes later. **The pilot's job is to win school partnerships.**

## 2. The pilot scope (decided)

1. **The diagnostic.** A whole grade 8 CBSE maths class (for example, section 8-B with about 32 students) takes Lotus on everything taught June–December. The school gets a detailed class report, and each student gets their own report.
2. **Two weeks of teaching.** Cogna then teaches the **next topic in the school's plan: Area** (from *Ganita Prakash* Part 2, the new NCERT book) for **10 school days, in class**.
3. **The growth proof.** On day 10 the class retakes a check-in, and we show the school the growth: Day 0 vs Day 10, per student and for the class.
4. **The teacher's role.** The teacher is involved and gets reports. **The teaching itself is Cogna-led:** narrated, animated lessons. The founder explicitly rejected "teacher explains at the board" steps.
5. **The pilot grows the curriculum, not the grades.** It is one grade, one subject, and the next topic.

## 3. What exists today

### 3a. The main product (monorepo)

**Apps and packages**

| Part | What it is |
|---|---|
| `apps/web` | Next.js 15 / React 19. Student pages include lotus, practice, revision, personalized-video, module-learning and classroom. Uses the Remotion Player for lesson videos. |
| `apps/api` | NestJS 11 + Prisma. Lotus engine, AI orchestration, spend caps. |
| `packages/lesson-video` | Remotion renderer for authored lessons. |
| `packages/shared` | Shared contracts. |

**AI-authored lessons** (`packages/shared/src/contracts/authored-lessons.ts`)

- **Format:** the AI writes a lesson as *data*, never code. A lesson is scenes of narrated beats, and each beat shows one visual from a fixed catalogue. Each lesson also has checkpoints and a practice set.
- **Verifier:** before any student sees a lesson, a verifier re-derives every maths claim with an exact algebra engine. The rule is "no unchecked LLM maths reaches students".
- **Catalogue:** today it is mostly algebra (expression, steps, distribute, area model, factor pairs, and a tile-build interaction). **There are no geometry visuals yet.**

**Voice**

- **Providers:** OpenAI, ElevenLabs, Cartesia (the current default) and Sarvam (Indian-English "Bulbul" voices).
- **Spoken maths:** a small helper in the API turns maths into speakable text.

### 3b. The pilot prototype: one student's 2-week journey

- **Location:** `prototypes/school-pilot-student-trail/`.
- **Stack:** plain HTML/CSS/vanilla JS, with no build step, served locally. It copies the real app's theme exactly ("one Cogna look": same fonts, colour tokens, buttons and chips).
- **Content and logic:** content is hardcoded, but the flow is real. Answers are checked, mix-ups trigger fix steps, skill meters move by the mastery rule, and days unlock in order.

**The flow**

- **Welcome**
- **Diagnostic report:**
  - 10 earlier skills with status chips, each opening to show the student's real test answers
  - a "Ready for Area?" path through the 5 skills Area needs
  - mix-up cards (for example, "uses the slanted side as the height")
  - a confidence grid (sure or unsure, right or wrong)
  - time per question against the class, and a student quote
- **10-day trail**, with skill meters. The days are:
  1. The right-angle rule (a bridge skill)
  2. Where's the height?
  3. Area is counting squares
  4. Triangles and the real height
  5. Practice
  6. Trapeziums
  7. Splitting shapes
  8. Real rooms and units
  9. Hidden heights
  10. Retest
- **Growth view:** Day 0 vs Day 10 meters, mix-ups seen then and now, the confidence grid before and after, and the student's own explanations from day 2 vs day 9.

**Step types inside a day**

- quick recall
- narrated lesson
- worked example
- "try before taught"
- game
- practice (the student says how sure they are before checking)
- fix (shown *only* if that mix-up happened earlier that day)
- explain-back (a scripted AI verdict for now)
- exit check
- adaptive practice

**Mastery rule**

- **A right answer** adds one to the student's count of rights.
- **A wrong answer** resets that count to zero and drops the skill one level.
- **Two rights** make the skill secure, and the skill comes back for a revisit 2 days later.
- **A mix-up** counts as fixed after two right answers on questions that could have triggered it.

**Personalised Day 1, with two demo students**

| Student | Interest | Starts at | Main mix-up |
|---|---|---|---|
| Aarav | cricket | level 1 | Adds the sides (3, 4 → 7) instead of squaring |
| Riya | music | level 2 | Squares and adds, then forgets the square root (writes 25, not 5) |

- Day 1 opens with a fix lesson aimed at that student's own mix-up.
- Adaptive practice has 3 levels: two rights in a row moves up a level. A known mix-up gets an inline fix at the same level; an unknown wrong answer drops a level.
- Question stories are themed to the student's interest.

**Lessons and narration**

- **Animations:** 14 SVG animations on fixed timelines, plus 6 drag-and-drop games.
- **Narration:** every caption is pre-recorded as an mp3 and keyed by a hash of the text, with the browser's voice as a fallback.
- **Spoken maths:** rewrite rules make the voice say "ay / bee / see" and "squared".

**Demo drawer:** switch student, jump to any day, auto-play, reset.

### 3c. Feedback from the founder, and what we did about it

- **"The voice is horrible"** (it was the browser's voice). We moved to ElevenLabs with a British voice.
  - **Now: "get a good Indian voice."** The ElevenLabs account is on the free plan, which can't use its Indian library voices through the API. So all 104 lines are now recorded with **Sarvam Bulbul v3**, voice **Priya**. There are 37 Indian voices in all, and samples of seven are in `audio/samples/`.
    - **Maths letters:** we found that Sarvam's voices read "ay" as "I". The spoken text therefore writes maths letters as capitals (A, B, C, H), which every voice reads as the letter. We checked this by running the recordings back through speech-to-text.
    - **Indian classroom style:** the voice says "a square plus b square", not "a squared".
- **"The letter a is said as 'uh'."** Fixed with the spoken-maths rewrite rules.
- **"The animations are increasingly confusing. The right-angle rule looks really bad, and it's not interactive or exciting enough."**
  - **Today's response (built, recorded, and tested end to end in the browser):**
    - **A new interactive lesson engine.** Lessons are steps, not fixed timestamps. A step moves on only when its line has been *spoken to the end*, its visuals have finished, and the student has done any task it asks for. Pause freezes everything. The older animations now also wait for the voice instead of racing ahead of it.
    - **The right-angle rule, rebuilt as one interactive story:**
      1. *Hook:* you're at a corner of the school ground; walking the edges is 3 m + 4 m = 7 m. **The student guesses the shortcut** (5, 6 or 7 m). This aims straight at the "adds the sides" mix-up.
      2. The edges and the shortcut form a right-angled triangle: a = 3, b = 4, c = ?
      3. Squares grow from each side. 9 and then 16 small squares pop in and are counted. The square on c shows "?".
      4. **The student taps Pour.** The whole figure tips over, and the water in the squares on a and b pours into the square on c. The water is simulated so its surface stays flat and the amount is preserved. It fills the square exactly: a teal layer of 9 and a gold layer of 16 make 25.
      5. c² = 25, so c = 5: the shortcut is 5 m, not 7 m.
      6. **The student drags the corner** of a hinged triangle. A balance scale weighs a² + b² against c², and it only levels at exactly 90°.
      7. The rule a² + b² = c², plus "Baudhāyana wrote this in India's Śulba Sūtras over 2,500 years ago, to build altars with perfect right angles."
    - **Colour coding throughout:** a is teal, b is gold, c is ink.

## 4. Decisions already made (challenge them openly if you disagree)

1. The pilot is grade 8 maths, in class, with Area as the topic to teach.
2. There are no teacher-led teaching steps. Every lesson is narrated and animated by Cogna. The teacher gets reports.
3. Everything uses one Cogna look:
   - the app's own theme tokens
   - no new visual language, gradients or emoji icons
   - only the game objects may look different
4. Mastery is "shaky until two rights".
5. Lotus questions are AI or question-bank only; right or wrong is decided by fixed rules.
6. AI-authored lessons are data from a fixed visual catalogue, and every maths claim is machine-verified.
7. The textbook is a reference, not a gate.

## 5. What's hurting right now

- **The animations confuse students.** There's too much on screen, labels collide, there's no clear single idea per scene, and the captions ran ahead of the voice.
- **The lessons are passive.** Students watch; they don't act. The new engine adds actions, but only one lesson uses it so far.
- **Voice quality and accent matter a lot to the founder.** Maths letters and symbols need reliable pronunciation in an Indian voice. We can't listen to recordings ourselves, so our only automatic check is speech-to-text, and we need a better quality check than that.
- **The prototype and the product have separate lesson systems:**
  - the prototype uses hand-written SVG and JS
  - the product uses AI-authored data rendered with Remotion
  - the product has no geometry visuals yet, and the pilot topic is all geometry

## 6. Questions for you

### A. Architecture

1. **One lesson format.**
   - How should interactive geometry lessons (growing squares, the pour, the balance, the drag-the-angle task) become *data* in the authored-lesson catalogue, so the AI can compose them and the verifier can check geometry claims (areas, Pythagoras, units, heights)?
   - Propose the catalogue additions and how the verifier would check each one.
2. **Player choice.** Should we use Remotion video (not interactive), a live interactive player (SVG or Canvas in React), or a hybrid (a video-like player with interactive checkpoints)? Which suits in-class use on low-end devices?
3. **Narration pipeline.**
   - Pre-recording at authoring time: how to key the cache (text + voice + provider).
   - Pacing each beat to the voice.
   - Word timings, to highlight what's being said.
   - One spoken-maths module for every place we use it, with Indian-English conventions.
   - Choosing and testing a voice when nobody on the build side can listen.
4. **Student model.**
   - How should the prototype's mastery and mix-up rules plug into the Core Skill Map?
   - What event log would make the class report and the growth view *computed* rather than hardcoded?
5. **Classroom delivery.** We'll have 30–40 students at once, on shared or one-each devices, with patchy wifi and low-end Android phones or Chromebooks, and audio in a classroom (headphones?).
   - Preloading or offline-first.
   - A live teacher view during class.
6. **Personalisation.** How do we make the openers per mix-up, the adaptive levels and the interest themes data-driven and safe to AI-author?

### B. Lessons, UI and animation

1. **Critique the new right-angle story** (section 3c): its clarity, how much it asks students to hold in their heads at once, and its excitement. What would you cut? If you'd do it differently, give a better storyboard.
2. **Write a one-page animation style guide for Cogna lessons.** Cover:
   - one idea per scene, and label rules
   - colour per quantity
   - pacing to the voice
   - when and how often to ask the student to act
   - celebration moments
   - accessibility: reduced motion and captions
   - how to stop lessons getting confusing
3. **Storyboards for:**
   - the three Day-1 fix lessons: adds the sides instead of squaring; forgets the square root; picks a short side as c
   - two or three Area lessons: parallelogram to rectangle; a triangle is half a parallelogram; doubling a trapezium; m² vs cm² (1 m² = 10,000 cm²)
4. **Tooling.** Should we keep hand-written SVG with our own tweens, or adopt GSAP, Motion, Rive, Lottie, Remotion, or pre-rendered Manim? Weigh:
   - our theme tokens
   - AI-authored data
   - interactivity
   - low-end devices
   - accessibility
   - a dev machine with only 8 GB of RAM
5. **UI review** of the report, trail, lesson screen and growth view:
   - what would make each better for a 13-year-old
   - what does the teacher need
   - what does the principal need to see in one page

### C. Pilot scope: are we doing the right thing?

1. Is "diagnose June–December, teach the next topic for 2 weeks, then show growth" the strongest pilot to win a school? What would you change or add?
2. **Credible growth in 2 weeks:**
   - pre/post on the same skills
   - a comparison section
   - a delayed retention check
   - teacher time saved
   - what the school will actually believe
3. **What the school sees:** the class report, the teacher dashboard, and a principal one-pager. What's missing?
4. **Risks:**
   - device logistics and audio in class
   - teacher buy-in when Cogna does the teaching
   - fit with the new NCERT books
   - privacy for minors (India's DPDP Act: parental consent)
   - an AI mistake made in front of a whole class
   - only 10 days to show change
5. **Enhancements** worth adding within the pilot, ranked by impact against effort, and anything we should **cut**.
6. **Fact check:** our lesson says Baudhāyana wrote the right-angle rule in the Śulba Sūtras "more than 2,500 years ago, to build altars with perfect right angles". Is that accurate and fair for a grade 8 lesson?

## 7. Constraints

- The code repository is public, and the pilot plans are private. Don't suggest publishing planning material.
- Keep the one Cogna look: the existing tokens are listed in `apps/web/src/app/globals.css`.
- There is one founder and a small team. Prefer things a few people can build in weeks, and say when something is a "later" item.

## 8. File map (if you have the repo)

**Prototype** (`prototypes/school-pilot-student-trail/`)

| Area | Files |
|---|---|
| Entry | `index.html` (script order) |
| Basics | `core.js` (helpers, registries), `state.js` (mastery rule, saving) |
| Content and data | `data/skills.js` (skills, mix-ups, report data), `data/students.js` (the two students, personalisation inputs), `data/days.js` (all 10 days of steps) |
| Screens | `screens/report.js`, `screens/trail.js`, `screens/session.js` (lesson player, step types, voice) |
| Lessons | `anim/lesson.js` (the new interactive engine), `anim/pyth-squares.js` (the new right-angle lesson), `anim/timeline.js` (older fixed-timeline animations) |
| Games | `games/*.js` |
| Narration | `tools/record-narration.mjs` (pre-records narration), `audio/` (recordings and manifest) |
| Briefs | `DAY1_PERSONALISED.md` (the Day 1 personalisation brief) |

**Main product**

- `packages/shared/src/contracts/authored-lessons.ts` (lesson data format)
- `apps/api/src/personalized-videos/ai-authoring/` (authoring pipeline and verifier)
- `packages/lesson-video/` (Remotion)
- `apps/web/src/app/student/personalized-video/AnimatedLessonPlayer.tsx`
- `apps/api/src/ai/` (voice providers, `spoken-math.ts`)
