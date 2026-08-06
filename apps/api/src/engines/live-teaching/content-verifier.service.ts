import { Injectable } from "@nestjs/common";
import { containsForbiddenTerm } from "@cogna/shared";
import { TRUSTED_TEMPLATE_IDS } from "./template-render.service";
import {
  isLinearEquationParams,
  isTwoBinomialParams,
  isVariableBothSidesParams,
  type RenderedQuestion,
} from "./template-render.types";

export interface ContentVerifyResult {
  passed: boolean;
  layers: {
    answer: boolean;
    steps: boolean;
    pedagogy: boolean;
    voice: boolean;
    hints: boolean;
  };
  failures: string[];
}

/**
 * ContentVerifier — answer, steps, pedagogy, voice, hints.
 * Nothing generated reaches a child unless all layers pass.
 */
@Injectable()
export class ContentVerifierService {
  verify(rendered: RenderedQuestion): ContentVerifyResult {
    const failures: string[] = [];

    const answer = this.verifyAnswer(rendered, failures);
    const steps = this.verifySteps(rendered, failures);
    const pedagogy = this.verifyPedagogy(rendered, failures);
    const voice = this.verifyVoice(rendered, failures);
    const hints = this.verifyHints(rendered, failures);

    const layers = { answer, steps, pedagogy, voice, hints };
    const passed = Object.values(layers).every(Boolean);

    return { passed, layers, failures };
  }

  /** Dispatches to a per-family independent re-derivation — never trusts the renderer's own math. */
  private verifyAnswer(rendered: RenderedQuestion, failures: string[]): boolean {
    const { params } = rendered;
    if (isVariableBothSidesParams(params)) {
      return this.verifyAnswerVariableBothSides(rendered, failures);
    }
    if (isTwoBinomialParams(params)) {
      return this.verifyAnswerTwoBinomial(rendered, failures);
    }
    return this.verifyAnswerLinear(rendered, failures);
  }

  /** Re-solve a·x + b = c and match accepted answers. */
  private verifyAnswerLinear(rendered: RenderedQuestion, failures: string[]): boolean {
    const params = rendered.params;
    if (!isLinearEquationParams(params)) {
      failures.push("answer: expected LinearEquationParams");
      return false;
    }
    const { a, b, x } = params;
    const c = rendered.c;
    if (a === 0 || c === undefined) {
      failures.push("answer: coefficient a must be non-zero and c must be set");
      return false;
    }
    if ((c - b) % a !== 0) {
      failures.push("answer: equation does not yield integer solution");
      return false;
    }
    const resolved = (c - b) / a;
    if (resolved !== x) {
      failures.push(`answer: re-solve got ${resolved}, expected x=${x}`);
      return false;
    }

    const acceptedSet = new Set(rendered.acceptedAnswers.map((s) => this.normalizeAnswer(s)));
    const expected = this.normalizeAnswer(String(x));
    if (!acceptedSet.has(expected) && !acceptedSet.has(`x=${expected}`)) {
      failures.push("answer: acceptedAnswers do not include re-solved value");
      return false;
    }
    return true;
  }

  /**
   * Re-solve a·x + b = c·x + d independently of the renderer, then require the
   * re-solved value to appear in acceptedAnswers. Deliberately its own small
   * computation path (not a shared helper with template-render.service.ts) so
   * a bug in that service's formula wouldn't also be baked into this check.
   */
  private verifyAnswerVariableBothSides(rendered: RenderedQuestion, failures: string[]): boolean {
    const params = rendered.params;
    if (!isVariableBothSidesParams(params)) {
      failures.push("answer: expected VariableBothSidesParams");
      return false;
    }
    const { a, b, c, d, x } = params;
    if (a === c) {
      failures.push("answer: a and c must differ (no unique solution otherwise)");
      return false;
    }
    const diff = a - c;
    if ((d - b) % diff !== 0) {
      failures.push("answer: equation does not yield an integer solution");
      return false;
    }
    const resolved = (d - b) / diff;
    if (resolved !== x) {
      failures.push(`answer: re-solve got ${resolved}, expected x=${x}`);
      return false;
    }
    const acceptedSet = new Set(rendered.acceptedAnswers.map((s) => this.normalizeAnswer(s)));
    const expected = this.normalizeAnswer(String(x));
    if (!acceptedSet.has(expected) && !acceptedSet.has(`x=${expected}`)) {
      failures.push("answer: acceptedAnswers do not include re-solved value");
      return false;
    }
    return true;
  }

