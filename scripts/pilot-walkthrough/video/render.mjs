/**
 * Edits the recorded clips into one walkthrough video.
 *   node scripts/pilot-walkthrough/video/render.mjs
 * Reads a run folder from record.mjs (timeline.json + *.webm) and writes
 * out/cogna-pilot-walkthrough-<model>-<run>.mp4, narrated by a Cartesia voice
 * (the same voice as the earlier /brag videos) over quiet music.
 * `--silent` skips the voice.
 */
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { totalmem } from "node:os";
import { dirname, join } from "node:path";
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
function clip(who, start, end, caption, say, { maxSeconds = Infinity, minRate = 1, label } = {}) {
  if (start == null || end == null || end <= start || !timeline.clips[who]?.file) return [];
  const offset = timeline.clips[who].startedAt;
  const length = end - start;
  const rate = Math.round(Math.max(minRate, length / maxSeconds) * 10) / 10;
  return [{
    kind: "clip",
    file: timeline.clips[who].file,
    from: Math.max(0, start - offset),
    length,
    rate,
    seconds: length / rate,
    who: label ?? (who === "teacher" ? "Teacher" : `Student · ${NAMES[who]}`),
    caption,
    say,
  }];
}

const hero = ["aarav", "rohan", "meena"].find((k) => at(k, "exit-done") != null) ?? "rohan";
const heroName = NAMES[hero];
const others = ["aarav", "meena", "rohan"].filter((k) => k !== hero);
const teacherEnd = at("teacher", "end") ?? timeline.endedAt;
const answers = timeline.marks.filter((m) => m.who === hero && m.label === "answer").length;
const real = timeline.model === "real";

const SHORT = process.argv.includes("--short");
const deliverArg = process.argv.find((x) => x.startsWith("--deliver="));
const DELIVER = deliverArg ? deliverArg.slice("--deliver=".length) : null;

/** All three students' screens over the same stretch of recording time, side by side. */
function multi(start, end, caption, say, { maxSeconds = Infinity } = {}) {
  if (start == null || end == null || end <= start) return [];
  const length = end - start;
  const rate = Math.round(Math.max(1, length / maxSeconds) * 10) / 10;
  const screens = ["aarav", "meena", "rohan"].filter((k) => timeline.clips[k]?.file).map((k) => ({
    file: timeline.clips[k].file, from: Math.max(0, start - timeline.clips[k].startedAt), rate, who: NAMES[k],
  }));
  return [{ kind: "multi", screens, length, rate, seconds: length / rate, caption, say }];
}

/** The final full-page teacher screenshot, panned top to bottom. */
function still(file, caption, say, seconds) {
  if (!existsSync(join(OUT, file))) return [];
  const png = readFileSync(join(OUT, file));
  const imageHeight = png.readUInt32BE(20) * (1280 / png.readUInt32BE(16));
  return [{ kind: "still", file, who: "Teacher", imageHeight, seconds, caption, say }];
}

const STANDIN_NOTE = "The pointless “+ number − number” padding in these questions comes from the free stand-in model used for this recording.";
const exitRight = (k) => timeline.marks.find((m) => m.who === k && m.label === "exit-done")?.right === true;
const improved = ["aarav", "meena", "rohan"].filter(exitRight).length;
const exitOrder = [...others].sort((x, y) => Number(exitRight(y)) - Number(exitRight(x)));

