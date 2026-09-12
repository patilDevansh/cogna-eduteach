import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultMediaRoot, type MediaStorage } from "./media-storage";
import type { RendererPollResult, VideoRenderSuccess, VideoSceneManifest } from "./video-renderer.adapter";

type DiskJob =
  | { status: "RUNNING" }
  | { status: "FAILED"; retryable: boolean; message: string }
  | { status: "COMPLETED"; result: VideoRenderSuccess };

function repoRoot(): string {
  const configured = process.env.COGNA_REPO_ROOT?.trim();
  if (configured) return configured;
  const cwd = process.cwd();
  if (cwd.endsWith(`${path.sep}apps${path.sep}web`) || cwd.endsWith(`${path.sep}apps${path.sep}api`)) {
    return path.resolve(cwd, "../..");
  }
  return cwd;
}

function lessonVideoCli(): string {
  const configured = process.env.COGNA_LESSON_VIDEO_CLI?.trim();
  if (configured) return configured;
  return path.join(repoRoot(), "packages/lesson-video/dist/cli.js");
}

/**
 * Spawns the Remotion CLI in a child process so Next.js never bundles Chromium
 * or esbuild. Status is written to disk so Nest and the Next BFF can poll it.
 */
export class LocalRenderQueue {
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly storage: MediaStorage) {}

  submit(manifest: VideoSceneManifest): { providerJobId: string } {
    const providerJobId = randomUUID();
    this.writeJob(providerJobId, { status: "RUNNING" });
    this.chain = this.chain.then(() => this.render(providerJobId, manifest)).catch(() => undefined);
    return { providerJobId };
  }

  poll(providerJobId: string): RendererPollResult {
    const job = this.readJob(providerJobId);
    if (!job) {
      return { status: "FAILED", retryable: true, message: "Unknown local render job." };
    }
    return job;
  }

  private jobsDir(): string {
    return path.join(defaultMediaRoot(), "render-jobs");
  }

  private jobPath(providerJobId: string): string {
    return path.join(this.jobsDir(), `${providerJobId}.json`);
  }

  private writeJob(providerJobId: string, job: DiskJob): void {
    mkdirSync(this.jobsDir(), { recursive: true });
    writeFileSync(this.jobPath(providerJobId), JSON.stringify(job), "utf8");
  }

  private readJob(providerJobId: string): DiskJob | null {
    const file = this.jobPath(providerJobId);
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, "utf8")) as DiskJob;
    } catch {
      return null;
    }
  }

  private async render(providerJobId: string, manifest: VideoSceneManifest): Promise<void> {
    const workDir = path.join(os.tmpdir(), "cogna-lesson-video", providerJobId);
    try {
      await mkdir(workDir, { recursive: true });
      const scenes = manifest.scenes.map((scene) => ({
        eyebrow: scene.eyebrow,
        headline: scene.headline,
        equation: scene.equation,
        narration: scene.narration,
        durationSeconds: scene.durationSeconds,
        accent: scene.accent,
      }));
      const inputPath = path.join(workDir, "input.json");
      await writeFile(
        inputPath,
        JSON.stringify({
          assignmentId: manifest.assignmentId,
          title: manifest.title,
          scenes,
          outputDir: workDir,
        }),
      );
      const rendered = await runLessonVideoCli(inputPath);
      const mp4 = await readFile(rendered.mp4Path);
      const vtt = await readFile(rendered.vttPath);
      const prefix = `lessons/${manifest.assignmentId}`;
      const video = await this.storage.put({
        key: `${prefix}/lesson.mp4`,
        body: mp4,
        contentType: "video/mp4",
      });
      const transcript = await this.storage.put({
        key: `${prefix}/lesson.vtt`,
        body: vtt,
        contentType: "text/vtt",
      });
      this.writeJob(providerJobId, {
        status: "COMPLETED",
        result: {
          storageRef: video.publicUrl,
          transcriptRef: transcript.publicUrl,
          durationMs: rendered.durationMs,
          integrity: {
            sha256: rendered.sha256,
            provider: rendered.provider,
            providerJobId,
            sceneCount: scenes.length,
          },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.writeJob(providerJobId, { status: "FAILED", retryable: true, message });
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function runLessonVideoCli(inputPath: string): Promise<{
  mp4Path: string;
  vttPath: string;
  durationMs: number;
  sha256: string;
  provider: "remotion-local";
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [lessonVideoCli(), inputPath], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Lesson video renderer exited with code ${code}.`));
        return;
      }
      const line = stdout.trim().split("\n").at(-1);
      if (!line) {
        reject(new Error("Lesson video renderer returned no result."));
        return;
      }
      try {
        resolve(JSON.parse(line));
      } catch {
        reject(new Error(`Lesson video renderer returned invalid JSON: ${line}`));
      }
    });
  });
}
