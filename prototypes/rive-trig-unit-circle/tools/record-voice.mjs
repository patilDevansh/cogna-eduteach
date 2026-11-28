// Records the lesson narration. Default: Cartesia "kiara" (Indian accent, upbeat).
// --provider=sarvam records Sarvam Bulbul v3 "priya" instead (into voice-priya/).
// Settings match prototypes/school-pilot-student-trail/tools/record-narration.mjs.
// Reads the spoken lines from tools/lines.json; only new or changed lines are recorded again.
//   node prototypes/rive-trig-unit-circle/tools/record-voice.mjs
//   node prototypes/rive-trig-unit-circle/tools/record-voice.mjs --provider=sarvam
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, "..");
const REPO = path.resolve(PROJECT, "../..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, ".env"), "utf8").split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")]),
);
const PROVIDER = process.argv.includes("--provider=sarvam") ? "sarvam" : "cartesia";

const lines = JSON.parse(fs.readFileSync(path.join(HERE, "lines.json"), "utf8"));
// The lesson plays voice/; the Sarvam takes are kept beside it for comparison.
const outDir = path.join(PROJECT, PROVIDER === "sarvam" ? "voice-priya" : "voice");
fs.mkdirSync(outDir, { recursive: true });
const stampFile = path.join(outDir, ".recorded.json");
const stamps = fs.existsSync(stampFile) ? JSON.parse(fs.readFileSync(stampFile, "utf8")) : {};

async function sarvam(text) {
  const KEY = env.SARVAM_API_KEY;
  if (!KEY) throw new Error("SARVAM_API_KEY missing in .env");
  const body = {
    text, target_language_code: "en-IN", speaker: env.SARVAM_VOICE_ID || "priya",
    model: env.SARVAM_MODEL || "bulbul:v3", output_audio_codec: "mp3", pace: 0.95,
  };
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST", headers: { "Content-Type": "application/json", "api-subscription-key": KEY }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  if (!j.audios?.length) throw new Error("no audio returned");
  return Buffer.concat(j.audios.map((a) => Buffer.from(a, "base64")));
}

async function cartesia(text) {
  const KEY = env.CARTESIA_API_KEY;
  if (!KEY) throw new Error("CARTESIA_API_KEY missing in .env");
  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cartesia-Version": "2026-08-14", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model_id: env.CARTESIA_MODEL || "sonic-3.6", transcript: text, language: "en",
      voice: { mode: "id", id: "f8f5f1b2-f02d-4d8e-a40d-fd850a487b3d" }, // kiara
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

const speak = PROVIDER === "sarvam" ? sarvam : cartesia;
for (const [key, text] of Object.entries(lines)) {
  const file = path.join(outDir, `${key}.mp3`);
  if (stamps[key] === text && fs.existsSync(file)) { console.log("kept", key); continue; }
  const bytes = await speak(text);
  fs.writeFileSync(file, bytes);
  stamps[key] = text;
  console.log("recorded", key, `${Math.round(bytes.length / 1024)} KB`);
}
fs.writeFileSync(stampFile, JSON.stringify(stamps, null, 2));
