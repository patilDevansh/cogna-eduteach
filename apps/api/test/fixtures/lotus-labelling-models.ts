/**
 * A pretend AI that labels a wrong answer the way a real reviewer is asked to
 * (lotus-prompts.ts: MISUNDERSTANDING / SLIP / GUESS / UNREADABLE), from the cues in
 * the review prompt: the code's verdict, the answer, the working and the key.
 *
 * PersonaFakeModels gives every answer the same flat review with no label, so slips,
 * guesses and real misunderstandings are indistinguishable to the rules. This one is
 * used by held-out v3 only; the earlier persona and held-out suites keep the flat one.
 *
 * It never names a wrong step: a misunderstanding comes back as "the method is wrong,
 * but I can't say at which step", which is exactly the case where the rules get no
 * skill evidence from the review.
 *
 * Cues, in order:
 *   - the code verified the answer correct: no label.
 *   - the working says it is guessing or doesn't know: GUESS.
 *   - the code could not read the answer: UNREADABLE.
 *   - some line of the working already equals the key: SLIP (right method, miscopied).
 *   - otherwise: MISUNDERSTANDING, no step.
 */
import type { LotusDebateClosure } from "@cogna/shared";
import { algebraicallyEqual, sameFactorisation } from "../../src/lotus/lotus-algebra";
import { PersonaFakeModels } from "./lotus-factorisation-personas";

interface ReviewEvidence {
  question?: { answerKey?: { canonicalAnswer?: string; diagnostics?: { itemKind?: string } } };
  response?: { answer?: string; working?: string };
  verification?: { status?: string };
}

function readEvidence(prompt: string): ReviewEvidence | null {
  const marker = "Current raw evidence: ";
  const at = prompt.indexOf(marker);
  if (at < 0) return null;
  const line = prompt.slice(at + marker.length).split("\n")[0]!;
  try { return JSON.parse(line) as ReviewEvidence; } catch { return null; }
}

function workingReachesKey(working: string, key: string, kind: string | undefined): boolean {
  const same = (a: string, b: string) => { try { return kind === "FACTORISE" ? sameFactorisation(a, b) : algebraicallyEqual(a, b); } catch { return false; } };
  for (const line of working.split("\n")) {
    const candidates = [line, line.split("=").at(-1) ?? ""].map((c) => c.replace(/^\s*(so|therefore|answer:?)\s+/i, "").trim()).filter(Boolean);
    if (candidates.some((c) => same(c, key))) return true;
  }
  return false;
}

export class LabellingPersonaModels extends PersonaFakeModels {
  override async challengerClosure(prompt?: string): Promise<LotusDebateClosure> {
    const base = await super.challengerClosure();
    const ev = prompt ? readEvidence(prompt) : null;
    if (!ev || ev.verification?.status === "VERIFIED_CORRECT") return base;
    const working = ev.response?.working ?? "";
    const key = ev.question?.answerKey?.canonicalAnswer ?? "";
    const kind = ev.question?.answerKey?.diagnostics?.itemKind;
    if (/guess|don't know|idk/i.test(working)) return { ...base, mistakeKind: "GUESS", mistakeDescription: "No method shown; looks like a guess." };
    if (ev.verification?.status === "NOT_DETERMINISTIC") return { ...base, mistakeKind: "UNREADABLE", mistakeDescription: "The answer couldn't be read as maths." };
    if (key && workingReachesKey(working, key, kind)) return { ...base, mistakeKind: "SLIP", mistakeDescription: "The working reaches the right answer; the final line was miscopied." };
    return { ...base, mistakeKind: "MISUNDERSTANDING", mistakeDescription: "The method looks misapplied, but no single step is named." };
  }
}
