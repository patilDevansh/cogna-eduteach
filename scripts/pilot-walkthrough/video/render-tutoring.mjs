/**
 * Edits a record-tutoring.mjs run into the "voice and video tutoring in
 * Cogna" video: real footage, the app's own voice (read-aloud, the
 * micro-lesson, the full lesson) where it played, and an Indian-English
 * narrator (Cartesia) between, over quiet music.
 *
 *   node scripts/pilot-walkthrough/video/render-tutoring.mjs [run-folder] [--plan] [--deliver=dir]
 *
 * Narrator voice: TUTOR_VOICE_ID (default Cartesia "Devansh", Indian English).
 * Renders with render_frames.py (PIL + OpenCV), muxed by mux.swift.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(HERE, "..", "out", "tutoring");
const argRun = process.argv.slice(2).find((a) => !a.startsWith("--"));
const RUN_NAME = argRun ?? readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d, "timeline.json"))).sort().at(-1);
if (!RUN_NAME) throw new Error("No recording yet: run record-tutoring.mjs first.");
const OUT = join(ROOT, RUN_NAME);
const timeline = JSON.parse(readFileSync(join(OUT, "timeline.json"), "utf8"));
const deliverArg = process.argv.find((x) => x.startsWith("--deliver="));
const DELIVER = deliverArg ? deliverArg.slice("--deliver=".length) : join(HERE, "..", "..", "..", "brag-output", "tutoring-voice-video");

// ---------------------------------------------------------------- tools
const require = createRequire(new URL("../../../packages/lesson-video/package.json", import.meta.url));
const fromRenderer = createRequire(require.resolve("@remotion/renderer"));
const compositor = dirname(fromRenderer.resolve(`@remotion/compositor-${process.platform}-${process.arch}/package.json`));
const FF = { bin: join(compositor, "ffmpeg"), env: { ...process.env, DYLD_LIBRARY_PATH: compositor, LD_LIBRARY_PATH: compositor } };
const ff = (args) => execFileSync(FF.bin, ["-y", "-loglevel", "error", ...args], { env: FF.env, stdio: "inherit" });

function env(key) {
  if (process.env[key]) return process.env[key];
  const file = join(HERE, "..", "..", "..", ".env");
  for (const line of existsSync(file) ? readFileSync(file, "utf8").split("\n") : []) {
    if (line.startsWith(`${key}=`)) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}
function wavSeconds(path) {
  const b = readFileSync(path);
  const channels = b.readUInt16LE(22), rate = b.readUInt32LE(24);
  for (let i = 12; i < b.length - 8;) {
    const id = b.toString("ascii", i, i + 4), size = b.readUInt32LE(i + 4);
    if (id === "data") return Math.min(size, b.length - i - 8) / (rate * channels * 2);
    i += 8 + size;
  }
  throw new Error(`No audio data in ${path}`);
}

// ---------------------------------------------------------------- footage and sounds
const at = (who, label, extra = {}) => timeline.marks.find((m) => m.who === who && m.label === label && Object.entries(extra).every(([k, v]) => m[k] === v))?.at ?? null;
const marks = (who, label) => timeline.marks.filter((m) => m.who === who && m.label === label);

for (const who of Object.keys(timeline.clips)) {
  const c = timeline.clips[who];
  if (!c.file) continue;
  const mp4 = c.file.replace(/\.webm$/, ".seek.mp4");
  if (!existsSync(join(OUT, mp4))) {
    console.log(`Transcoding ${c.file}…`);
    ff(["-i", join(OUT, c.file), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-g", "30", "-pix_fmt", "yuv420p", "-an", join(OUT, mp4)]);
  }
  c.seek = mp4;
}
const sounds = timeline.sounds.map((s) => {
  const wav = s.file.replace(/\.\w+$/, ".48k.wav");
  if (!existsSync(join(OUT, wav))) ff(["-i", join(OUT, s.file), "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", join(OUT, wav)]);
  return { ...s, wav, seconds: wavSeconds(join(OUT, wav)) };
});

const NAME = { teacher: "Teacher", aarav: "Student · Aarav" };
/** A cut of one screen, sped up to fit maxSeconds. With `withSounds`, it runs in real time and carries the app's sounds. */
function clip(who, start, end, caption, say, { maxSeconds = Infinity, minRate = 1, withSounds = false, soundUntil = Infinity } = {}) {
  const c = timeline.clips[who];
  if (start == null || end == null || !c?.seek) return [];
  let own = [];
  if (withSounds) {
    own = sounds.filter((s) => s.who === who && s.at >= start - 0.2 && s.at <= (soundUntil === Infinity ? end : soundUntil));
    if (own.length) end = Math.max(end, ...own.map((s) => s.at + s.seconds + 0.8));
  }
  if (end <= start) return [];
  const length = end - start;
  const rate = withSounds ? 1 : Math.round(Math.max(minRate, length / maxSeconds) * 10) / 10;
  return [{
    kind: "clip", file: c.seek, from: Math.max(0, start - c.startedAt), length, rate, seconds: length / rate,
    who: NAME[who], caption, say,
    ...(own.length ? { sounds: own.map((s) => ({ file: s.wav, at: s.at - start })) } : {}),
  }];
}

