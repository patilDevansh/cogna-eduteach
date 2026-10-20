import type OpenAI from "openai";

/** Returns why AI-written text must not reach a student, or null when it may. */
export type StudentTextModerator = (texts: string[]) => Promise<string | null>;

/** Every string leaf of an AI-written object: what a student could end up reading. */
export function studentStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.trim()) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) studentStrings(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) studentStrings(v, out);
  }
  return out;
}

/**
 * OpenAI's moderation endpoint over everything a student will read.
 * Fails closed: if the check cannot run, the text is rejected and the caller's
 * existing fallback (another attempt, the question bank, a fixed lesson) takes over.
 */
export function openAiStudentTextModerator(client: OpenAI): StudentTextModerator {
  return async (texts) => {
    if (!texts.length) return null;
    try {
      const result = await client.moderations.create({ model: "omni-moderation-latest", input: texts });
      const flagged = result.results.find((r) => r.flagged);
      if (!flagged) return null;
      const categories = Object.entries(flagged.categories).filter(([, on]) => on).map(([name]) => name);
      return `safety check flagged the text (${categories.join(", ") || "unspecified"})`;
    } catch (error) {
      return `safety check unavailable — ${error instanceof Error ? error.message : String(error)}`;
    }
  };
}
