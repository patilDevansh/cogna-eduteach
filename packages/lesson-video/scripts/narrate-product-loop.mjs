#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(ROOT, "../..");
const FFMPEG_DIR = path.join(
  REPO,
  "node_modules/.pnpm/@remotion+compositor-darwin-arm64@4.0.241/node_modules/@remotion/compositor-darwin-arm64",
);
const FFMPEG = path.join(FFMPEG_DIR, "ffmpeg");
const WORK = path.join(REPO, "artifacts/voice-work");
const PUBLIC_DIR = path.join(ROOT, "public");
const VIDEO = path.join(REPO, "artifacts/cogna-student-teacher-interactivity.mp4");
const VOICE_MP3 = path.join(PUBLIC_DIR, "product-loop-voice.mp3");
const VOICED_VIDEO = path.join(REPO, "artifacts/cogna-student-teacher-interactivity.mp4");

const SCENES = [
  { id: "title", seconds: 5, voice: "Cogna. Student and teacher, one honest loop." },
  {
    id: "twoSides",
    seconds: 6,
    voice: "Aarav works a problem. Ananya sees the next teaching move, not a long report.",
  },
  {
    id: "join",
    seconds: 6,
    voice: "The student joins with a class code. The session is calm, signed, and attributed.",
  },
  {
    id: "diagnostic",
    seconds: 8,
    voice:
      "Lotus records the answer, the working, the confidence, and the time. Every action is evidence.",
  },
  {
    id: "evidence",
    seconds: 7,
    voice:
      "Cogna names one supported need. Aarav already knows the sign rule. The work is to keep both products visible.",
  },
  {
    id: "lesson",
    seconds: 8,
    voice: "A short, verified lesson. Unchecked mathematics never reaches the student.",
  },
  {
    id: "exit",
    seconds: 6,
    voice: "Then a fresh item, without hints. Watching is not the same as knowing.",
  },
  {
    id: "teacher",
    seconds: 9,
    voice:
      "Ananya’s first screen: who is ready, who needs a bridge, and who should not be labelled yet.",
  },
  {
    id: "roster",
    seconds: 9,
    voice: "Five students. Five distinct next actions. The exact work sits behind each card.",
  },
  {
    id: "close",
    seconds: 6,
    voice: "The child practices. The teacher decides. Cogna does not invent a label.",
  },
];

const TTS_INSTRUCTIONS =
  "Speak in a calm, clear, unhurried voice, like a thoughtful teacher speaking to a colleague. Warm, not salesy. Slight pause at commas and full stops. Do not sound like an advertisement.";

function parseEnv(text) {
  const env = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? FFMPEG_DIR,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(" ")} failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function audioDuration(filePath) {
  try {
    const { stderr } = await run(FFMPEG, ["-i", filePath, "-f", "null", "-"]);
    const match = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    if (match) {
      return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    const match = text.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    if (match) {
      return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    }
    throw error;
  }
  throw new Error(`Could not read duration for ${filePath}`);
}

async function loadApiKey() {
  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const file = await readFile(path.join(REPO, ".env"), "utf8");
  return parseEnv(file).OPENAI_API_KEY?.trim() ?? "";
}

async function speakOpenAi(apiKey, text, outputPath) {
  const attempts = [
    {
      model: "gpt-4o-mini-tts",
      voice: "coral",
      body: {
        model: "gpt-4o-mini-tts",
        voice: "coral",
        input: text,
        instructions: TTS_INSTRUCTIONS,
      },
    },
    {
      model: "tts-1-hd",
      voice: "nova",
      body: { model: "tts-1-hd", voice: "nova", input: text, speed: 0.95 },
    },
  ];

  let lastError = "";
  for (const attempt of attempts) {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(attempt.body),
    });
    if (response.ok) {
      await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
      return attempt.model;
    }
    lastError = await response.text();
  }
  throw new Error(`OpenAI speech failed: ${lastError.slice(0, 400)}`);
}

async function speakMac(text, outputPath) {
  const aiff = `${outputPath}.aiff`;
  await run("say", ["-v", "Samantha", "-r", "165", "-o", aiff, text], { cwd: WORK });
  await run(FFMPEG, ["-y", "-i", aiff, "-ac", "1", "-ar", "24000", outputPath]);
  await rm(aiff, { force: true });
  return "macos-samantha";
}

async function fitToScene(inputPath, outputPath, seconds) {
  const spoken = await audioDuration(inputPath);
  const lead = 0.28;
  const usable = Math.max(0.8, seconds - lead - 0.2);
  const filters = [`adelay=${Math.round(lead * 1000)}:all=1`];
  if (spoken > usable) {
    filters.push(`atempo=${(spoken / usable).toFixed(3)}`);
  }
  filters.push(`apad=whole_dur=${seconds.toFixed(3)}`);
  await run(FFMPEG, [
    "-y",
    "-i",
    inputPath,
    "-af",
    filters.join(","),
    "-t",
    seconds.toFixed(3),
    "-ac",
    "1",
    "-ar",
    "24000",
    outputPath,
  ]);
}

async function main() {
  await mkdir(WORK, { recursive: true });
  await mkdir(PUBLIC_DIR, { recursive: true });
  const apiKey = await loadApiKey();
  const models = [];

  for (const scene of SCENES) {
    const raw = path.join(WORK, `${scene.id}.raw.mp3`);
    const fitted = path.join(WORK, `${scene.id}.fit.mp3`);
    const model = apiKey
      ? await speakOpenAi(apiKey, scene.voice, raw)
      : await speakMac(scene.voice, raw);
    models.push(model);
    await fitToScene(raw, fitted, scene.seconds);
  }

  const listPath = path.join(WORK, "concat.txt");
  await writeFile(
    listPath,
    SCENES.map((scene) => `file '${path.join(WORK, `${scene.id}.fit.mp3`)}'`).join("\n"),
  );
  await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:a", "libmp3lame", "-q:a", "4", VOICE_MP3]);

  const staged = `${VOICED_VIDEO}.voiced.mp4`;
  await run(FFMPEG, [
    "-y",
    "-i",
    VIDEO,
    "-i",
    VOICE_MP3,
    "-c:v",
    "copy",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-shortest",
    "-movflags",
    "+faststart",
    staged,
  ]);
  await run("mv", [staged, VOICED_VIDEO], { cwd: REPO });
  await rm(WORK, { recursive: true, force: true });

  process.stdout.write(
    `${JSON.stringify(
      {
        video: VOICED_VIDEO,
        voice: VOICE_MP3,
        tts: models[0] ?? "unknown",
        scenes: SCENES.length,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
