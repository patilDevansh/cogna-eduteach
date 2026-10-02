/** Scene/beat shapes shared by every evidence-built lesson (kept out of the .tsx kit so plain TS can import them). */
export interface KitBeat {
  text: string;
  seconds: number;
  /** Local mp3 path; converted to audioSrc (data URI) right before render. */
  audioPath?: string;
  audioSrc?: string;
}

export interface KitScene {
  id: string;
  title: string;
  beats: KitBeat[];
}

/**
 * A question the interactive player pauses on. The lesson doesn't continue
 * until the child picks the correct option; every option has its own spoken
 * feedback (so a repeat of their diagnostic mistake gets a specific reply).
 */
export interface LessonCheckpoint {
  id: string;
  /** Pause at the end of this beat (scene index, beat index within the scene). */
  afterScene: number;
  afterBeat: number;
  prompt: string;
  spoken: string;
  options: Array<{ label: string; correct: boolean; feedback: string }>;
}

export function assertCheckpoints(checkpoints: LessonCheckpoint[], scenes: KitScene[]): void {
  for (const cp of checkpoints) {
    if (cp.options.filter((o) => o.correct).length !== 1) throw new Error(`Checkpoint ${cp.id} needs exactly one correct option.`);
    if (new Set(cp.options.map((o) => o.label)).size !== cp.options.length) throw new Error(`Checkpoint ${cp.id} has duplicate options.`);
    if (!scenes[cp.afterScene]?.beats[cp.afterBeat]) throw new Error(`Checkpoint ${cp.id} points at a beat that doesn't exist.`);
  }
}

/** "Aarav, your report says X is secure, so you already have the basics. Let's replay…: factorise …" */
export function openingLine(name: string, strength: string | undefined, intro: string, task: string): string {
  const cap = (text: string) => text.replace(/^./, (c) => c.toUpperCase());
  if (strength) {
    return `${name ? `${name}, your` : "Your"} report says ${strength.toLowerCase()} is secure, so you already have the basics. ${cap(intro)}${task ? `: ${task}` : ""}.`;
  }
  return `${name ? `${name}, ${intro}` : cap(intro)}${task ? `: ${task}` : ""}.`;
}
