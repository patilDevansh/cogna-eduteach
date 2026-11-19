// Pre-records lesson captions into audio/<provider>-<voice>/<hash>.<mp3|wav>.
// Every run updates audio/voices.js (all recorded voices, for the demo drawer's voice switch).
// The default voice (Sarvam Bulbul v3 "priya", same as apps/api/src/ai/sarvam-tts.service.ts) also writes
// audio/manifest.js, which the app falls back to for any line a chosen voice has not recorded.
// Run from the repo root:
//   node prototypes/school-pilot-student-trail/tools/record-narration.mjs                                 (all captions, Sarvam priya)
//   node prototypes/school-pilot-student-trail/tools/record-narration.mjs --voice=kavya                   (another Sarvam voice)
//   node prototypes/school-pilot-student-trail/tools/record-narration.mjs --provider=cartesia --voice=kiara --only=para-field
//   node prototypes/school-pilot-student-trail/tools/record-narration.mjs --provider=gemini --voice=Sulafat --only=para-field
//   node prototypes/school-pilot-student-trail/tools/record-narration.mjs --samples                       (one line in several Sarvam voices -> audio/samples/)
// --only=<text> records only lesson files whose name contains <text>. Re-running only records lines that are new or changed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(ROOT, "../..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, ".env"), "utf8").split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")]),
);
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const PROVIDER = String(args.provider || "sarvam");
const ONLY = args.only ? String(args.only) : null;

/** Must match narrationKey() in screens/session.js */
export function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
/** Must match spokenText() in screens/session.js. Indian classroom style: "a square plus b square". */
export function spoken(t) {
  return t
    // maths letters as capitals: Indian-English voices read a capital A as the letter ("ay"), never "uh" or "I"
    .replace(/\b([bch])\b/g, (m, l) => l.toUpperCase())
    .replace(/(^|[\s(+=×−])a(?=\s*(?:²|[+=×−)]|[.,]|$))/g, "$1A")
    .replace(/\ba(?= and B\b| is \d| = )/g, "A")
    .replace(/\bside a\b/g, "side A")
    .replace(/ \+ /g, " plus ").replace(/Baudhāyana/g, "Baudhayana").replace(/Śulba Sūtras/g, "Shulba Sutras")
    .replace(/²/g, " square").replace(/√/g, "the square root of ").replace(/−/g, " minus ")
    .replace(/×/g, " times ").replace(/=/g, " equals ").replace(/½/g, "half");
}

/* ---------- providers: each returns { bytes, ext } ---------- */
const CARTESIA_VOICES = {
  kiara: { id: "f8f5f1b2-f02d-4d8e-a40d-fd850a487b3d", label: "Cartesia · Kiara (upbeat, Indian accent)" },
  krishna: { id: "c63361f8-d142-4c62-8da7-8f8149d973d6", label: "Cartesia · Krishna (easygoing, Indian accent)" },
};
const GEMINI_STYLE = "Read this aloud as a warm, lively young Indian maths teacher talking to a 13-year-old in class. " +
  "Indian English accent. Sound like you are smiling and enjoying it, with a natural pace and a short pause at each full stop. Say only the words after the colon:";

async function sarvam(text, speaker) {
  const KEY = env.SARVAM_API_KEY; if (!KEY) throw new Error("SARVAM_API_KEY missing in .env");
  const body = { text, target_language_code: "en-IN", speaker, model: env.SARVAM_MODEL || "bulbul:v3", output_audio_codec: "mp3", pace: Number(args.pace || 0.95) };
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST", headers: { "Content-Type": "application/json", "api-subscription-key": KEY }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  if (!j.audios?.length) throw new Error("no audio returned");
  return { bytes: Buffer.concat(j.audios.map((a) => Buffer.from(a, "base64"))), ext: "mp3" };
}
async function cartesia(text, voice) {
  const KEY = env.CARTESIA_API_KEY; if (!KEY) throw new Error("CARTESIA_API_KEY missing in .env");
  const v = CARTESIA_VOICES[voice] || { id: voice };
  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cartesia-Version": "2026-08-14", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model_id: env.CARTESIA_MODEL || "sonic-3.6", transcript: text, voice: { id: v.id }, language: "en",
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 } }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), ext: "mp3" };
}
function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
async function gemini(text, voice) {
  const KEY = env.GEMINI_API_KEY || env.OPENAI_API_KEY; if (!KEY) throw new Error("no Gemini key in .env");
  const model = String(args.model || "gemini-3.8-flash-tts");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${GEMINI_STYLE} ${text}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("no audio returned");
  const rate = Number((part.inlineData.mimeType.match(/rate=(\d+)/) || [])[1] || 24000);
  return { bytes: wav(Buffer.from(part.inlineData.data, "base64"), rate), ext: "wav" };
}
const PROVIDERS = { sarvam, cartesia, gemini };
const DEFAULT_VOICE = { sarvam: env.SARVAM_VOICE_ID || "priya", cartesia: "kiara", gemini: "Sulafat" };
if (!PROVIDERS[PROVIDER]) { console.error("unknown --provider", PROVIDER); process.exit(1); }
const VOICE = String(args.voice || DEFAULT_VOICE[PROVIDER]);
/** one line; on a rate limit (429) wait and try again a few times */
async function tts(text) {
  for (let attempt = 0; ; attempt++) {
    try { return await PROVIDERS[PROVIDER](text, VOICE); }
    catch (e) {
      const m = String(e.message).match(/retry in ([\d.]+)s/i);
      if (!/^429\b/.test(e.message) || attempt >= 4) throw e;
      const ms = Math.min(90, m ? Number(m[1]) + 2 : 25 * (attempt + 1)) * 1000;
      process.stdout.write(`(rate limit, waiting ${Math.round(ms / 1000)}s)`);
      await new Promise((r) => setTimeout(r, ms));
    }
  }
}
const LABEL = String(args.label || (PROVIDER === "cartesia" && CARTESIA_VOICES[VOICE] ? CARTESIA_VOICES[VOICE].label
  : PROVIDER === "gemini" ? `Gemini · ${VOICE} (told to sound like a lively Indian teacher)` : `Sarvam · ${VOICE[0].toUpperCase()}${VOICE.slice(1)}`));

