import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { defaultMediaRoot } from "./media-storage";

/**
 * Narration is fixed per approved-templates.ts template (student name is
 * baked into the text, not a runtime placeholder), so the same narration
 * gets re-synthesized on every render of the same lesson unless cached.
 * This is an internal build artifact — always local disk, independent of
 * whether the final rendered lesson uses LocalDiskMediaStorage or
 * S3MediaStorage — never served to a browser directly.
 */
function cacheKey(narration: string, voice: string, model: string, instructions?: string): string {
  return createHash("sha256").update(`${model} ${voice} ${instructions ?? ""} ${narration}`).digest("hex");
}

function cacheDir(): string {
  return path.join(defaultMediaRoot(), "tts-cache");
}

export function ttsCachePath(narration: string, voice: string, model: string, instructions?: string): string {
  return path.join(cacheDir(), `${cacheKey(narration, voice, model, instructions)}.mp3`);
}

export async function readTtsCache(
  narration: string,
  voice: string,
  model: string,
  instructions?: string,
): Promise<string | null> {
  const cachePath = ttsCachePath(narration, voice, model, instructions);
  try {
    await readFile(cachePath);
    return cachePath;
  } catch {
    return null;
  }
}

export async function writeTtsCache(
  narration: string,
  voice: string,
  model: string,
  bytes: Buffer,
  instructions?: string,
): Promise<string> {
  const cachePath = ttsCachePath(narration, voice, model, instructions);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, bytes);
  return cachePath;
}

/**
 * Returns null if the file can't be parsed as audio — caller keeps the
 * hand-authored duration. `music-metadata` is ESM-only; this package
 * compiles to CommonJS, and a static `import` of a pure-ESM package fails
 * at module load time (crashing the whole process before any route can
 * serve), not just when this function runs. A dynamic import defers
 * loading to call time, which Node's CJS runtime supports for ESM targets.
 */
export async function probeAudioDurationSeconds(bytes: Buffer): Promise<number | null> {
  try {
    const { parseBuffer } = await import("music-metadata");
    const metadata = await parseBuffer(bytes, "audio/mpeg");
    return metadata.format.duration ?? null;
  } catch {
    return null;
  }
}
