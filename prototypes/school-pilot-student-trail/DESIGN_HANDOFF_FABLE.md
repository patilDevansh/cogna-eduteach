# Design handoff to Fable: Cogna student trail (as of 2026-11-20)

Read `HANDOFF_FABLE.md` first. It covers what Cogna is, the school pilot, decisions already made and the open questions. This file is the **design and build spec** for what exists in the student trail prototype, and what changed after that handoff was written. Plain HTML/JS, no build step: serve `prototypes/school-pilot-student-trail/` (preview config `student-trail-flow`, port 4483).

---

## 1. What changed since HANDOFF_FABLE.md

1. **Animation classification agreed (2026-11-19).** Nine animation types, each copying one move a great tuition teacher makes:

   | Group | Type | Teacher move | Length | When |
   |---|---|---|---|---|
   | Watch | Lesson video | explains on the board | 2–5 min | first meeting with an idea |
   | Watch | Aha clip | slows down at the tricky bit | < 1 min | the one step most students get stuck on |
   | Do | Guess-then-see | "what happens next?" | 10–20 s | 2–3 stops inside every lesson video |
   | Do | Play-with-it | hands over the pencil | 1–3 min | after seeing the idea; **must have a goal** |
   | Check | Check question | one question to see what you know | ~1 min | Lotus, end of practice |
   | Check | Mistake replay | points to exactly where you slipped | 15–30 s | right after a wrong answer, **built on the student's own number**, then a fresh question of the same kind |
   | Touch | Reactions | nod / "hmm, look again" | < 2 s | every tap and answer |
   | Touch | Quick reminder | "remember yesterday?" | 10–20 s | start of each day |
   | Touch | Progress | marks going up | ~5 s | end of the day |

   Day recipe: reminder → lesson video with guess stops → aha → play with a goal → check questions with reactions → mistake replays + retry → progress.

2. **Day 6 (Trapeziums) is rebuilt on this recipe** and is the model for Days 2–9. The other days still use the older step structure.
3. **Teacher-at-the-board steps are gone** from every day (filtered in `data/days.js`). Teacher notes on the day-done screen stay.
4. **Narration voice is mixed for now.** Sarvam "priya" (Indian, preferred) ran out of credits. 105 lines (Day 4 and Day 6 hands-on lessons, all new Day 6 pieces) use ElevenLabs "Jessica" (American) until Sarvam is topped up. See §8.
5. **Rive** is being explored in a separate session (`prototypes/rive-*`, the "Area Lab"). None of Day 6 uses Rive.

---

## 2. Design tokens (from `cogna.css`, `proto.css`, `css/anim.css`)

Use tokens, never raw values.

| Token | Value | Usage |
|---|---|---|
| `--bg` | #f4f7f3 | page background (with `--grid` lines) |
| `--surface` | #ffffff | cards, lesson stage |
| `--ink` / `--ink-soft` / `--ink-faint` | #16241d / #51635a / #7d8c84 | text, captions, muted labels; `--ink-faint` also the road |
| `--accent` / `--accent-deep` / `--accent-wash` | #0e6b54 / #08463a / #e3efe9 | primary buttons, links, figure fills; canal water (30% opacity) |
| `--success` / `--success-wash` | #17734f / #e2f2e8 | grass, done stones, ticks |
| `--caution` / `--caution-wash` | #a2660d / #f7eedd | shaky state |
| `--t-right-bg`, `--t-wrong-bg`, `--t-wrong-stroke` | #dff3e9, #fae5df, #b4400c | answer feedback |
| `--line` / `--line-strong` | #dce4dd / #b9c6bc | borders, trail path |
| `--focus` | #0e6b54 | focus rings |
| `--pf-gold`, `--pf-gold-wash` | #dca03a, #fff4d8 | **anything you can move or that is being counted**: handles, ghosts, seams, parallel lines |
| `--pf-red` | = `--t-wrong-stroke` | "not part of the shape", slanted side used wrongly |
| `--pf-grass`, `--pf-soil` | #6fb36f, #8d5c0f | the land look |
| `--font-display` | Bricolage Grotesque | titles, numbers on signs |
| `--font-body` | Instrument Sans | body, captions, labels in lessons |
| `--font-math` | IBM Plex Mono | formulas, figure labels, lesson choice buttons |
| `--text-xs … --text-xl` | 0.8125–1.75rem | type scale |
| `--s-1 … --s-5` | 0.25–1.5rem | spacing scale |
| `--radius` / `--radius-lg` | 10px / 16px | cards, panels |
| `--shadow-soft` | 2-layer soft shadow | cards |
| `--dur-fast` / `--dur-phase` / `--dur-calm` | 240 / 420 / 1100ms | UI transitions |
| `--ease-settle` | cubic-bezier(0.2, 0.8, 0.2, 1) | UI settle |

