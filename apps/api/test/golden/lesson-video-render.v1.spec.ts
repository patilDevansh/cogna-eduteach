import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildLessonVtt, renderApprovedLesson } from "@cogna/lesson-video";

/** A tiny 1-second sine-wave WAV at the given frequency, generated in-process so the test needs no checked-in binary fixture. */
async function writeToneFixture(dir: string, freqHz: number): Promise<string> {
  const sampleRate = 24000;
  const numSamples = sampleRate;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freqHz * t) * 8000), 44 + i * 2);
  }
  const fixturePath = path.join(dir, `tone-${freqHz}.wav`);
  await writeFile(fixturePath, buf);
  return fixturePath;
}

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

  it(
    "muxes scene.audioPath content into the rendered MP4",
    { timeout: 120_000 },
    async () => {
      // Same scene content (headline/equation/narration/duration) rendered
      // twice, differing only in which audio clip is attached — isolates
      // whether audioPath content actually reaches the encoder, rather than
      // just whether an audio track container exists (Remotion appears to
      // always create one, even with no <Audio> element rendered, which
      // makes a silent-vs-narrated comparison an unreliable signal here).
      const fixtureDir = await mkdtemp(path.join(os.tmpdir(), "cogna-lesson-video-audio-fixture-"));
      const toneA = await writeToneFixture(fixtureDir, 440);
      const toneB = await writeToneFixture(fixtureDir, 2000);

      const sceneBase = {
        eyebrow: "Control",
        headline: "Same visual content",
        equation: "1 + 1 = 2",
        narration: "Same narration text either way.",
        durationSeconds: 1,
        accent: "green" as const,
      };

      const dirA = await mkdtemp(path.join(os.tmpdir(), "cogna-lesson-video-audio-a-"));
      const renderedA = await renderApprovedLesson({
        assignmentId: "golden-audio-a",
        title: "Tone A",
        outputDir: dirA,
        scenes: [{ ...sceneBase, audioPath: toneA }],
      });

      const dirB = await mkdtemp(path.join(os.tmpdir(), "cogna-lesson-video-audio-b-"));
      const renderedB = await renderApprovedLesson({
        assignmentId: "golden-audio-b",
        title: "Tone B",
        outputDir: dirB,
        scenes: [{ ...sceneBase, audioPath: toneB }],
      });

      const bytesA = await readFile(renderedA.mp4Path);
      const bytesB = await readFile(renderedB.mp4Path);
      assert.equal(bytesA.subarray(4, 8).toString("ascii"), "ftyp");
      assert.equal(bytesB.subarray(4, 8).toString("ascii"), "ftyp");
      assert.ok(
        !bytesA.equals(bytesB),
        "identical scenes with two different audio clips should not encode to byte-identical output",
      );
    },
  );
});