const outRoot = path.join(ROOT, "audio");
fs.mkdirSync(outRoot, { recursive: true });

if (args.samples) {
  const line = "The square on side a holds 3 × 3, which is 9. So a² + b² = c², and c is 5.";
  const voices = String(args.samples === true ? "priya,kavya,ritu,neha,aditya,shubh,rahul" : args.samples).split(",");
  fs.mkdirSync(path.join(outRoot, "samples"), { recursive: true });
  for (const v of voices) {
    try { fs.writeFileSync(path.join(outRoot, "samples", `${v}.mp3`), (await sarvam(spoken(line), v)).bytes); console.log("sample", v); }
    catch (e) { console.error("FAIL", v, e.message); }
  }
  process.exit(0);
}

const captions = new Set();
for (const f of fs.readdirSync(path.join(ROOT, "anim")).filter((f) => f.endsWith(".js") && (!ONLY || f.includes(ONLY)))) {
  const src = fs.readFileSync(path.join(ROOT, "anim", f), "utf8");
  for (const m of src.matchAll(/caption:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g)) {
    const raw = (m[1] ?? m[2]).replace(/\\(["'\\])/g, "$1");
    if (raw.trim()) captions.add(raw);
  }
}

const dirName = `${PROVIDER}-${VOICE.toLowerCase()}`, outDir = path.join(outRoot, dirName);
fs.mkdirSync(outDir, { recursive: true });

// all voices recorded so far (window.Cogna.voiceSets = { dirName: { label, map } })
const voicesFile = path.join(outRoot, "voices.js");
let sets = {};
if (fs.existsSync(voicesFile)) {
  const src = fs.readFileSync(voicesFile, "utf8"), i = src.indexOf("= ");
  try { sets = JSON.parse(src.slice(i + 2).trim().replace(/;\s*$/, "")); } catch { sets = {}; }
}
const manifest = ONLY && sets[dirName] ? { ...sets[dirName].map } : {};
let made = 0, kept = 0, failed = 0;
for (const c of captions) {
  const id = hash(c), base = hash(spoken(c));
  const existing = ["mp3", "wav"].map((e) => `audio/${dirName}/${base}.${e}`).find((f) => fs.existsSync(path.join(ROOT, f)));
  if (existing) { manifest[id] = existing; kept++; continue; }
  try {
    const { bytes, ext } = await tts(spoken(c));
    const file = `audio/${dirName}/${base}.${ext}`;
    fs.writeFileSync(path.join(ROOT, file), bytes);
    manifest[id] = file; made++; process.stdout.write(".");
  } catch (e) { failed++; console.error("\nFAIL", JSON.stringify(c.slice(0, 60)), e.message); if (/\b(401|402|403)\b/.test(e.message)) break; }
}
if (!ONLY) {
  // drop recordings of this voice that no caption uses any more
  const keep = new Set(Object.values(manifest).map((f) => path.basename(f)));
  for (const f of fs.readdirSync(outDir)) if (/\.(mp3|wav)$/.test(f) && !keep.has(f)) fs.unlinkSync(path.join(outDir, f));
}
sets[dirName] = { label: LABEL, map: manifest };
fs.writeFileSync(voicesFile, "/* Generated by tools/record-narration.mjs — every recorded voice (demo drawer: Voice). */\nwindow.Cogna.voiceSets = " + JSON.stringify(sets) + ";\n");
if (PROVIDER === "sarvam" && VOICE === DEFAULT_VOICE.sarvam && !ONLY) {
  fs.writeFileSync(path.join(outRoot, "manifest.js"),
    `/* Generated by tools/record-narration.mjs — caption hash -> recorded narration (Sarvam, voice ${VOICE}). */\nwindow.Cogna.narration = ` + JSON.stringify(manifest, null, 0) + ";\n");
}
console.log(`\n${LABEL} · lines ${captions.size} · recorded ${made} · already had ${kept} · failed ${failed}`);