const fullCut = [
  {
    kind: "card", seconds: 6, eyebrow: "Cogna pilot walkthrough", title: "One class, from join code to measured progress.",
    lines: [
      "A teacher, three students, each on their own device.",
      "Students' answers are scripted. Everything Cogna does in response is live.",
      real ? "Recorded with the production language model." : "Recorded with a free stand-in model, so some questions carry placeholder numbers.",
    ],
    say: "The Cogna pilot: one teacher, three students, each on their own device. Their answers are scripted; everything Cogna does in response is live.",
  },
  {
    kind: "architecture", seconds: 9,
    say: "The teacher presses one button. Everything after that runs on the server, and every equation is verified before a student sees it.",
  },
  ...clip("teacher", at("teacher", "login"), (at("teacher", "console") ?? 0) + 2, "The teacher creates a class. Cogna gives it a join code.",
    "The teacher signs in and creates a class. Cogna gives it a join code.", { maxSeconds: 10 }),
  ...multi(Math.min(...["aarav", "meena", "rohan"].map((k) => at(k, "login") ?? Infinity)), (at("aarav", "joined") ?? 0) + 1.5,
    "Aarav, Meena and Rohan sign in on their own devices and join with the code.",
    "Aarav, Meena and Rohan sign in on their own devices, and join with that code.", { maxSeconds: 8 }),
  ...clip("teacher", (at("teacher", "release") ?? 0) - 1.5, (at("teacher", "released") ?? 0) + 5, "One button: release the Lotus diagnostic. There's nothing else for the teacher to press.",
    "Then one button: release the Lotus diagnostic. That is the teacher's only action.", { maxSeconds: 8 }),
  ...multi(at("aarav", "diagnostic-start"), at("meena", "report"), "Each student gets their own adaptive questions. Every answer is marked by code, instantly.",
    "Each student gets their own adaptive questions, and every answer is marked by code, instantly.", { maxSeconds: 9 }),
  ...clip(hero, (at(hero, "answer", 1) ?? 0) + 1, (at(hero, "report") ?? 0) + 4,
    `It stops by itself: after ${answers} questions it has found ${heroName}'s starting point.`,
    `The test ends at fifteen minutes, or earlier, as soon as Lotus confirms where to start. For ${heroName}, that took ${answers} questions.`, { maxSeconds: 14, minRate: 2 })
    .map((seg) => ({ ...seg, note: real ? undefined : STANDIN_NOTE })),
  ...clip("teacher", at(hero, "report"), (at(hero, "report") ?? 0) + 7, "Meanwhile the teacher's console fills in live, student by student.",
    "Meanwhile, the teacher's console fills in, live, student by student.", { maxSeconds: 7 }),
  ...clip(hero, (at(hero, "report") ?? 0) + 4, at(hero, "lesson-play"),
    `No teacher approval needed: a lesson is written from ${heroName}'s own answers, and every equation is checked before it's shown.`,
    `No approval needed. A lesson is written from ${heroName}'s own answers, and an algebra engine checks every equation before it's shown.`, { maxSeconds: 9 }),
  ...clip(hero, at(hero, "lesson-play"), Math.min((at(hero, "lesson-play") ?? 0) + 21, at(hero, "practice") ?? Infinity),
    `${heroName}'s lesson starts from what ${heroName} already knows, and pauses at checkpoint questions along the way.`,
    `The lesson starts from what ${heroName} already knows, and pauses at checkpoint questions, so ${heroName} has to answer before it moves on.`, { maxSeconds: 13 }),
  ...clip(hero, at(hero, "practice"), (at(hero, "practice-done") ?? 0) + 2.5, "Animated practice. Answers are checked on the server; a miss gets specific feedback, a right answer shows the working.",
    "Then practice. Every answer is checked on the server. A miss gets specific feedback; a right answer shows the working.", { maxSeconds: 10 }),
  ...clip(hero, at(hero, "exit"), (at(hero, "exit-done") ?? 0) + 2.5, "Then one fresh question with no hints. This is the only thing that counts as progress.",
    `Finally, one fresh question, with no hints. This is the only thing Cogna counts as progress. ${heroName} gets it right.`, { maxSeconds: 12 }),
  ...exitOrder.flatMap((k) => clip(k, (at(k, "exit-done") ?? 0) - 1.5, (at(k, "exit-done") ?? 0) + 2.5,
    exitRight(k) ? `${NAMES[k]} gets the fresh question right too.` : `${NAMES[k]} doesn't, yet, and the report says so honestly.`,
    exitRight(k) ? `So does ${NAMES[k]}.` : `${NAMES[k]} doesn't, yet. And the report says so, honestly.`, { maxSeconds: 4 })),
  ...clip("teacher", at("teacher", "final-report"), teacherEnd - 0.5, `The teacher's console: a live roster, and ${improved} of 3 improved on their own.`,
    `And the teacher sees it all: a live roster, and ${improved} of three students improved on their own.`, { maxSeconds: 8 }),
  ...still("teacher-final.png", "Who needs a bridge in what, and the class skill map: built only from stored evidence.",
    "Who needs a bridge, and in what. And a skill map of the whole class, built only from what the students actually did.", 9),
  {
    kind: "card", seconds: 8, eyebrow: "What the pilot shows", title: "The teacher pressed one button. Every student was diagnosed, taught and re-checked.",
    lines: [
      "Diagnostic stops at 15 minutes or as soon as the starting point is found.",
      "Each lesson is written from the student's own answers; an algebra engine checks every equation first.",
      "Progress is only an independent, unassisted answer. Practice never counts.",
    ],
    say: "The teacher pressed one button. Every student was diagnosed, taught, and re-checked, on their own.",
  },
];

