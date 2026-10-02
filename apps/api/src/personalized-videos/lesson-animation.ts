import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type {
  LessonThemeChoice,
  PersonalizedLessonAnimationView,
  PersonalizedVideoExitItem,
  PersonalizedVideoLesson,
} from "@cogna/shared";
import {
  AARAV_TRINOMIAL_EXAMPLE,
  MEENA_EXAMPLE,
  buildDistributionLesson,
  buildAuthoredLesson,
  buildTrinomialLesson,
  formatExpression,
  formatTrinomial,
  type AuthoredLessonInput,
  type AuthoredLessonProps,
  type DistributionLessonInput,
  type DistributionLessonProps,
  type TrinomialLessonInput,
  type TrinomialLessonProps,
} from "@cogna/lesson-video";
import type { TtsProvider } from "../ai/tts.service";
import { attachMediaAccess, type MediaAccessClaims } from "../access/cogna-access";
import type { MediaStorage } from "./media-storage";
import { probeAudioDurationSeconds, readTtsCache, writeTtsCache } from "./tts-cache";

/**
 * Interactive, themed lessons played live in the browser (no MP4 render).
 *
 * The lesson is rebuilt for the chosen theme from the planner's saved input —
 * themes only change framing sentences and visuals, so the mathematics is
 * identical and still passes the builder's verification — then every spoken
 * line is narrated with that theme's voice from the configured TTS provider.
 */

export type AnimationKind = "distribution" | "trinomial" | "authored";

export type AnimationInput =
  | { kind: "distribution"; input: DistributionLessonInput }
  | { kind: "trinomial"; input: TrinomialLessonInput }
  /** Written by the AI author; stored only after lesson-verifier.ts passed it. */
  | { kind: "authored"; input: AuthoredLessonInput; authoredBy?: { model: string; attempts: number; claimsChecked: number } };

type ThemeVoices = Record<LessonThemeChoice, { id: string; name: string }>;

/**
 * One voice per world, per provider (voice IDs only mean something to their
 * own service). Cartesia: Indian-English voices for Indian Grade 8 students.
 * ElevenLabs: premade voices, which every plan can use through the API.
 */
export const THEME_VOICES_BY_PROVIDER: Record<"cartesia" | "elevenlabs" | "sarvam", ThemeVoices> = {
  cartesia: {
    classic: { id: "e6b71342-48f1-4c70-a13a-d197b176ff24", name: "Sana" },
    cricket: { id: "cb9c954d-bcaa-43ed-82bf-aeb5e88a3cb5", name: "Kabir" },
    space: { id: "4459a9a5-69d6-4680-b970-e13dc51845b6", name: "Siya" },
  },
  elevenlabs: {
    classic: { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice" },
    cricket: { id: "JBFqnCBsd6RMkjVDRZzb", name: "George" },
    space: { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily" },
  },
  // Sarvam Bulbul v3: speaker names are the IDs.
  sarvam: {
    classic: { id: "priya", name: "Priya" },
    cricket: { id: "kabir", name: "Kabir" },
    space: { id: "ishita", name: "Ishita" },
  },
};

/** Voices for the configured provider; a provider without a per-theme map uses its own default voice for every world. */
export function themeVoices(tts: TtsProvider | undefined): ThemeVoices {
  if (tts?.provider === "cartesia" || tts?.provider === "elevenlabs" || tts?.provider === "sarvam") return THEME_VOICES_BY_PROVIDER[tts.provider];
  const voice = { id: tts?.voice ?? "default", name: "Narrator" };
  return { classic: voice, cricket: voice, space: voice };
}

export const LESSON_THEME_CHOICES = Object.keys(THEME_VOICES_BY_PROVIDER.cartesia) as LessonThemeChoice[];

export function isLessonTheme(value: unknown): value is LessonThemeChoice {
  return typeof value === "string" && (LESSON_THEME_CHOICES as string[]).includes(value);
}

/** Pause after each narrated beat so the motion can land before the next line. */
const BEAT_TAIL_SECONDS = 0.7;
/** TTS calls at once. Firing every clip together gets most of them rate-limited. */
const NARRATION_CONCURRENCY = 3;
/** ElevenLabs' free plan allows 2 concurrent requests in total; one at a time leaves room for a second lesson opening. */
const ELEVENLABS_CONCURRENCY = 1;

export function buildForTheme(source: AnimationInput, theme: LessonThemeChoice): DistributionLessonProps | TrinomialLessonProps | AuthoredLessonProps {
  if (source.kind === "authored") return buildAuthoredLesson({ ...source.input, theme });
  return source.kind === "trinomial"
    ? buildTrinomialLesson({ ...source.input, theme })
    : buildDistributionLesson({ ...source.input, theme });
}

interface Clip {
  url: string;
  seconds: number | null;
}

async function pool<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await run(items[index]!);
      }
    }),
  );
  return out;
}

