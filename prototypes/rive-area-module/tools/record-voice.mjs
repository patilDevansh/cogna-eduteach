// Records Kiara (Cartesia, Indian accent, upbeat) saying every line in lines.luau, into voice/<key>.mp3.
// Only new or changed lines are recorded again. Run from anywhere:
//   node prototypes/rive-area-module/tools/record-voice.mjs
// Spoken maths, Indian classroom style: × "times", ² "square", ½ "half", − "minus".
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
const KIARA = "f8f5f1b2-f02d-4d8e-a40d-fd850a487b3d";

// key = 'text' or key = "text", one per line
const src = fs.readFileSync(path.join(PROJECT, "lines.luau"), "utf8");
const lines = {};
for (const m of src.matchAll(/^\s*([a-z0-9]+)\s*=\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"),?\s*$/gm)) {
  lines[m[1]] = (m[2] ?? m[3]).replace(/\\(.)/g, "$1");
}

export function spoken(t) {
  return t
    .replace(/×/g, " times ").replace(/½/g, "half").replace(/²/g, " square").replace(/−/g, " minus ")
    .replace(/ \+ /g, " plus ").replace(/ = /g, " equals ").replace(/\s{2,}/g, " ").trim();
}

async function cartesia(text) {
  const KEY = env.CARTESIA_API_KEY;
  if (!KEY) throw new Error("CARTESIA_API_KEY missing in .env");
  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cartesia-Version": "2024-11-13", "X-API-Key": KEY },
    body: JSON.stringify({
      model_id: env.CARTESIA_MODEL_AREA || "sonic-latest", transcript: text, language: "en",
      voice: { mode: "id", id: KIARA },
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

const outDir = path.join(PROJECT, "voice");
fs.mkdirSync(outDir, { recursive: true });
const stampFile = path.join(outDir, ".recorded.json");
const stamps = fs.existsSync(stampFile) ? JSON.parse(fs.readFileSync(stampFile, "utf8")) : {};
let made = 0, kept = 0, failed = 0;
for (const [key, text] of Object.entries(lines)) {
  const say = spoken(text), file = path.join(outDir, `${key}.mp3`);
  if (stamps[key] === say && fs.existsSync(file)) { kept++; continue; }
  try {
    const bytes = await cartesia(say);
    fs.writeFileSync(file, bytes);
    stamps[key] = say; made++;
    fs.writeFileSync(stampFile, JSON.stringify(stamps, null, 2));
    console.log("recorded", key, `${Math.round(bytes.length / 1024)} KB`);
  } catch (e) { failed++; console.error("FAIL", key, e.message); if (/\b(401|402|403)\b/.test(e.message)) break; }
}
console.log(`lines ${Object.keys(lines).length} · recorded ${made} · kept ${kept} · failed ${failed}`);
// scene.rml needs one AudioAsset per recorded line (written by hand, not by this script):
const missing = Object.keys(lines).filter((k) => fs.existsSync(path.join(outDir, `${k}.mp3`)));
const scene = fs.readFileSync(path.join(PROJECT, "scene.rml"), "utf8");
const toAdd = missing.filter((k) => !scene.includes(`name="v_${k}"`));
if (toAdd.length) {
  console.log(`\nscene.rml is missing ${toAdd.length} voice assets. Add these lines under the Kiara comment:`);
  for (const k of toAdd) console.log(`    <AudioAsset file="voice/${k}.mp3" name="v_${k}"/>`);
}
