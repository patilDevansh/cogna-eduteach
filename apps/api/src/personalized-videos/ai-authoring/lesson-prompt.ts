import { LIMITS } from "./lesson-verifier";
import type { LessonBrief } from "./lesson-brief";

/**
 * The instructions the AI author receives. The brief goes in between
 * markers as JSON so the fake author (and tests) can read it back exactly.
 */

export const BRIEF_START = "<<<STUDENT_BRIEF_JSON";
export const BRIEF_END = "STUDENT_BRIEF_JSON>>>";

const CATALOGUE = `
VISUALS (each beat shows exactly one; no other types exist):
- {"type":"title","text":"…"}                                  a short statement, no maths
- {"type":"expression","expr":"x^2 - 7x + 12","highlight":["+ 12"],"caption":"…"}   highlight parts must appear in expr
- {"type":"steps","steps":["(x - 3)(x - 4)","x^2 - 4x - 3x + 12","x^2 - 7x + 12"],"caption":"…"}   every step EQUALS the one before
- {"type":"distribute","outside":"3","inside":["2x","-5"],"result":["6x","-15"]}   result[i] = outside × inside[i]
- {"type":"area","rows":["x","-3"],"cols":["x","-4"],"cells":[["x^2","-4x"],["-3x","12"]]}   cells[i][j] = rows[i] × cols[j]
- {"type":"pair-search","product":12,"sum":-7,"pairs":[[3,4],[-3,-4],[2,6]],"answer":[-3,-4]}   every pair multiplies to product; answer also adds to sum
- {"type":"common-factor","terms":["6x^2","9x"],"factor":"3x","remaining":["2x","3"]}   terms[i] = factor × remaining[i]; factor must be the WHOLE common factor
- {"type":"mistake","expr":"x^2 - 7x + 12","task":"factorise","wrong":"(x + 3)(x + 4)","wrongKind":"incorrect","right":"(x - 3)(x - 4)","note":"…"}
    wrongKind is "unfinished" when the wrong answer is EQUAL but not done (3(4x + 6) for 12x + 18), "incorrect" when it is not equal. It is checked: describe the mistake in the narration to match it.
- {"type":"rule","heading":"Your routine","lines":["…","…","…"]}   2–4 short lines of words
- {"type":"shape","angles":[70,110,null,105],"sides":["5 cm","8 cm","5 cm","8 cm"],"caption":"…"}   3–6 corners; at most one null (the angle to find); if none is null they must add to (n − 2) × 180
- {"type":"chart","kind":"pie","labels":["Cricket","Football","Hockey"],"values":[180,120,60],"caption":"…"}   bar or pie, 2–6 items; pie slices are drawn in proportion (in degrees they must add to 360)
- {"type":"grid","points":[{"label":"A","x":1,"y":3},{"label":"B","x":2,"y":5}],"line":{"m":2,"c":1},"caption":"…"}   whole coordinates 0–12; with "line", every point must lie on y = m·x + c
  Use shape for angles and quadrilaterals, chart for data handling, grid for coordinates and straight-line graphs. Picture numbers may be spoken.
TASKS: "factorise", "expand" (no brackets, like terms collected), "simplify", and "calculate" (the expression is ASCII arithmetic such as "2*(10 + 8)*4" or "(1250 - 1000)/1250*100"; the answer is ONE number or fraction, e.g. 2880 or -3/16).
  A word problem becomes "calculate": put the story in the prompt and the arithmetic it needs in "expression". A "steps" visual works for arithmetic too: every line equals the one before.
- {"type":"tiles","b":5,"c":6,"sides":[3,2]}   algebra tiles for a POSITIVE x² + bx + c sliding into a rectangle; sides add to b and multiply to c (a second picture of factorising)
- {"type":"number-line","start":-3,"moves":[-4],"caption":"−3 + (−4) lands on −7"}   signed numbers as hops; a caption that ends with a number must be where the walk lands

PRACTICE FORMATS (animated in the browser after the lesson):
- {"id":"p1","format":"pair-hunt","prompt":"…","expression":"x^2 + 5x + 6","product":6,"sum":5,"options":[[2,3],[-2,-3],[1,6]],"answer":[2,3]}   only one option may fit both
- {"id":"p2","format":"spot-mistake","prompt":"…","lines":["6x^2 - 9x","3x(2x + 3)","6x^2 + 9x"],"wrongLine":1,"fix":"3x(2x - 3)","explanation":"…"}   lines before wrongLine are equal to each other; wrongLine is not equal to the line before it; fix equals the line before it
- {"id":"p3","format":"choose","prompt":"…","expression":"…","task":"factorise","options":["…","…","…"],"answerIndex":0,"feedback":["…","…","…"]}   exactly one option is a correct, finished answer
- {"id":"p4","format":"type-answer","prompt":"…","expression":"…","task":"factorise","answer":"…","hint":"…","workedSteps":["<expression>","…","<answer>"]}   steps all equal`;