  /**
   * Independently recomputes mid=a+b and last=a*b and its OWN answer-string
   * format (not template-render.service.ts's formatter) for both the expand
   * and factor directions of the (x+a)(x+b) identity, then requires it to
   * match what the renderer actually produced.
   */
  private verifyAnswerTwoBinomial(rendered: RenderedQuestion, failures: string[]): boolean {
    const params = rendered.params;
    if (!isTwoBinomialParams(params)) {
      failures.push("answer: expected TwoBinomialParams");
      return false;
    }
    const { a, b, direction } = params;
    if (a === 0 || b === 0) {
      failures.push("answer: a and b must be non-zero");
      return false;
    }
    const mid = a + b;
    const last = a * b;

    if (direction === "expand") {
      const midPart = mid === 0 ? "" : `${mid > 0 ? "+" : "-"}${Math.abs(mid) === 1 ? "" : Math.abs(mid)}x`;
      const lastPart = last === 0 ? "" : `${last > 0 ? "+" : "-"}${Math.abs(last)}`;
      const independentExpected = `x^2${midPart}${lastPart}`;
      const acceptedSet = new Set(rendered.acceptedAnswers.map((s) => s.replace(/\s+/g, "")));
      if (!acceptedSet.has(independentExpected)) {
        failures.push(
          `answer: independent expansion "${independentExpected}" not found in acceptedAnswers`,
        );
        return false;
      }
      return true;
    }

    // direction === "factor": independently verify the given polynomial actually
    // factors to (x+a)(x+b), and that the rendered answer states exactly that pair.
    const stemMatch = rendered.stem.match(/x\^2\s*([+-]\s*\d*x)?\s*([+-]\s*\d+)?/);
    if (!stemMatch) {
      failures.push("answer: could not parse the trinomial from the stem");
      return false;
    }
    const parseSignedTerm = (s: string | undefined): number => {
      if (!s) return 0;
      const trimmed = s.replace(/\s+/g, "");
      const sign = trimmed.startsWith("-") ? -1 : 1;
      const digits = trimmed.match(/(\d+)/);
      return sign * (digits ? Number(digits[1]) : 1);
    };
    const stemMid = parseSignedTerm(stemMatch[1]?.replace(/x$/, ""));
    const stemLast = parseSignedTerm(stemMatch[2]);
    if (stemMid !== mid || stemLast !== last) {
      failures.push("answer: stem's trinomial does not match a+b / a*b for the given params");
      return false;
    }
    const independentExpected = `(x${a > 0 ? "+" : ""}${a})(x${b > 0 ? "+" : ""}${b})`.replace(/\s+/g, "");
    const acceptedSet = new Set(rendered.acceptedAnswers.map((s) => s.replace(/\s+/g, "")));
    if (!acceptedSet.has(independentExpected)) {
      failures.push(
        `answer: independent factor pair "${independentExpected}" not found in acceptedAnswers`,
      );
      return false;
    }
    return true;
  }

  /**
   * Substitute answer into intermediate steps when possible.
   * Soft-pass deterministic C-lite templates.
   */
  private verifySteps(rendered: RenderedQuestion, failures: string[]): boolean {
    if (TRUSTED_TEMPLATE_IDS.has(rendered.templateId)) {
      // Soft-pass: template authoring guarantees step correctness for a·x+b=c.
      return true;
    }

    if (!rendered.explanationSteps?.length) {
      failures.push("steps: explanationSteps missing");
      return false;
    }

    // Free-form step verification is only implemented for the linear family today —
    // every other family is currently always a TRUSTED_TEMPLATE_ID and soft-passes above.
    const params = rendered.params;
    if (!isLinearEquationParams(params) || rendered.c === undefined) {
      failures.push("steps: free-form verification not implemented for this params family");
      return false;
    }
    const { a, b, x } = params;
    const c = rendered.c;
    // Hard check for free-form: each step string after substituting x should not
    // claim a false equation like "N = M" where N≠M for numbers.
    for (const step of rendered.explanationSteps) {
      const subbed = step.replace(/\bx\b/g, String(x));
      if (!this.numericClaimsHold(subbed, a, b, c, x)) {
        failures.push(`steps: failed after substituting x=${x}: ${step}`);
        return false;
      }
    }
    return true;
  }

