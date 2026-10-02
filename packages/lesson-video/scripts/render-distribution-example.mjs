#!/usr/bin/env node
/**
 * Renders the Meena "one arrow for every term" example lesson:
 *   1. build + verify the lesson from her pilot evidence (dist/distribution/lesson.js)
 *   2. narrate each beat with Cartesia (cached by text hash)
 *   3. time every beat to its real narration length
 *   4. render DistributionLesson to an MP4
 *
 * Usage: pnpm --filter @cogna/lesson-video build && node scripts/render-distribution-example.mjs [out.mp4]
 * A beat whose narration fails renders silent at estimated pacing — reported at the end.
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(ROOT, "../..");
const OUT = process.argv[2] ?? path.join(REPO, "artifacts/meena-distribution-example.mp4");
const VOICE_DIR = path.join(REPO, "artifacts/meena-example-voice");

const { buildDistributionLesson, MEENA_EXAMPLE } = require(path.join(ROOT, "dist/distribution/lesson.js"));
const { renderDistributionLesson } = require(path.join(ROOT, "dist/render.js"));

async function loadEnv() {
  const env = { ...process.env };
  try {
    for (const raw of (await readFile(path.join(REPO, ".env"), "utf8")).split("\n")) {
      const line = raw.trim();
      const i = line.indexOf("=");
      if (!line || line.startsWith("#") || i === -1) continue;
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
      if (!(key in env)) env[key] = value;
    }
  } catch {
    // No .env: rely on process env.
  }
  return env;
}

async function cartesia(env, text, outPath) {
  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cartesia-Version": "2026-08-14",
      Authorization: `Bearer ${env.CARTESIA_API_KEY}`,
    },
    body: JSON.stringify({
      model_id: env.CARTESIA_MODEL || "sonic-3.6",
      transcript: text,
      voice: { id: env.CARTESIA_VOICE_ID?.trim() || "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4" },
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Cartesia ${response.status}: ${(await response.text()).slice(0, 300)}`);
  await writeFile(outPath, Buffer.from(await response.arrayBuffer()));
}

/** afinfo (macOS) first; fall back to size ÷ bitrate, exact for Cartesia's 128 kbps CBR mp3. */
function audioSeconds(file) {
  return new Promise((resolve) => {
    const fallback = async () => resolve(((await readFile(file)).length * 8) / 128_000);
    const child = spawn("afinfo", [file]);
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.on("error", fallback);
    child.on("close", () => {
      const m = out.match(/estimated duration: ([\d.]+) sec/);
      m ? resolve(Number(m[1])) : fallback();
    });
  });
}

async function main() {
  const env = await loadEnv();
  const lesson = buildDistributionLesson(MEENA_EXAMPLE);
  await mkdir(VOICE_DIR, { recursive: true });

  const silent = [];
  for (const [s, scene] of lesson.scenes.entries()) {
    for (const [b, beat] of scene.beats.entries()) {
      const hash = createHash("sha1").update(`${env.CARTESIA_VOICE_ID ?? ""}|${beat.text}`).digest("hex").slice(0, 10);
      const file = path.join(VOICE_DIR, `s${s}-b${b}-${hash}.mp3`);
      try {
        if (!env.CARTESIA_API_KEY) throw new Error("CARTESIA_API_KEY not set");
        if (!existsSync(file)) await cartesia(env, beat.text, file);
        beat.audioPath = file;
        // Narration + a beat of breathing room so the visual can land.
        beat.seconds = Math.max(2.4, (await audioSeconds(file)) + 0.7);
      } catch (error) {
        silent.push(`${scene.id}#${b}: ${error.message}`);
      }
    }
  }

  await writeFile(
    OUT.replace(/\.mp4$/, ".lesson.json"),
    JSON.stringify(lesson, (k, v) => (k === "audioSrc" ? undefined : v), 2),
  );
  const result = await renderDistributionLesson(lesson, OUT);
  console.log(JSON.stringify({ ...result, silentBeats: silent }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