const SHAPE = `
RETURN ONE JSON OBJECT:
{
  "title": "…", "objective": "…", "whyThisLesson": "…",
  "scenes": [ { "title": "…", "beats": [ { "say": "…", "visual": { … } } ] } ],
  "checkpoints": [ { "afterScene": 1, "afterBeat": 0, "prompt": "…", "spoken": "…",
                     "check": { "task": "factorise", "expression": "…" },
                     "options": [ { "label": "…", "correct": true, "feedback": "…" } ] } ],
  "practice": [ … ],
  "exit": { "prompt": "…", "expression": "…", "task": "factorise", "answer": "…" },
  "learnerDecision": "…", "teacherDecision": "…"
}`;

const RULES = `
RULES — a checker re-derives every claim with an exact algebra engine; one failure rejects the whole lesson:
1. Maths strings are plain ASCII algebra: x^2, 3x, (x - 3)(x - 4), 6x^2y. No unicode minus, no "×", no words.
2. Every equality you show must be exactly true. Every "right" answer must be fully finished (fully factorised / fully expanded / a single number).
3. "say" is read aloud by a narrator: plain words, at most ${LIMITS.sayWords.max} words, no symbols ^ * / =. Say "x squared", "minus 7 x", "times".
   Only mention numbers that appear in your checked maths. Any arithmetic you say ("3 times 4 is 12") is checked.
4. ${LIMITS.scenes.min}–${LIMITS.scenes.max} scenes, ${LIMITS.beatsPerScene.min}–${LIMITS.beatsPerScene.max} beats each, at most ${LIMITS.totalBeats.max} beats in total.
5. ${LIMITS.checkpoints.min}–${LIMITS.checkpoints.max} checkpoints with ${LIMITS.options.min}–${LIMITS.options.max} options, exactly one correct. If options are maths, include "check".
   A wrong option should be the student's own kind of mistake, and its feedback should say what went wrong.
6. ${LIMITS.practice.min}–${LIMITS.practice.max} practice items using at least ${LIMITS.practice.minFormats} formats, easy to harder, all on the target skill.
   Practice is independent: new expressions, not the lesson's. Include the student's own mistake as a distractor where it fits.
7. The exit item is fresh: an expression used nowhere in the lesson, the practice, or the diagnostic. Its prompt must contain the expression itself ("Factorise 6x^2 - 9x fully.", "Work out 3/4 + 2/5.").
8. Only use the visuals and practice formats that fit the topic: pair-search, common-factor, area and tiles are for factorising and expanding; shape, chart and grid are for geometry, data and graphs.

HOW TO TEACH:
- Open from something the student already does well (one of their strengths), by name.
- Use at least one of the student's own diagnostic expressions in the lesson, and show their actual wrong answer next to the right one.
- Explain WHY their answer went wrong in their terms, then show a short routine they can repeat.
- Speak to the student by first name, warmly and plainly, at a Grade 8 level. Never label the child (no "weak", "slow", "careless").
- Keep it short: about 2 minutes of narration.`;

export function buildAuthorPrompt(brief: LessonBrief, previousErrors: string[] = []): string {
  const retry = previousErrors.length
    ? `\nYOUR LAST DRAFT WAS REJECTED BY THE CHECKER. Fix every one of these, keep everything else:\n${previousErrors.slice(0, 25).map((e) => `- ${e}`).join("\n")}\n`
    : "";
  return [
    `You are writing one short, personalised maths lesson on ${brief.topic.toLowerCase()} and its practice for a Grade 8 student in India (CBSE), as JSON data that an animation engine plays.`,
    "The lesson targets the one skill the diagnostic confirmed as the student's starting point.",
    CATALOGUE,
    RULES,
    SHAPE,
    retry,
    BRIEF_START,
    JSON.stringify(brief, null, 2),
    BRIEF_END,
  ].join("\n");
}

/** Reads the brief back out of a prompt (used by the fake author). */
export function briefFromPrompt(prompt: string): LessonBrief | null {
  const start = prompt.indexOf(BRIEF_START);
  const end = prompt.indexOf(BRIEF_END);
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(prompt.slice(start + BRIEF_START.length, end)) as LessonBrief;
  } catch {
    return null;
  }
}