/** A teacher screenshot, panned top to bottom when it's taller than the frame. */
function teacherStill(file, caption, say, seconds) {
  if (!existsSync(join(OUT, file))) return [];
  const png = readFileSync(join(OUT, file));
  return [{ kind: "still", file, who: "Teacher", imageHeight: png.readUInt32BE(20) * (1280 / png.readUInt32BE(16)), seconds, caption, say }];
}

// ---------------------------------------------------------------- the edit
const answerOf = (turn) => marks("aarav", "answer").find((m) => m.turn === turn)?.at ?? null;
/** The quickest-answered question of a kind (a slow one would have to be sped up past watching). */
const firstOf = (kind) => marks("aarav", "question").filter((m) => m.kind === kind && answerOf(m.turn) != null)
  .sort((a, b) => (answerOf(a.turn) - a.at) - (answerOf(b.turn) - b.at))[0];
const GAMES = [
  ["TILES_CRYSTAL", "Split it: the answer is built from tiles.", "Some questions are games. Here Aarav builds the answer from tiles. The server rebuilds it from the picks and marks it exactly like a typed answer."],
  ["TILES_BRIDGE", "Bracket bridge: both brackets, from tiles.", "Bracket bridge: both brackets, built tile by tile."],
  ["GARDEN", "Garden fences: a trinomial's two brackets.", "Garden fences: the two brackets of a trinomial, planted as tiles."],
  ["FIREFLY", "Catch the firefly: the pair that multiplies and adds right.", "Catch the firefly: which two numbers multiply and add to the right values?"],
  ["IMPOSTOR", "Spot the impostor: the form that only looks equal.", "Spot the impostor. Three forms are equal; one only looks equal."],
  ["DETECTIVE", "Detective: find the first wrong line.", "Detective: find the first line where the working goes wrong."],
  ["FISHING", "Fishing: net every fully factorised answer.", "Fishing: net every answer that's fully factorised."],
];
const games = GAMES.flatMap(([kind, caption, say]) => {
  const q = firstOf(kind);
  return q ? clip("aarav", q.at - 0.3, (answerOf(q.turn) ?? q.at + 6) + 1.2, caption, say, { maxSeconds: 6 }) : [];
});
// The free stand-in model pads typed questions with placeholder numbers; the games are built by code and unaffected.
const STANDIN = timeline.model === "fake";
const typed = STANDIN ? null : firstOf("TYPED");

const PRACTICE = {
  "factor-safe": ["Factor safe: two dials, with live product and sum lamps.", "Practice is games too. Factor safe: two dials, with live product and sum lamps, and a hint that names the mistake."],
  rectangle: ["Make it a rectangle: move the strips until the tiles fit.", "Make it a rectangle: move the x strips until the corner fits."],
  build: ["Build it: tiles, with feedback on every try.", "Build it: tiles again, with feedback on every try."],
  "mark-it": ["The marker's desk: check Bit the robot's work.", "The marker's desk. Aarav marks Bit the robot's papers, and names each mistake."],
  rush: ["Bracket rush: a quick round against the clock.", "And bracket rush: a quick fluency round against the clock."],
};
const practiceMarks = marks("aarav", "practice-game");
const seenPractice = new Set();
const practice = practiceMarks.flatMap((m, i) => {
  const p = PRACTICE[m.kind];
  if (!p || seenPractice.has(m.kind)) return [];
  seenPractice.add(m.kind);
  const end = practiceMarks[i + 1]?.at ?? at("aarav", "practice-done");
  return clip("aarav", m.at - 0.3, end, p[0], p[1], { maxSeconds: m.kind === "rush" ? 9 : 7 });
});

