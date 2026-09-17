import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildLessonVtt } from "./transcript";
import {
  LESSON_VIDEO_FPS,
  PRODUCT_LOOP_FPS,
  lessonDurationInFrames,
  productLoopDurationInFrames,
  type LessonVideoProps,
  type LessonVideoScene,
} from "./types";

function packageRoot(): string {
  return path.resolve(__dirname, "..");
}

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
};

/**
 * @remotion/renderer's asset pipeline only fetches http(s) URLs — a file://
 * src throws ("Can only download URLs starting with http:// or https://")
 * during renderMedia's asset pass, confirmed empirically. A base64 data URI
 * sidesteps that entirely since Chromium decodes it inline, with no fetch.
 */
async function audioPathToDataUri(audioPath: string): Promise<string> {
  const ext = path.extname(audioPath).toLowerCase();
  const mime = AUDIO_MIME_BY_EXT[ext] ?? "audio/mpeg";
  const bytes = await readFile(audioPath);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

export type { LessonVideoProps, LessonVideoScene } from "./types";
export { buildLessonVtt } from "./transcript";
export { LESSON_VIDEO_FPS, lessonDurationInFrames } from "./types";

export interface RenderApprovedLessonInput {
  assignmentId: string;
  title: string;
  scenes: LessonVideoScene[];
  outputDir: string;
  fps?: number;
}

export interface RenderApprovedLessonResult {
  mp4Path: string;
  vttPath: string;
  durationMs: number;
  sha256: string;
  provider: "remotion-local";
}

let cachedBundle: string | null = null;

function chromeExecutable(): string | undefined {
  const configured = process.env.COGNA_CHROME_PATH?.trim();
  if (configured) return configured;
  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  return undefined;
}

async function bundleComposition(): Promise<string> {
  if (cachedBundle) return cachedBundle;
  const { bundle } = await import("@remotion/bundler");
  cachedBundle = await bundle({
    entryPoint: path.join(packageRoot(), "src/index.ts"),
    onProgress: () => undefined,
  });
  return cachedBundle;
}

/**
 * Server-side Remotion render of an already-validated lesson script.
 * Callers must not pass unchecked LLM mathematics.
 */
export async function renderApprovedLesson(
  input: RenderApprovedLessonInput,
): Promise<RenderApprovedLessonResult> {
  if (!input.scenes.length) {
    throw new Error("A validated lesson script with scenes is required to render.");
  }

  const fps = input.fps ?? LESSON_VIDEO_FPS;
  const outputDir = input.outputDir;
  await mkdir(outputDir, { recursive: true });
  const mp4Path = path.join(outputDir, "lesson.mp4");
  const vttPath = path.join(outputDir, "lesson.vtt");
  // audioPath is a plain filesystem path set by the caller. @remotion/renderer's
  // asset pipeline only fetches http(s) URLs (file:// throws during render), so
  // inline the audio as a base64 data URI instead of asking every caller to
  // stand up a local file server.
  const scenesWithAudioSrc = await Promise.all(
    input.scenes.map(async (scene) =>
      scene.audioPath ? { ...scene, audioSrc: await audioPathToDataUri(scene.audioPath) } : scene,
    ),
  );
  const props: LessonVideoProps = { title: input.title, scenes: scenesWithAudioSrc };
  const inputProps = { ...props } as Record<string, unknown>;

  await writeFile(vttPath, buildLessonVtt(input.scenes), "utf8");

  const { ensureBrowser, renderMedia, selectComposition } = await import("@remotion/renderer");
  // Prefer the configured/system Chrome. This keeps local rendering self-contained
  // instead of attempting a separate browser download for every fresh workspace.
  const browserExecutable = chromeExecutable();
  await ensureBrowser({ browserExecutable });
  const serveUrl = await bundleComposition();
  const composition = await selectComposition({
    serveUrl,
    id: "LessonVideo",
    inputProps,
    browserExecutable,
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: mp4Path,
    inputProps,
    chromiumOptions: {},
    browserExecutable,
    concurrency: 1,
    logLevel: "error",
    timeoutInMilliseconds: 120_000,
  });

  const bytes = await readFile(mp4Path);
  if (bytes.length < 32 || !bytes.subarray(4, 8).toString("ascii").includes("ftyp")) {
    throw new Error("Remotion did not produce a playable MP4.");
  }

  return {
    mp4Path,
    vttPath,
    durationMs: Math.round((lessonDurationInFrames(input.scenes, fps) / fps) * 1000),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    provider: "remotion-local",
  };
}

export interface RenderProductLoopResult {
  mp4Path: string;
  durationMs: number;
  sha256: string;
  provider: "remotion-local";
}

export async function renderProductLoop(outputPath: string): Promise<RenderProductLoopResult> {
  const fps = PRODUCT_LOOP_FPS;
  await mkdir(path.dirname(outputPath), { recursive: true });

  const { ensureBrowser, renderMedia, selectComposition } = await import("@remotion/renderer");
  const browserExecutable = chromeExecutable();
  await ensureBrowser({ browserExecutable });
  const serveUrl = await bundleComposition();
  const composition = await selectComposition({
    serveUrl,
    id: "ProductLoop",
    browserExecutable,
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    chromiumOptions: {},
    browserExecutable,
    concurrency: 2,
    imageFormat: "jpeg",
    jpegQuality: 80,
    logLevel: "info",
    timeoutInMilliseconds: 900_000,
  });

  const bytes = await readFile(outputPath);
  if (bytes.length < 32 || !bytes.subarray(4, 8).toString("ascii").includes("ftyp")) {
    throw new Error("Remotion did not produce a playable MP4.");
  }

  return {
    mp4Path: outputPath,
    durationMs: Math.round((productLoopDurationInFrames(fps) / fps) * 1000),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    provider: "remotion-local",
  };
}
