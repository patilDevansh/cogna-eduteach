#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  renderApprovedLesson,
  renderProductLoop,
  type RenderApprovedLessonInput,
} from "./render";

async function main(): Promise<void> {
  if (process.argv[2] === "--product-loop") {
    const outputPath =
      process.argv[3] ??
      path.resolve(__dirname, "../../../artifacts/cogna-student-teacher-interactivity.mp4");
    const result = await renderProductLoop(outputPath);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
