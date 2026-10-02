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
import {
  distributionLessonDurationInFrames,
  lessonFps,
  verifyDistributionLesson,
  type DistributionLessonProps,
} from "./distribution/lesson";
import {
  trinomialDurationInFrames,
  verifyTrinomialLesson,
  type TrinomialLessonProps,
} from "./trinomial/trinomial";

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

export type { EquationStep, LessonVideoProps, LessonVideoScene } from "./types";
export { buildLessonVtt } from "./transcript";
export { LESSON_VIDEO_FPS, lessonDurationInFrames } from "./types";
export {
  AARAV_EXAMPLE,
  MEENA_EXAMPLE,
  buildDistributionLesson,
  formatExpression,
  verifyDistributionLesson,
  type DistributionLessonInput,
  type DistributionLessonProps,
} from "./distribution/lesson";
export { matchDistributionMistake, type DistributionErrorMatch, type DistributionMistake } from "./distribution/evidence";
export {
  AARAV_TRINOMIAL_EXAMPLE,
  buildTrinomialLesson,
  classifyTrinomialAnswer,
  formatTrinomial,
  parsePair,
  parseTrinomial,
  verifyTrinomialLesson,
  type TrinomialLessonInput,
  type TrinomialLessonProps,
} from "./trinomial/trinomial";
export { LESSON_THEMES, lessonTheme, type LessonThemeId } from "./themes";
export type { LessonCheckpoint } from "./lesson-types";
export {
  authoredDurationInFrames,
  buildAuthoredLesson,
  prettyMath,
  type AuthoredDraftForPlayback,
  type AuthoredLessonInput,
  type AuthoredLessonProps,
} from "./authored/build";

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

export interface RenderDistributionLessonResult {
  mp4Path: string;
  durationMs: number;
  sha256: string;
  provider: "remotion-local";
}

interface BeatLesson {
  scenes: Array<{ beats: Array<{ text: string; seconds: number; audioPath?: string; audioSrc?: string }> }>;
}

/** Shared by every evidence-built lesson: inline narration, render the composition, sanity-check the MP4. */
async function renderBeatLesson(compositionId: string, lesson: BeatLesson, durationFrames: number, outputPath: string): Promise<RenderDistributionLessonResult> {
  const fps = lessonFps();
  await mkdir(path.dirname(outputPath), { recursive: true });
  const withAudio = {
    ...lesson,
    scenes: await Promise.all(
      lesson.scenes.map(async (scene) => ({
        ...scene,
        beats: await Promise.all(
          scene.beats.map(async (beat) => (beat.audioPath ? { ...beat, audioSrc: await audioPathToDataUri(beat.audioPath) } : beat)),
        ),
      })),
    ),
  };
  const inputProps = { ...withAudio } as unknown as Record<string, unknown>;

  const { ensureBrowser, renderMedia, selectComposition } = await import("@remotion/renderer");
  const browserExecutable = chromeExecutable();
  await ensureBrowser({ browserExecutable });
  const serveUrl = await bundleComposition();
  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps, browserExecutable });

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    browserExecutable,
    // Every tab loads the narration as data URIs; more than 4 tabs has made
    // Chrome stop answering Remotion's page loads. Higher didn't render faster.
    concurrency: 4,
    logLevel: "error",
    timeoutInMilliseconds: 300_000,
  });

  const bytes = await readFile(outputPath);
  if (bytes.length < 32 || !bytes.subarray(4, 8).toString("ascii").includes("ftyp")) {
    throw new Error("Remotion did not produce a playable MP4.");
  }
  return {
    mp4Path: outputPath,
    durationMs: Math.round((durationFrames / fps) * 1000),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    provider: "remotion-local",
  };
}

/**
 * Renders the distribution lesson. The props must come from
 * buildDistributionLesson; this re-verifies anyway so a hand-edited props
 * file can't bypass the gate.
 */
export async function renderDistributionLesson(lesson: DistributionLessonProps, outputPath: string): Promise<RenderDistributionLessonResult> {
  verifyDistributionLesson(lesson);
  return renderBeatLesson("DistributionLesson", lesson, distributionLessonDurationInFrames(lesson, lessonFps()), outputPath);
}

/** Renders the trinomial-signs lesson; re-verified for the same reason. */
export async function renderTrinomialLesson(lesson: TrinomialLessonProps, outputPath: string): Promise<RenderDistributionLessonResult> {
  verifyTrinomialLesson(lesson);
  return renderBeatLesson("TrinomialLesson", lesson, trinomialDurationInFrames(lesson, lessonFps()), outputPath);
}
