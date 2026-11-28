# Day 1, personalised: the contract for the build agents

This adds to the original plan (`/Users/dp/.claude/plans/what-we-want-to-vivid-orbit.md`). The theme rules in its §1 still apply: Cogna theme only, `t-` classes, no new hex colours, no emoji, plain English for students.

## Goal
Day 1 (Pythagoras) should look different for each student, based on their test result and every answer they give. Two demo students:
- **Aarav** (`data/students.js`): Pythagoras missing; day-0 cause `addsides` (adds the legs). Interest: cricket. Starts at level 1.
- **Riya**: Pythagoras shaky; day-0 cause `noroot` (stops at c²). Interest: music. Starts at level 2.

The current student is `Cogna.data.profile` (`{id, name, interest, startLevel, causes}`). Progress is saved separately per student.

## New mix-up ids (in `C.data.mixups`)
`addsides`, `noroot`, `wrongc`. Each has a `fixAnim`: `pyth-why-not-add`, `pyth-undo-square`, `pyth-which-c`.

## New step type: `adaptive` (Day 1 replaces its `worked` + `practice` steps with this)
```js
{ id:'s4', type:'adaptive', skill:'pyth',
  openers: { addsides:'pyth-why-not-add', noroot:'pyth-undo-square' },   // played first if profile.causes has that key
  fixes:   { addsides:'pyth-why-not-add', noroot:'pyth-undo-square', wrongc:'pyth-which-c' },
  maxQuestions: 8,
  pool: [ PQ, ... ] }   // at least 4 questions per level, levels 1..3
// PQ = a normal Q (data/days.js header schema) plus:
{ level: 1|2|3,
  themes: { cricket:'prompt text…', music:'prompt text…', default:'prompt text…' },  // replaces `prompt`; same numbers in every theme
  wrongMixups: [{ value, mixup:'addsides'|'noroot'|'wrongc', why }] }        // number questions; mcq uses options[].mixup
```
Levels:
- **1:** find c from two legs, small triples (3-4-5, 6-8-10)
- **2:** find c with bigger triples (5-12-13, 8-15-17, 9-12-15), or "is it a right triangle?"
- **3:** find a missing LEG (needs subtraction; this is where `wrongc` shows), plus one word problem

### Rules (the adaptive player must follow these exactly)
1. **Openers:** for each key in `profile.causes` that is in `openers`, play that animation once, captioned "From your check-in: …" with the mix-up's `plain`.
2. **Start level:** `profile.startLevel`.
3. **Picking a question:** the first unused pool question at the current level. Use the prompt `themes[profile.interest] || themes.default`. Ask "How sure are you?" before Check.
4. **Right answer:** `streak += 1`. When `streak === 2`, go up one level and reset the streak. If already at level 3, the step is **complete** ("Secure: two in a row at the hardest level").
5. **Wrong answer with a known mix-up:** `streak = 0`, record it with the mix-up, play `fixes[mixup]` inline (Play/Replay and a caption), then give another question at the **same** level.
6. **Wrong answer, unknown:** `streak = 0`; show the `explain`; go **down** one level (minimum 1).
7. **Confidence:** sure + wrong → show "You felt sure, so this one's worth a closer look" before the fix. Right + unsure → +1 question at the same level, without counting toward the streak (once only).
8. **Stopping:** after `maxQuestions` answers, the step completes anyway with "We'll keep practising this tomorrow".
9. **Recording:** every answer goes through `ctx.record({qid, skill, correct, mixup, sure, answer, guards})`.
10. **The path so far:** a visible "Your path" strip of small dots shows each answer (right / wrong), the level, and which fix played. This is what makes the personalisation visible in a demo.
11. **Auto-answer for the demo drawer:** `ctx.setAuto(fn)` must play the STORY:
    - Aarav: gets the first level-1 question wrong with `addsides`, then right, right, right, right, right.
    - Riya: gets her first question wrong with `noroot`, then right × 4.
    - The story lives in `profile.story = [{correct:bool, mixup?}]`. The player follows it in order, then answers right.

## Ownership
| Agent | Files |
|---|---|
| **D (animations)** | `anim/pyth-why-not-add.js`, `anim/pyth-undo-square.js`, `anim/pyth-which-c.js` (+ add them to `anim/_gallery.html`) |
| **A (content)** | `data/days.js` Day 1 only: replace s4 `worked` + s5 `practice` with one `adaptive` step (keep the other steps; renumber ids s1..sN). Add `story` to both profiles in `data/students.js` (only the `story` arrays) |
| **C (player)** | `screens/session.js` (add `Cogna.steps.adaptive`), `css/session.css` |