  private verifyPedagogy(rendered: RenderedQuestion, failures: string[]): boolean {
    if (!rendered.conceptId || !rendered.conceptId.trim()) {
      failures.push("pedagogy: conceptId missing");
      return false;
    }
    const { a } = rendered.params;
    if (a === 0) {
      failures.push("pedagogy: not linear (a=0)");
      return false;
    }
    // One-variable linear-ish: somewhere in the rendered content (stem for the
    // bare-equation template, or the worked explanation for a word-problem
    // template that deliberately never says "x" in the story itself) there
    // must be a single unknown and at least one equation.
    const searchText = [rendered.stem, ...(rendered.explanationSteps ?? [])].join(" \n ");
    const xCount = (searchText.match(/\bx\b/gi) ?? []).length;
    const eqCount = (searchText.match(/=/g) ?? []).length;
    if (xCount < 1 || eqCount < 1) {
      failures.push("pedagogy: content is not one-variable linear-ish");
      return false;
    }
    return true;
  }

  private verifyVoice(rendered: RenderedQuestion, failures: string[]): boolean {
    const texts = [
      rendered.stem,
      ...rendered.hints,
      ...rendered.explanationSteps,
      ...rendered.acceptedAnswers,
    ];
    for (const text of texts) {
      if (containsForbiddenTerm(text)) {
        failures.push(`voice: forbidden term in "${text.slice(0, 80)}"`);
        return false;
      }
    }
    return true;
  }

  /** Reject if any hint includes the final answer string. */
  private verifyHints(rendered: RenderedQuestion, failures: string[]): boolean {
    const answerTokens = new Set(
      rendered.acceptedAnswers
        .flatMap((a) => [a, this.normalizeAnswer(a), a.replace(/^x\s*=\s*/i, "")])
        .map((t) => t.trim())
        .filter(Boolean),
    );
    // Only the linear/variable-both-sides families have a single numeric "x" answer;
    // two-binomial answers are whole expressions, so there is no numeric primary token.
    const params = rendered.params;
    const primary = "x" in params ? String(params.x) : "";

    for (const hint of rendered.hints) {
      const lower = hint.toLowerCase();
      for (const token of answerTokens) {
        if (!token) continue;
        if (this.hintContainsAnswer(lower, token.toLowerCase(), primary)) {
          failures.push(`hints: hint leaks answer "${token}"`);
          return false;
        }
      }
    }
    return true;
  }

  private hintContainsAnswer(hintLower: string, tokenLower: string, primary: string): boolean {
    if (tokenLower === primary || /^-?\d+$/.test(tokenLower)) {
      // Whole-number answer: match as standalone number, not as substring of larger numbers.
      const re = new RegExp(`(?<![0-9])${this.escapeRegExp(tokenLower)}(?![0-9])`);
      return re.test(hintLower);
    }
    return hintLower.includes(tokenLower);
  }

  private escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private normalizeAnswer(answer: string): string {
    const trimmed = answer.trim().toLowerCase().replace(/\s+/g, "");
    const varMatch = trimmed.match(/^x=(-?\d+(?:\.\d+)?)$/);
    if (varMatch) return varMatch[1]!;
    return trimmed;
  }

  /** Conservative numeric claim check for free-form steps. */
  private numericClaimsHold(
    text: string,
    _a: number,
    _b: number,
    _c: number,
    _x: number,
  ): boolean {
    const eq = text.match(/(-?\d+(?:\.\d+)?)\s*=\s*(-?\d+(?:\.\d+)?)/);
    if (!eq) return true;
    return Number(eq[1]) === Number(eq[2]);
  }
}
