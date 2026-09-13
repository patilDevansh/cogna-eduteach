import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildLessonVtt, renderApprovedLesson } from "@cogna/lesson-video";

describe("Local Remotion lesson renderer", () => {
  it("writes WebVTT captions from the approved narration only", () => {
    const vtt = buildLessonVtt([
      {
        headline: "Write two signed products",
        equation: "−2(y − 5) = (−2)(y) + (−2)(−5)",
        narration: "Before calculating, write every signed multiplication.",
        durationSeconds: 2,
      },
    ]);
    assert.match(vtt, /^WEBVTT/m);
    assert.match(vtt, /Write two signed products/);
    assert.match(vtt, /Before calculating, write every signed multiplication/);
  });

  it(
    "produces a playable MP4 and VTT from a validated lesson script",
    { timeout: 120_000 },
    async () => {
      const outputDir = await mkdtemp(path.join(os.tmpdir(), "cogna-lesson-video-"));
      const rendered = await renderApprovedLesson({
        assignmentId: "golden-aarav",
        title: "Keep both signs visible",
        outputDir,
        scenes: [
          {
            eyebrow: "Your evidence",
            headline: "You already know the sign rule",
            equation: "(−2)(−5) = +10",
            narration: "Negative two times negative five is positive ten.",
            durationSeconds: 1,
            accent: "green",
          },
        ],
      });
      const mp4 = await readFile(rendered.mp4Path);
      const vtt = await readFile(rendered.vttPath, "utf8");
      assert.ok(mp4.length > 32, "MP4 should contain encoded media");
      assert.equal(mp4.subarray(4, 8).toString("ascii"), "ftyp");
      assert.match(vtt, /^WEBVTT/m);
      assert.match(vtt, /You already know the sign rule/);
      assert.equal(rendered.provider, "remotion-local");
    },
  );
});