export class LessonNarrator {
  /** Storage key → public URL for clips this process already uploaded, so repeat opens don't re-upload. */
  private readonly uploaded = new Map<string, string>();

  constructor(
    private readonly tts: TtsProvider | undefined,
    private readonly storage: () => MediaStorage,
  ) {}

  /** A narrated clip for one line in one voice, or null if TTS is off or failed. Never throws. */
  private async clip(assignmentId: string, text: string, voiceId: string, claims: MediaAccessClaims): Promise<Clip | null> {
    if (!this.tts?.enabled || !text.trim()) return null;
    try {
      const model = this.tts.model;
      let audioPath = await readTtsCache(text, voiceId, model);
      let bytes: Buffer | null = audioPath ? await readFile(audioPath) : null;
      let seconds = bytes ? await probeAudioDurationSeconds(bytes) : null;
      // Same truncated-stream guard as scene narration: never cache or serve a clip far too short for its text.
      const minPlausible = Math.max(0.5, text.length / 25);
      if (seconds !== null && seconds < minPlausible) {
        audioPath = null;
        bytes = null;
      }
      if (!audioPath || !bytes) {
        const spoken = await this.tts.synthesize(text, { voiceId });
        if (!spoken) return null;
        bytes = spoken.bytes;
        seconds = await probeAudioDurationSeconds(bytes);
        if (seconds !== null && seconds < minPlausible) return null;
        audioPath = await writeTtsCache(text, voiceId, model, bytes);
      }
      // Flat "lessons/<id>/voice-<hash>.mp3": the web media route only serves allow-listed files one level under the lesson.
      const key = `lessons/${assignmentId}/voice-${createHash("sha1").update(`${voiceId}|${text}`).digest("hex").slice(0, 20)}.mp3`;
      let publicUrl = this.uploaded.get(key);
      if (!publicUrl) {
        publicUrl = (await this.storage().put({ key, body: bytes, contentType: "audio/mpeg" })).publicUrl;
        this.uploaded.set(key, publicUrl);
      }
      return { url: attachMediaAccess(publicUrl, claims) ?? publicUrl, seconds };
    } catch {
      return null;
    }
  }

  async narrate(input: {
    assignmentId: string;
    source: AnimationInput;
    theme: LessonThemeChoice;
    claims: MediaAccessClaims;
  }): Promise<PersonalizedLessonAnimationView> {
    const voice = themeVoices(this.tts)[input.theme];
    const props = buildForTheme(input.source, input.theme);

    const beats = props.scenes.flatMap((scene) => scene.beats);
    const checkpointLines = props.checkpoints.flatMap((cp) => [cp.spoken, ...cp.options.map((o) => o.feedback)]);
    const lines = [...beats.map((b) => b.text), ...checkpointLines];
    const concurrency = this.tts?.provider === "elevenlabs" ? ELEVENLABS_CONCURRENCY : NARRATION_CONCURRENCY;
    const clips = await pool(lines, concurrency, (text) => this.clip(input.assignmentId, text, voice.id, input.claims));
    // A burst can get a few requests refused (provider concurrency limits):
    // retry just those, one at a time, before accepting any silent line.
    for (let i = 0; i < clips.length; i++) {
      if (!clips[i]) clips[i] = await this.clip(input.assignmentId, lines[i]!, voice.id, input.claims);
    }

    let silentBeats = 0;
    beats.forEach((beat, i) => {
      const clip = clips[i];
      if (clip) {
        beat.audioSrc = clip.url;
        if (clip.seconds) beat.seconds = clip.seconds + BEAT_TAIL_SECONDS;
      } else {
        silentBeats += 1;
      }
    });

    let cursor = beats.length;
    const checkpointAudio: PersonalizedLessonAnimationView["checkpointAudio"] = {};
    for (const cp of props.checkpoints) {
      const prompt = clips[cursor++]?.url;
      const options = cp.options.map(() => clips[cursor++]?.url);
      checkpointAudio[cp.id] = { prompt, options };
    }

    return {
      assignmentId: input.assignmentId,
      kind: input.source.kind,
      theme: input.theme,
      voice,
      ...(input.source.kind === "authored" && input.source.authoredBy ? { authoredBy: input.source.authoredBy } : {}),
      tts: this.tts ? { provider: this.tts.provider, keyHint: this.tts.keyHint } : undefined,
      props: props as unknown as Record<string, unknown>,
      checkpointAudio,
      silentBeats,
    };
  }
}