**Gold means "this moves, or this is where it goes."** Don't use it for decoration.

---

## 3. Layout

- Session page: header (eyebrow "Today", `Day N · Title`, progress dots, Leave), one step per card on the grid background, a sticky bottom bar with step count and **Continue** (disabled until the step calls `complete()`).
- Lesson stage: an SVG with a fixed viewBox (800 wide; height per lesson: reminder 340, lesson video 480, replays 320–340, progress 196), scaled to width with `max-height: min(62vh, 540px)`. Below it: the **board** (formulas, HTML), the **task bar** (choices, number input, buttons), the caption line and Play / Replay / Sound.
- Breakpoints: 860px (split layouts stack), 640px, 480px (options and buttons stack). At 390px the lessons scale down with no sideways scroll (checked).

---

## 4. Day 6 screen by screen

| # | Step (type) | Component | Plays | Notes |
|---|---|---|---|---|
| 1 | Quick reminder (`animation`, autoplay) | `trap-remind` | ~15 s | triangle drops in; copy lifts, half-turns in the air, lands with a snap, gold seam, chime; copy floats away leaving a "half" tag |
| 2 | Quick recall (`recall`, reactions) | 3 questions | ~1 min | spaced practice of triangle, parallelogram, rectangle |
| 3 | Try first (`try`) | 1 guess | ~30 s | no right/wrong, reveals the answer |
| 4 | Lesson video (`animation`) | `trap-lesson` | ~2 min | road + canal → parallel → "trapezium" tag → LAND sign → top 3 / bottom 5 → **guess 1: tap the height** → field slides left, rectangle/triangle/parallelogram appear with ticks, "?" on the field → **guess 2: what do two copies make?** (ghost copy + 3 choices) → "make the copy yourself next" |
| 5 | Hands-on (`animation`, `flags.afterLesson`) | `trap-field` | 3–4 min | skips its own intro; copy/spin/slide → base 5+3 → type 32 → half = 16 → rule → stretch top to a triangle → **goal: make exactly 14** → your turn (30) |
| 6 | Check questions (`practice`, reactions) | 4 questions + replays | ~6 min | Q1 8/12/h5 = 50 (100 → `trap-fix-100`, 60 → `trap-fix-60`); Q2 9/5, slant 5, h4 = 28 (35 → `trap-fix-35`); Q3 which two fields have the same area (P, Q, R figure); Q4 backwards: area 36, sides 5 and 7 → h = 6 |
| 7 | Progress (`animation`, autoplay) | `trap-progress` | ~10 s | 10 stones; stone 6 pops with a gold ring; chip shows Secure / Shaky / Needs work; stone 7 bobs |

Then **Finish day** → the existing day-done screen ("What moved today", teacher note, tomorrow).

---

## 5. Components and states

| Component | Variant / props | States | Behaviour |
|---|---|---|---|
| Animation step | `eyebrow`, `autoplay`, `flags`, `skill` | idle (Press Play) → playing → paused → ended | autoplay hides the "Press Play" hint; ended marks the skill taught and enables Continue; "Mark as watched" link appears after duration + 5 s |
| Lesson (`Cogna.lesson.define`) | steps: `caption`, `run`, `task`, `branch`, `hold`, `skip` | step waits for: caption spoken, tweens done, task done | lesson time stops on Pause; `skip(c, L)` drops a step (used with `L.flags`) |
| Field piece (land kit) | original / copy (lighter grass) | rest, movable (gold edge, gentle bob), lifted (shadow grows, scale 1.03), set down (back-out bounce, thud) | keyboard: Enter on the piece, arrows to move |
| Handle (gold knob) | spin / slide | hidden, live (pulsing ring), held (scale 1.18, ring off) | drag snaps to whole squares with a tick; arrow keys step by one |
| Tap-a-line | base, slant, diagonal (dotted, `is-shown`), drop (dashed) | live (gold on hover/focus), wrong (red, 0.9 s), hint (gold blink after 2 misses), correct (gold solid) | right answer: stone on a string drops, square-corner mark pops, "height 4" |
| Choice bar | 2–4 options | idle, picked (disabled others) | 450 ms pause, then the reaction line |
| Question (`questionView`) | mcq / number; `needSure`; `reactions` | unanswered, ready, right (snap + chime, pop), wrong (oops, shake), replay-wrong (short feedback "Watch where X comes from") | |
| Mistake replay panel | `replay` on an option / wrongMixups entry; `retry` on the question | playing → ended → retry question → Next | autoplays and scrolls into view; title "Your answer: X" |
| Progress chip | secure / shaky / missing | | uses `C.toneChip` labels: Secure, Shaky, Needs work |