// ~40 s vertical short: same footage, fewer and shorter beats.
const shortCut = [
  {
    kind: "card", seconds: 5, eyebrow: "Cogna pilot", title: "One button. Every student diagnosed, taught and re-checked.",
    lines: ["Students' answers are scripted.", "Everything Cogna does is live."],
    say: "One teacher, three students. Their answers are scripted; everything Cogna does in response is live.",
  },
  ...clip("teacher", at("teacher", "class-created") - 0.5, (at("teacher", "released") ?? 0) + 2, "Create a class. Share the code. Press one button.",
    "The teacher creates a class, shares the code, and presses one button.", { maxSeconds: 5 }),
  ...clip(hero, at(hero, "diagnostic-start"), (at(hero, "report") ?? 0) + 3, "An adaptive diagnostic finds where each student starts.",
    "Each student takes an adaptive diagnostic, marked by code, until Cogna finds where to start.", { maxSeconds: 6, minRate: 2 }),
  ...clip(hero, at(hero, "lesson-play"), (at(hero, "lesson-play") ?? 0) + 10, "A lesson written from their own answers. Every equation checked.",
    "Then a lesson written from their own answers, with every equation checked first.", { maxSeconds: 5 }),
  ...clip(hero, at(hero, "exit"), (at(hero, "exit-done") ?? 0) + 2, "One fresh question, no hints. The only thing that counts.",
    "Then one fresh question, with no hints. That's the only thing that counts.", { maxSeconds: 5 }),
  ...still("teacher-final.png", `${improved} of 3 improved. The teacher sees who needs a bridge.`,
    `${improved} of three improved on their own, and the teacher sees exactly who needs a bridge.`, 6),
  { kind: "card", seconds: 4, eyebrow: "Cogna", title: "The teacher pressed one button.", lines: [], say: "The teacher pressed one button." },
];

const segments = SHORT ? shortCut : fullCut;

if (!existsSync(join(OUT, "teacher.webm"))) throw new Error("Record first: teacher.webm is missing from the run folder.");


// ---------------------------------------------------------------- footage
// OffthreadVideo seeks VP9 .webm slowly enough to time out with several screens on at once,
// so each recording is transcoded once to H.264 with a keyframe every second (cached beside it).
function ffmpegBinary() {
  try {
    // The compositor (which ships ffmpeg) is a dependency of @remotion/renderer, so resolve it from there.
    const fromRenderer = createRequire(require.resolve("@remotion/renderer"));
    const pkg = fromRenderer.resolve(`@remotion/compositor-${process.platform}-${process.arch}/package.json`);
    const bin = join(dirname(pkg), "ffmpeg");
    return existsSync(bin) ? { bin, env: { ...process.env, DYLD_LIBRARY_PATH: dirname(pkg), LD_LIBRARY_PATH: dirname(pkg) } } : null;
  } catch {
    return null;
  }
}
const FF = ffmpegBinary();
if (!FF) console.warn("Warning: Remotion's ffmpeg not found; rendering straight from .webm (slow, may time out).");
function seekable(file) {
  if (!FF || !file.endsWith(".webm")) return file;
  const mp4 = file.replace(/\.webm$/, ".seek.mp4");
  if (!existsSync(join(OUT, mp4))) {
    process.stdout.write(`Transcoding ${file}…\n`);
    execFileSync(FF.bin, ["-y", "-loglevel", "error", "-i", join(OUT, file), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
      "-g", "30", "-pix_fmt", "yuv420p", "-an", join(OUT, mp4)], { env: FF.env, stdio: "inherit" });
  }
  return mp4;
}
/**
 * Several OffthreadVideos in one frame deadlock Remotion's frame server, so each
 * "multi" scene is pre-composited by ffmpeg into one stage-sized video (screens
 * trimmed, sped up and placed); the component only draws labels over it.
 */
