#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { writeFileSync } from "node:fs";
import {
  renderApprovedLesson,
  renderDistributionLesson,
  renderProductLoop,
  renderTrinomialLesson,
  type RenderApprovedLessonInput,
} from "./render";
import type { DistributionLessonProps } from "./distribution/lesson";
import type { TrinomialLessonProps } from "./trinomial/trinomial";

function vttTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${s}.${String(ms % 1000).padStart(3, "0")}`;
}

/** One caption cue per narrated beat, on the same frame grid the composition uses. */
function distributionVtt(lesson: { scenes: DistributionLessonProps["scenes"] | TrinomialLessonProps["scenes"] }, fps: number): string {
  let t = 0;
  const cues: string[] = [];
  for (const scene of lesson.scenes) {
    for (const beat of scene.beats) {
      const len = Math.round(beat.seconds * fps) / fps;
      cues.push(`${vttTime(t)} --> ${vttTime(t + len)}\n${beat.text}`);
      t += len;
    }
  }
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

async function main(): Promise<void> {
  if (process.argv[2] === "--product-loop") {
    const outputPath =
      process.argv[3] ??
      path.resolve(__dirname, "../../../artifacts/cogna-student-teacher-interactivity.mp4");
    const result = await renderProductLoop(outputPath);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (process.argv[2] === "--distribution" || process.argv[2] === "--trinomial") {
    const inputPath = process.argv[3];
    if (!inputPath) throw new Error(`Usage: node dist/cli.js ${process.argv[2]} <input.json>`);
    const input = JSON.parse(readFileSync(inputPath, "utf8")) as { lesson: DistributionLessonProps & TrinomialLessonProps; outputDir: string };
    const mp4Path = path.join(input.outputDir, "lesson.mp4");
    const vttPath = path.join(input.outputDir, "lesson.vtt");
    const result =
      process.argv[2] === "--trinomial"
        ? await renderTrinomialLesson(input.lesson, mp4Path)
        : await renderDistributionLesson(input.lesson, mp4Path);
    writeFileSync(vttPath, distributionVtt(input.lesson, 30), "utf8");
    process.stdout.write(`${JSON.stringify({ ...result, vttPath })}\n`);
    return;
  }

  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Usage: node dist/cli.js <render-input.json> | --product-loop [output.mp4]");
  }
  const input = JSON.parse(readFileSync(inputPath, "utf8")) as RenderApprovedLessonInput;
  const result = await renderApprovedLesson(input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
