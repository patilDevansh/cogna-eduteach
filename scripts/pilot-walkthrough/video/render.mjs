/**
 * Edits the recorded clips into one walkthrough video.
 *   node scripts/pilot-walkthrough/video/render.mjs
 * Reads out/timeline.json + out/*.webm from record.mjs; writes out/cogna-pilot-walkthrough.mp4.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
// Renders the newest complete run, or the run folder given as an argument (`--force` allows an incomplete one).
const ROOT = join(HERE, "..", "out");
const argRun = process.argv.slice(2).find((a) => !a.startsWith("--"));
const latest = existsSync(join(ROOT, "latest-complete.txt")) ? readFileSync(join(ROOT, "latest-complete.txt"), "utf8").trim() : null;
const RUN_NAME = argRun ?? latest;
if (!RUN_NAME) throw new Error("No complete recording yet: run record.mjs first.");
const OUT = join(ROOT, "runs", RUN_NAME);
const require = createRequire(new URL("../../../packages/lesson-video/package.json", import.meta.url));
const { bundle } = require("@remotion/bundler");
const { renderMedia, selectComposition } = require("@remotion/renderer");

const timeline = JSON.parse(readFileSync(join(OUT, "timeline.json"), "utf8"));
if (!timeline.complete && !process.argv.includes("--force")) throw new Error(`Run ${RUN_NAME} is incomplete; pass --force to render it anyway.`);
const NAMES = { aarav: "Aarav", meena: "Meena", rohan: "Rohan" };

/** Time of a mark, in seconds since the recording began; null if that step never happened. */
function at(who, label, nth = 0) {
  const hits = timeline.marks.filter((m) => m.who === who && m.label === label);
  return hits.at(nth < 0 ? hits.length + nth : nth)?.at ?? null;
}

/**
 * A cut of one person's screen between two moments, sped up to fit `maxSeconds`.
 * Times are converted from recording time to that clip's own time.
 */
function clip(who, start, end, caption, { maxSeconds = Infinity, minRate = 1, label } = {}) {
  if (start == null || end == null || end <= start || !timeline.clips[who]?.file) return [];
  const offset = timeline.clips[who].startedAt;
  const length = end - start;
  const rate = Math.max(minRate, length / maxSeconds);
  return [{
    kind: "clip",
    file: timeline.clips[who].file,
    from: Math.max(0, start - offset),
    rate: Math.round(rate * 10) / 10,
    seconds: length / (Math.round(rate * 10) / 10),
    who: label ?? (who === "teacher" ? "Teacher" : `Student · ${NAMES[who]}`),
    caption,
  }];
}

const hero = ["aarav", "rohan", "meena"].find((k) => at(k, "exit-done") != null) ?? "rohan";
const heroName = NAMES[hero];
const others = ["aarav", "meena", "rohan"].filter((k) => k !== hero);
const teacherEnd = at("teacher", "end") ?? timeline.endedAt;
const answers = timeline.marks.filter((m) => m.who === hero && m.label === "answer").length;