const TILE = { top: 210, side: 30, gap: 24 };
function composite(seg, index) {
  const n = seg.screens.length;
  const w = Math.floor((1280 - 2 * TILE.side - TILE.gap * (n - 1)) / n / 2) * 2;
  const h = Math.round((w * 800) / 1280 / 2) * 2;
  const out = `multi-${index}-${createHash("sha1").update(JSON.stringify([seg.screens, seg.seconds])).digest("hex").slice(0, 8)}.mp4`;
  seg.tile = { w, h, ...TILE };
  if (existsSync(join(OUT, out))) return out;
  const job = { dir: OUT, out, seconds: seg.seconds, fps: 30, tile: seg.tile, screens: seg.screens.map(({ file, from, rate }) => ({ file, from, rate })),
    ffmpeg: FF.bin, ffmpeg_lib: dirname(FF.bin) };
  execFileSync("python3", [join(HERE, "composite_multi.py")], { input: JSON.stringify(job), stdio: ["pipe", "inherit", "inherit"] });
  return out;
}
segments.forEach((seg, i) => {
  if (seg.kind === "clip") seg.file = seekable(seg.file);
  if (seg.kind === "multi") {
    for (const sc of seg.screens) sc.file = seekable(sc.file);
    if (FF) seg.composite = composite(seg, i);
  }
});
// ---------------------------------------------------------------- voice

const LEAD = 0.45;
const TAIL = 0.6;
const SR = 44100;

function env(key) {
  if (process.env[key]) return process.env[key];
  const file = join(HERE, "..", "..", "..", ".env");
  for (const line of existsSync(file) ? readFileSync(file, "utf8").split("\n") : []) {
    if (line.startsWith(`${key}=`)) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

/** Seconds of audio in a 16-bit PCM WAV. */
function wavSeconds(path) {
  const b = readFileSync(path);
  const channels = b.readUInt16LE(22);
  const rate = b.readUInt32LE(24);
  let i = 12;
  while (i < b.length - 8) {
    const id = b.toString("ascii", i, i + 4);
    const size = b.readUInt32LE(i + 4);
    if (id === "data") return Math.min(size, b.length - i - 8) / (rate * channels * 2);
    i += 8 + size;
  }
  throw new Error(`No audio data in ${path}`);
}

/** One narration line, via Cartesia Sonic; cached by text and voice. */
async function synth(text) {
  const voice = env("BRAG_VOICE_ID") ?? "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4";
  const name = `vo-${createHash("sha1").update(`${voice}|${text}`).digest("hex").slice(0, 12)}.wav`;
  const cache = join(ROOT, "voice-cache");
  mkdirSync(cache, { recursive: true });
  const cached = join(cache, name);
  if (!existsSync(cached)) {
    const key = env("CARTESIA_API_KEY");
    if (!key) throw new Error("CARTESIA_API_KEY is not set (or pass --silent).");
    const res = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cartesia-Version": "2026-08-14", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model_id: env("CARTESIA_MODEL") ?? "sonic-3.6",
        transcript: text,
        voice: { mode: "id", id: voice },
        output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: SR },
        language: "en",
      }),
    });
    if (!res.ok) throw new Error(`Cartesia ${res.status}: ${(await res.text()).slice(0, 300)}`);
    writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
  }
  // The renderer serves audio from the run folder.
  mkdirSync(join(OUT, "vo"), { recursive: true });
  copyFileSync(cached, join(OUT, "vo", name));
  return { file: `vo/${name}`, seconds: wavSeconds(cached) };
}

