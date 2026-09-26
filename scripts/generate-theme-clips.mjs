// Generates looping scene backdrops for a themed lesson via UniKey's OpenAI-style video API.
// Usage: node scripts/generate-theme-clips.mjs   (reads UNIKEY_API_KEY from .env or apps/api/.env)
// Output: apps/web/public/themes/magic/<model>/scene-<n>.mp4 — run once, commit the winners, never call at runtime.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";

const KEY = [".env", "apps/api/.env"].filter(existsSync).map((f) => readFileSync(f, "utf8").match(/^UNIKEY_API_KEY=["']?([^"'\n]+)/m)?.[1]).find(Boolean);
if (!KEY) throw new Error("UNIKEY_API_KEY missing from .env / apps/api/.env");
const BASE = "https://www.getunikey.ai/v1/videos";
const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const PIP = "Pip, a small friendly purple owl wearing a pointed wizard hat with a gold star";
const STYLE = "warm storybook illustration, deep purple night sky, gold sparkles, soft glow, gentle slow camera motion, no text, no letters, no numbers";
const SCENES = [
  `${PIP}, perched on a golden enchanted balance scale, looking at the viewer kindly. ${STYLE}`,
  `A glowing golden charm of light drifts onto the left pan of an enchanted balance scale, then an identical charm lands on the right pan. ${PIP} watches. ${STYLE}`,
  `An enchanted golden balance scale settles perfectly level, both pans glowing, ${PIP} cheers happily beside it. ${STYLE}`,
  `An open glowing spell-book with golden light rising from blank pages, ${PIP} beside it, stars drifting. ${STYLE}`,
];
const MODELS = { seedance: "bytedance/seedance-2.5", kling: "kwaivgi/kling-v3.0-pro" };

async function generate(name, model, i) {
  const out = `apps/web/public/themes/magic/${name}/scene-${i + 1}.mp4`;
  if (existsSync(out)) return console.log("skip (exists)", out);
  const start = await fetch(BASE, { method: "POST", headers: H, body: JSON.stringify({ model, prompt: SCENES[i], seconds: "5", size: "1280x720" }) });
  const job = await start.json();
  const id = job.task_id ?? job.id;
  if (!start.ok || !id) return console.log("FAILED submit", name, i + 1, start.status, JSON.stringify(job).slice(0, 300));
  for (let t = 0; t < 120; t++) { // ponytail: 20 min cap per clip
    await new Promise((r) => setTimeout(r, 10000));
    const s = await (await fetch(`${BASE}/${id}`, { headers: H })).json();
    if (s.status === "completed") {
      const res = await fetch(`${BASE}/${id}/content`, { headers: H });
      mkdirSync(`apps/web/public/themes/magic/${name}`, { recursive: true });
      writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      return console.log("OK", out);
    }
    if (s.status === "failed" || s.status === "error") return console.log("FAILED", name, i + 1, JSON.stringify(s).slice(0, 300));
  }
  console.log("TIMEOUT", name, i + 1, id);
}

await Promise.all(Object.entries(MODELS).flatMap(([n, m]) => SCENES.map((_, i) => generate(n, m, i))));
console.log("done");
