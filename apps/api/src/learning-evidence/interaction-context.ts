import { BadRequestException, ConflictException } from "@nestjs/common";
import { validInteractionContext, type StudentInteractionContext } from "@cogna/shared";

export function assertInteractionContext(value: unknown, source: "EXERCISE" | "LOTUS", questionId: string | undefined, questionVersion: number | null, reportedConfidence: number | null | undefined): asserts value is StudentInteractionContext | undefined {
  if (value === undefined) return; // Old clients remain compatible, not measured.
  if (!validInteractionContext(value) || value.source !== source || value.questionId !== questionId || value.questionVersion !== questionVersion || value.confidence.scale !== (source === "EXERCISE" ? "ONE_TO_FIVE" : "ZERO_TO_HUNDRED") || (value.confidence.status === "REPORTED_BEFORE_ANSWER" && value.confidence.value !== reportedConfidence)) {
    throw new BadRequestException("Invalid or mismatched question interaction context.");
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
/** New context-bearing submissions cannot reuse an old identity with edited evidence. */
export function assertSameInteractionSubmission(previous: unknown, incoming: unknown): void {
  const prior = previous as { interactionContext?: unknown } | null;
  const next = incoming as { interactionContext?: unknown };
  const { storedResponse: _serverResponse, ...originalWire } = (prior ?? {}) as Record<string, unknown>;
  if ((prior?.interactionContext || next.interactionContext) && canonical(originalWire) !== canonical(incoming)) throw new ConflictException("This submission was already saved with different evidence. Reload the current question.");
}