let music;
if (!process.argv.includes("--silent")) {
  for (const seg of segments) {
    if (!seg.say) continue;
    const vo = await synth(seg.say);
    seg.voice = vo.file;
    seg.voiceLead = LEAD;
    const needed = LEAD + vo.seconds + TAIL;
    if (needed > seg.seconds) {
      // A clip slows towards real time (never below 0.8×) to make room; past its cut it simply keeps playing.
      if (seg.kind === "clip") seg.rate = Math.max(0.8, Math.round((seg.length / needed) * 100) / 100);
      seg.seconds = needed;
    }
    process.stdout.write(`\rVoice ${segments.indexOf(seg) + 1}/${segments.length}   `);
  }
  const track = join(HERE, "..", "..", "..", "brag-output", "v2-vo", "work", "music.wav");
  if (existsSync(track)) {
    copyFileSync(track, join(OUT, "music.wav"));
    music = "music.wav";
  }
  console.log("");
}
console.log(`Segments: ${segments.length}, about ${Math.round(segments.reduce((s, x) => s + x.seconds, 0))}s${music ? ", narrated with music" : ""}`);

if (process.argv.includes("--plan")) {
  let t = 0;
  for (const seg of segments) {
    const files = seg.kind === "multi" ? seg.screens : seg.kind === "clip" ? [seg] : [];
    const span = files.map((f) => `${f.file}@${f.from.toFixed(1)}→${(f.from + seg.seconds * f.rate).toFixed(1)}s ×${f.rate}`).join(" | ");
    console.log(`${t.toFixed(1).padStart(6)}s +${seg.seconds.toFixed(1).padStart(5)}  ${seg.kind.padEnd(12)} ${span}`);
    t += seg.seconds;
  }
  process.exit(0);
}
const planArg = process.argv.find((x) => x.startsWith("--export-plan="));
if (planArg) {
  // Hand the finished edit (cuts, captions, voice files, composites) to render_frames.py instead of Remotion.
  const plan = { run: OUT, layout: SHORT ? "tall" : "wide", music: music ? join(OUT, music) : null, model: timeline.model, segments, deliver: DELIVER,
    name: SHORT ? "cogna-pilot-short-9x16.mp4" : "cogna-pilot-walkthrough-16x9.mp4" };
  writeFileSync(planArg.slice("--export-plan=".length), JSON.stringify(plan, null, 2));
  console.log(`Plan written: ${segments.length} segments, ${Math.round(segments.reduce((t, x) => t + x.seconds, 0))}s`);
  process.exit(0);
}
const serveUrl = await bundle({ entryPoint: join(HERE, "index.tsx"), publicDir: OUT });
const inputProps = { segments, model: timeline.model, layout: SHORT ? "tall" : "wide", ...(music ? { music } : {}) };
const composition = await selectComposition({ serveUrl, id: "PilotWalkthrough", inputProps });
const output = join(ROOT, `cogna-pilot-walkthrough-${timeline.model}-${RUN_NAME}${music ? "-narrated" : ""}${SHORT ? "-short" : ""}.mp4`);
await renderMedia({
  serveUrl,
  composition,
  codec: "h264",
  outputLocation: output,
  inputProps,
  // Several Chrome workers decoding 1080p video stall frame fetches on 8 GB machines; one worker is slower but reliable there.
  concurrency: Number(process.env.RENDER_CONCURRENCY ?? (totalmem() >= 16 * 2 ** 30 ? 3 : 1)),
  ...(process.env.RENDER_FRAMES ? { frameRange: process.env.RENDER_FRAMES.split("-").map(Number) } : {}),
  timeoutInMilliseconds: 120000,
  onProgress: ({ progress }) => {
    if (Math.round(progress * 100) % 10 === 0) process.stdout.write(`\rRendering ${Math.round(progress * 100)}%   `);
  },
});
console.log(`\nWrote ${output}`);
if (DELIVER) {
  mkdirSync(DELIVER, { recursive: true });
  const name = SHORT ? "cogna-pilot-short-9x16.mp4" : "cogna-pilot-walkthrough-16x9.mp4";
  copyFileSync(output, join(DELIVER, name));
  writeFileSync(join(DELIVER, SHORT ? "script-short.json" : "script.json"), JSON.stringify(segments.map((x) => ({ kind: x.kind, seconds: Math.round(x.seconds * 10) / 10, caption: x.caption ?? x.title, say: x.say })), null, 2));
  console.log(`Copied to ${join(DELIVER, name)}`);
}