---

## 6. Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Field drop-in | lesson start | fall from −54 px, bounce, whoosh + thud | 950 ms | bounce.out |
| Copy flight | reminder / replay | lift, 0→180° turn while moving on an arc (−56 px) | 1100 ms | power2.inOut |
| Snap into slot | copy lands | set down + 2 px world shake + seam flash | 180 + 340 ms | power3.out, back.out(2.6) |
| Tag / label pop | reveal | scale 0.4→1 with pop sound | 400 ms | back.out(3) |
| Gold outline / parallel lines | reveal | stroke draws on | 900–1300 ms | power2.inOut |
| Field slide | puzzle step | x 270→150 | 800 ms | power2.inOut |
| Slanted-side rod | replay 35 | lift, rotate −36.87° about its foot, slide beside the height, set down | 900 + 700 ms | power2.inOut |
| Right answer | check | option pops 1.035× | 340 ms | ease-out |
| Wrong answer | check | options shake ±7 px | 380 ms | ease-out |
| Trail stone | progress | pop 1.3× then settle, gold ring 1→2.3× fading | 160 + 500 ms / 900 ms | power2.out, back.out(3) |

**Reduced motion:** every lesson tween is set to duration 0 (`L.to`), bobs and rings stop, the answer pop and shake are off. Sounds are made in the browser (`anim/sfx.js`) and follow the Sound toggle.

---

## 7. Content rules

- **Narration:** every spoken line is a literal `caption: "..."` in `anim/*.js` so the recorder finds it. No numbers built at run time in spoken lines. Say "square centimetres", not "cm²". The board may use ½ and cm².
- **Personalised first line:** a `branch` on the profile (Aarav / Riya / anyone).
- **Retry questions** must be the same kind as the original, with new numbers and different wrong values.
- **Empty or missing:** an unknown anim id shows a placeholder card with "Mark as watched"; a missing recording falls back Sarvam → Jessica → Gemini → Cartesia → browser voice.
- **Autoplay blocked:** captions still show and the lesson moves on after a reading time (1 s + 330 ms per word).

---

## 8. Known gaps and risks

- **Voice:** 105 lines use the American voice. After a Sarvam top-up, run `node prototypes/school-pilot-student-trail/tools/record-narration.mjs` from the repo root. It records only the missing priya lines. The recorder no longer deletes files after a failed run (it once deleted 82).
- **Nothing is committed** from the Day 6 rebuild or the new audio. Another session is also editing the trail (`data/lab.js`, `index.html`, `screens/trail.js`, Rive Area Lab).
- **The demo story** for Day 6 now slips on the last check question (it used to be the exit check).
- **Not yet done:** Days 2–5 and 7–9 on the new recipe; reactions on other days; a reusable aha clip shared across days; testing on real classroom devices.

---

## 9. Accessibility

- Focus order per step: lesson stage → task bar controls → Play / Replay / Sound → Continue.
- Every draggable thing has a keyboard path: pieces (arrows), knobs (Enter / arrows), handles (left / right arrows), tap-lines (Tab + Enter, `role="button"` with descriptive `aria-label`s).
- Captions are an `aria-live="polite"` region; the board is `aria-live` too; question feedback is `role="status"`.
- Figures carry `role="img"` with full `aria-label` text (e.g. the P/Q/R fields list every side).
- Colour is never the only signal: wrong states also shake and say why; secure/shaky chips carry text.

---

## 10. File map for Day 6

| File | What |
|---|---|
| `anim/trap-day.js` | reminder, lesson video, progress; `Cogna.trapKit` (place, popIn, flyIn) |
| `anim/trap-fixes.js` | the three mistake replays |
| `anim/trap-field.js` | hands-on field (intro skip, "make 14" goal added) |
| `anim/lesson.js` | lesson engine (`skip`, `L.flags` added) |
| `anim/land-kit.js`, `anim/twin.js` | land look, copy-spin-slide |
| `css/learning-flow.css` | styles for all of the above, reactions, replay panel, P/Q/R figure |
| `screens/session.js` | step player: autoplay/eyebrow/flags, reactions, replay → retry, voice fallback |
| `data/days.js` | Day 6 steps and questions; helpers `rep()` and `trio()` |
| `tools/record-narration.mjs` | recorder: Sarvam, Cartesia, Gemini, ElevenLabs; `--missing-from` |
| `anim/_gallery.html` | every animation on one page |

**What we'd like from you:** the same as `HANDOFF_FABLE.md` §6, plus a verdict on whether Day 6 is the right model for the other days, and the three changes that would most raise its quality.