/**
 * Dev/demo only: animated lessons for pilot students built from their pilot
 * evidence (not a live diagnostic), so the student switcher can show each
 * one. Only students whose mistake has an animation recipe are listed.
 */
export const DEMO_ANIMATIONS: Partial<Record<string, AnimationInput>> = {
  aarav: { kind: "trinomial", input: { ...AARAV_TRINOMIAL_EXAMPLE, strengths: ["Factorising x² + bx + c"] } },
  meena: { kind: "distribution", input: { ...MEENA_EXAMPLE, strengths: ["Expanding one bracket"] } },
};

/** The lesson summary, exit item and decisions stored alongside a demo animation. */
export function demoLessonRecord(source: AnimationInput, firstName: string) {
  if (source.kind === "authored") throw new Error("Demo lessons are recipe lessons.");
  const input = { ...source, input: { ...source.input, studentName: firstName } } as AnimationInput;
  const props = buildForTheme(input, "classic") as DistributionLessonProps | TrinomialLessonProps;
  const trinomial = input.kind === "trinomial";
  const heading = trinomial ? "read the signs first" : props.scenes[1]!.title.replace(/^./, (c) => c.toLowerCase());
  const equation = trinomial
    ? formatTrinomial((props as TrinomialLessonProps).trinomial)
    : formatExpression((props as DistributionLessonProps).groups, (props as DistributionLessonProps).variable || "x");
  const seconds = props.scenes.flatMap((scene) => scene.beats).reduce((t, b) => t + b.seconds, 0);
  const lesson: PersonalizedVideoLesson = {
    title: firstName ? `${firstName}, ${heading}` : heading.replace(/^./, (c) => c.toUpperCase()),
    duration: `About ${Math.max(1, Math.round(seconds / 60))} min`,
    objective: trinomial
      ? "Use the signs of the last and middle terms to choose the pair before factorising."
      : "Multiply the number outside a bracket into every term inside it.",
    generationReason: "Built from your pilot diagnostic answers (demo lesson).",
    verification: "Every number was computed in code, and the exit item is new.",
    scenes: props.scenes.map((scene) => ({
      eyebrow: props.topic,
      headline: scene.title,
      equation: [{ text: equation }],
      narration: scene.beats.map((b) => b.text).join(" "),
      durationSeconds: Math.ceil(scene.beats.reduce((t, b) => t + b.seconds, 0)),
      accent: "green" as const,
    })),
  };
  const exit: PersonalizedVideoExitItem = {
    prompt: trinomial ? props.exit.prompt : `${props.exit.prompt} Show your steps.`,
    expected: props.exit.expected,
    evidencePurpose: "A fresh item with the same trap, answered without support.",
  };
  return {
    input,
    lesson,
    exit,
    conceptId: trinomial ? "FAC_MONIC_TRINOMIAL" : "C3_DISTRIBUTIVE_PROPERTY",
    learnerDecision: trinomial
      ? "Read the last term's sign, then the middle's, before choosing the pair; expand to check."
      : "Count the terms inside, give every term an arrow, then check.",
    teacherDecision: "Demo lesson from pilot evidence. Give one fresh item of the same form, unsupported.",
  };
}