const readAt = at("aarav", "read-aloud");
const lessonPlay = at("aarav", "lesson-play");
const lessonSoundEnd = lessonPlay == null ? null : lessonPlay + 50;
const exitHeadline = marks("aarav", "exit-done")[0]?.headline ?? "";
const exitSay = /nearly/i.test(exitHeadline)
  ? "One lantern shines: Aarav got one of the two. Nearly there, and the teacher sees exactly that."
  : /not yet/i.test(exitHeadline)
    ? "Not yet, this time, and Cogna says so honestly. The next lesson shows it a different way."
    : "Both lanterns shine: Aarav got both, alone, after the lesson.";

const segments = [
  {
    kind: "card", seconds: 7, eyebrow: "Cogna · voice and video tutoring", title: "How Cogna tutors one student, by voice and video.",
    lines: [
      "Grade 8 factorisation, in the real app.",
      "Aarav's answers are scripted for this recording. Everything Cogna does in response is live.",
      ...(STANDIN ? ["Typed questions came from a free stand-in model for this recording; games, lessons and voices are the production versions."] : []),
    ],
    say: "This is how Cogna tutors a student, by voice and video. It's the real app, running live. Aarav's answers are scripted for this recording; everything Cogna does in response is real.",
  },
  ...(timeline.clips.teacher?.seek
    ? clip("teacher", at("teacher", "login"), (at("teacher", "released") ?? 0) + 2, "The teacher creates a class and starts the quick check.",
      "The teacher creates a class, shares the join code, and starts the quick check. That's all the teacher has to do.", { maxSeconds: 9 })
    : [
      ...teacherStill("teacher-class.png", "The teacher creates a class. Cogna gives it a join code.", "The teacher creates a class, and Cogna gives it a join code.", 4.5),
      ...teacherStill("teacher-released.png", "One button starts the quick check for the whole class.", "Then one button starts the quick check. That's all the teacher has to do.", 4.5),
    ]),
  ...clip("aarav", at("aarav", "login"), (at("aarav", "joined") ?? 0) + 1, "Aarav joins with the class code.", "Aarav signs in and joins with the class code.", { maxSeconds: 6 }),
  ...clip("aarav", at("aarav", "diagnostic-start"), readAt, "The diagnostic begins: adaptive, about fifteen minutes at most.",
    "The diagnostic begins. If reading is hard, Aarav can tap, read it to me, and Cogna reads the question aloud, maths and all.", { maxSeconds: 5 }),
  ...(readAt != null ? clip("aarav", readAt - 0.5, readAt + 1, "Read it to me: Cogna reads the question aloud.", null, { withSounds: true, soundUntil: readAt + 15 }) : []),
  ...games,
  ...(typed ? clip("aarav", typed.at - 0.3, (answerOf(typed.turn) ?? typed.at + 6) + 1, "Other questions are typed, with working.",
    "Other questions are typed, with working, so Cogna sees how Aarav thinks, not just the final answer.", { maxSeconds: 6 }) : []),
  ...clip("aarav", at("aarav", "report"), at("aarav", "lesson-page"), "The lotus blooms. The report says what to work on first.",
    "As soon as Cogna is sure where Aarav should start, the test ends. The lotus blooms, and the report says, in plain words, what to work on first.", { maxSeconds: 9 }),
  ...clip("aarav", at("aarav", "lesson-page"), at("aarav", "micro-play"), "First: 20 seconds on Aarav's own mistake.",
    "First, a twenty second lesson on Aarav's own mistake. It's narrated, and the maths moves while the voice explains.", { maxSeconds: 5 }),
  ...clip("aarav", at("aarav", "micro-play"), at("aarav", "micro-check"), "The micro-lesson, built from Aarav's own answer, in Cogna's voice.", null, { withSounds: true }),
  ...clip("aarav", at("aarav", "micro-check"), (at("aarav", "micro-done") ?? 0) + 1, "Then one quick check, straight away.",
    "Then one quick check, straight away.", { maxSeconds: 6 }),
  ...clip("aarav", at("aarav", "micro-done"), lessonPlay == null ? null : lessonPlay + 1, "Next: the full lesson, written from Aarav's answers.",
    "Next, the full lesson, written from Aarav's answers. An algebra engine checks every equation before it's shown.", { maxSeconds: 5 }),
  ...(lessonPlay != null ? clip("aarav", lessonPlay + 0.5, lessonPlay + 2, "The full lesson: every scene narrated, moving on by itself.", null, { withSounds: true, soundUntil: lessonSoundEnd }) : []),
  ...practice,
  ...clip("aarav", at("aarav", "exit"), (at("aarav", "exit-done") ?? 0) + 3, "The lantern gate: two fresh questions, alone. One try each.",
    `Finally, the lantern gate: two fresh questions, on Aarav's own. No hints, one try each, and both results open together. ${exitSay}`, { maxSeconds: 14 }),
  ...teacherStill("teacher-final.png", "The teacher sees every result, including what each student did alone.",
    "And the teacher sees it all, including what each student could do on their own, after the lesson.", 8),
  {
    kind: "card", seconds: 6, eyebrow: "Cogna", title: "Find the gap. Teach it by voice and video. Check it alone.",
    lines: ["Every game, lesson and check is built and verified by code.", "The voice is Cogna's own, generated for each student."],
    say: "Cogna. Find the gap, teach it by voice and video, and check it on their own.",
  },
];