const segments = [
  {
    kind: "card", seconds: 6, eyebrow: "Cogna pilot walkthrough", title: "One class, from join code to measured progress.",
    lines: [
      "A teacher, three students, each on their own device.",
      `Recorded live: ${timeline.model === "real" ? "real GPT diagnostic and AI-written lessons" : "fake model (dry run)"}.`,
      "Students' answers are scripted. Everything Cogna does in response is real.",
    ],
  },
  { kind: "architecture", seconds: 9 },
  ...clip("teacher", at("teacher", "login"), (at("teacher", "console") ?? 0) + 2, "The teacher creates a class. Cogna gives it a join code.", { maxSeconds: 10 }),
  ...clip(hero, at(hero, "login"), (at(hero, "joined") ?? 0) + 1.5, "Each student signs in and joins with the class code.", { maxSeconds: 8 }),
  ...clip("teacher", (at("teacher", "release") ?? 0) - 1.5, (at("teacher", "released") ?? 0) + 5, "One button: release the Lotus diagnostic. There's nothing else for the teacher to press.", { maxSeconds: 8 }),
  ...clip(hero, at(hero, "diagnostic-ready"), (at(hero, "answer", 1) ?? 0) + 1, `${heroName} starts the diagnostic. Every answer is marked by code instantly.`, { maxSeconds: 12 }),
  ...clip(hero, (at(hero, "answer", 1) ?? 0) + 1, (at(hero, "report") ?? 0) + 4,
    `It adapts as it goes and stops by itself: after ${answers} questions it has found ${heroName}'s starting point.`, { maxSeconds: 16, minRate: 2 }),
  ...clip("teacher", at(hero, "report"), (at(hero, "report") ?? 0) + 7, "Meanwhile the teacher's console fills in live, student by student.", { maxSeconds: 7 }),
  ...clip(hero, (at(hero, "report") ?? 0) + 4, at(hero, "lesson-play"), `No teacher approval needed: the lesson is written by AI from ${heroName}'s own answers, and every equation is checked before it's shown.`, { maxSeconds: 9 }),
  ...clip(hero, at(hero, "lesson-play"), Math.min((at(hero, "lesson-play") ?? 0) + 26, at(hero, "practice") ?? Infinity), `The lesson: ${heroName}'s own question, the actual mistake beside the right answer, then a routine to repeat.`, { maxSeconds: 26 }),
  ...clip(hero, at(hero, "practice"), (at(hero, "practice-done") ?? 0) + 2.5, "Animated practice. Answers are checked on the server; a miss shakes, a right answer shows the working.", { maxSeconds: 18 }),
  ...clip(hero, at(hero, "exit"), (at(hero, "exit-done") ?? 0) + 2.5, "Then one fresh question with no hints. This is the only thing that counts as progress.", { maxSeconds: 12 }),
  ...others.flatMap((k) => clip(k, (at(k, "exit-done") ?? 0) - 1.5, (at(k, "exit-done") ?? 0) + 2, k === "meena" ? "Not every student gets there first time, and the report says so honestly." : `${NAMES[k]} finishes too.`, { maxSeconds: 4 })),
  ...clip("teacher", at("teacher", "final-report"), teacherEnd - 0.5, "The teacher's report: who needs a bridge in what, the class skill map, and who improved on their own.", { maxSeconds: 14 }),
  {
    kind: "card", seconds: 8, eyebrow: "What the pilot shows", title: "The teacher pressed one button. Every student was diagnosed, taught and re-checked.",
    lines: [
      "Diagnostic stops at 15 minutes or as soon as the starting point is found.",
      "AI writes each lesson; an algebra engine checks every step first.",
      "Progress is only an independent, unassisted answer. Practice never counts.",
    ],
  },
];

if (!existsSync(join(OUT, "teacher.webm"))) throw new Error("Record first: out/teacher.webm is missing.");
console.log(`Segments: ${segments.length}, about ${Math.round(segments.reduce((s, x) => s + x.seconds, 0))}s`);

const serveUrl = await bundle({ entryPoint: join(HERE, "index.tsx"), publicDir: OUT });
const inputProps = { segments, model: timeline.model };
const composition = await selectComposition({ serveUrl, id: "PilotWalkthrough", inputProps });
const output = join(ROOT, `cogna-pilot-walkthrough-${timeline.model}-${RUN_NAME}.mp4`);
await renderMedia({
  serveUrl,
  composition,
  codec: "h264",
  outputLocation: output,
  inputProps,
  concurrency: 4,
  onProgress: ({ progress }) => {
    if (Math.round(progress * 100) % 10 === 0) process.stdout.write(`\rRendering ${Math.round(progress * 100)}%   `);
  },
});
console.log(`\nWrote ${output}`);
