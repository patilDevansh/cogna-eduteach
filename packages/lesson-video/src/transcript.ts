import type { LessonVideoScene } from "./types";

function pad(value: number, size: number): string {
  return String(value).padStart(size, "0");
}

function toTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`;
}

/** WebVTT captions from the approved narration only — never unverified model maths. */
export function buildLessonVtt(scenes: LessonVideoScene[]): string {
  const lines = ["WEBVTT", ""];
  let cursor = 0;
  scenes.forEach((scene, index) => {
    const start = cursor;
    const end = cursor + Math.max(scene.durationSeconds, 1);
    cursor = end;
    const text = [scene.headline, scene.equation, scene.narration].filter(Boolean).join("\n");
    lines.push(String(index + 1));
    lines.push(`${toTimestamp(start)} --> ${toTimestamp(end)}`);
    lines.push(text);
    lines.push("");
  });
  return lines.join("\n");
}