// ---------------------------------------------------------------- narrator
const LEAD = 0.45, TAIL = 0.6, SR = 44100;
async function synth(text) {
  const voice = env("TUTOR_VOICE_ID") ?? "1259b7e3-cb8a-43df-9446-30971a46b8b0";
  const name = `vo-${createHash("sha1").update(`${voice}|${text}`).digest("hex").slice(0, 12)}.wav`;
  const cache = join(ROOT, "..", "voice-cache");
  mkdirSync(cache, { recursive: true });
  const cached = join(cache, name);
  if (!existsSync(cached)) {
    const key = env("CARTESIA_API_KEY");
    if (!key) throw new Error("CARTESIA_API_KEY is not set.");
    const res = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cartesia-Version": "2026-08-14", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model_id: env("CARTESIA_MODEL") ?? "sonic-3.6", transcript: text, voice: { mode: "id", id: voice },
        output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: SR }, language: "en",
      }),
    });
    if (!res.ok) throw new Error(`Cartesia ${res.status}: ${(await res.text()).slice(0, 300)}`);
    writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
  }
  mkdirSync(join(OUT, "vo"), { recursive: true });
  copyFileSync(cached, join(OUT, "vo", name));
  return { file: `vo/${name}`, seconds: wavSeconds(cached) };
}
for (const seg of segments) {
  if (!seg.say) continue;
  const vo = await synth(seg.say);
  seg.voice = vo.file;
  seg.voiceLead = LEAD;
  const needed = LEAD + vo.seconds + TAIL;
  if (needed > seg.seconds) {
    if (seg.kind === "clip") seg.rate = Math.max(0.8, Math.round((seg.length / needed) * 100) / 100);
    seg.seconds = needed;
  }
}
const music = join(HERE, "..", "..", "..", "brag-output", "v2-vo", "work", "music.wav");

let t = 0;
for (const seg of segments) {
  console.log(`${t.toFixed(1).padStart(6)}s +${seg.seconds.toFixed(1).padStart(5)}  ${seg.kind.padEnd(6)} ${seg.sounds ? `♪${seg.sounds.length} ` : ""}${seg.caption ?? seg.title}`);
  t += seg.seconds;
}
console.log(`Total ${Math.round(t)}s, ${segments.length} segments`);
if (process.argv.includes("--plan")) process.exit(0);

// Dev-only overlays some recordings carry (Next's badge bottom-left, the dev switch bottom-right), in stage pixels.
const MASKS = [[8, 732, 78, 798], [1100, 736, 1278, 798]];
const plan = { run: OUT, layout: "wide", masks: MASKS, music: existsSync(music) ? music : null, model: timeline.model, segments, deliver: DELIVER, name: "cogna-voice-video-tutoring.mp4" };
const planFile = join(OUT, "plan.json");
writeFileSync(planFile, JSON.stringify(plan, null, 2));
execFileSync("python3", [join(HERE, "render_frames.py"), planFile], { stdio: "inherit" });
writeFileSync(join(DELIVER, "script.json"), JSON.stringify(segments.map((x) => ({ kind: x.kind, seconds: Math.round(x.seconds * 10) / 10, caption: x.caption ?? x.title, say: x.say ?? "(Cogna's own voice)" })), null, 2));
console.log(`Delivered to ${DELIVER}`);
