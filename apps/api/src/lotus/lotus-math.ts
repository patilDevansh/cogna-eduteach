import type {
  LotusBreakpointDiagnosis,
  LotusMathCrossCheck,
  LotusMathVerification,
  LotusQuestion,
  LotusStudentResponse,
} from "@cogna/shared";

class ArithmeticParser {
  private index = 0;
  /**
   * Every intermediate value produced while reducing the expression, in
   * evaluation order. This is how question-generation-time checkpoints are
   * derived: by re-running this same parser on the model's expression, never
   * by asking the model to report its own steps.
   */
  readonly trace: number[] = [];

  constructor(private readonly source: string) {}

  parse(): number {
    const result = this.expression();
    this.space();
    if (this.index !== this.source.length || !Number.isFinite(result)) {
      throw new Error("Unsupported arithmetic expression.");
    }
    return result;
  }

  private expression(): number {
    let value = this.term();
    while (true) {
      this.space();
      if (this.take("+")) { value += this.term(); this.trace.push(value); }
      else if (this.take("-")) { value -= this.term(); this.trace.push(value); }
      else return value;
    }
  }

  private term(): number {
    let value = this.factor();
    while (true) {
      this.space();
      if (this.take("*")) { value *= this.factor(); this.trace.push(value); }
      else if (this.take("/")) {
        const divisor = this.factor();
        if (divisor === 0) throw new Error("Division by zero.");
        value /= divisor;
        this.trace.push(value);
      } else return value;
    }
  }

  private factor(): number {
    this.space();
    if (this.take("+")) return this.factor();
    if (this.take("-")) return -this.factor();
    if (this.take("(")) {
      const value = this.expression();
      this.space();
      if (!this.take(")")) throw new Error("Unclosed parenthesis.");
      return value;
    }
    const start = this.index;
    while (/[0-9.]/.test(this.source[this.index] ?? "")) this.index += 1;
    if (start === this.index) throw new Error("Expected a number.");
    const value = Number(this.source.slice(start, this.index));
    if (!Number.isFinite(value)) throw new Error("Invalid number.");
    return value;
  }

  private take(token: string): boolean {
    if (this.source[this.index] !== token) return false;
    this.index += 1;
    return true;
  }

  private space(): void {
    while (/\s/.test(this.source[this.index] ?? "")) this.index += 1;
  }
}

function normalizeExpressionText(expression: string): string {
  return expression
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-");
}

export function evaluateArithmetic(expression: string): number {
  const normalized = normalizeExpressionText(expression);
  if (!/^[0-9+\-*/().\s]+$/.test(normalized)) {
    throw new Error("Expression contains unsupported characters.");
  }
  return new ArithmeticParser(normalized).parse();
}

/**
 * Intermediate values produced while evaluating `expression`, in order,
 * ending with the final result. Deterministic and derived only from the
 * expression itself — this is the reference chain a student's working is
 * checked against, computed once at question-generation time.
 */
export function computeCheckpoints(expression: string): number[] {
  const normalized = normalizeExpressionText(expression);
  if (!/^[0-9+\-*/().\s]+$/.test(normalized)) {
    throw new Error("Expression contains unsupported characters.");
  }
  const parser = new ArithmeticParser(normalized);
  const result = parser.parse();
  const trace = parser.trace;
  if (trace.length === 0 || trace[trace.length - 1] !== result) trace.push(result);
  return trace;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(10)));
}

function numericFromStudentAnswer(answer: string): number | null {
  const cleaned = answer
    .trim()
    .replace(/^[A-Z]\s*[).:-]\s*/i, "")
    .replace(/,/g, "");
  const fraction = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? null : Number(fraction[1]) / denominator;
  }
  const exact = cleaned.match(/^-?\d+(?:\.\d+)?$/);
  if (exact) return Number(exact[0]);
  const trailing = cleaned.match(/(?:^|\s)(-?\d+(?:\.\d+)?)\s*$/);
  return trailing ? Number(trailing[1]) : null;
}

export function normalizeQuestionAnswerKey<T extends Omit<LotusQuestion, "id">>(question: T): T {
  const expression = question.answerKey?.expression;
  if (!expression || question.answerKey.kind === "OPEN_RESPONSE") return question;
  try {
    const checkpoints = computeCheckpoints(expression);
    const value = checkpoints[checkpoints.length - 1]!;
    return {
      ...question,
      answerKey: {
        ...question.answerKey,
        canonicalAnswer: formatNumber(value),
        checkpoints,
      },
    };
  } catch {
    return question;
  }
}

export function verifyLotusResponse(
  question: LotusQuestion,
  response: LotusStudentResponse,
): LotusMathVerification {
  if (response.didNotKnow) {
    return {
      status: "NO_ANSWER",
      correctAnswer: question.answerKey.canonicalAnswer,
      method: question.answerKey.expression ? "DETERMINISTIC_ARITHMETIC" : "AI_AUTHORED_REFERENCE",
      explanation: "The student explicitly selected “I don't know.”",
    };
  }
  const expression = question.answerKey.expression;
  if (!expression || question.answerKey.kind === "OPEN_RESPONSE") {
    return {
      status: "NOT_DETERMINISTIC",
      correctAnswer: question.answerKey.canonicalAnswer,
      method: "AI_AUTHORED_REFERENCE",
      explanation: "This response requires educational interpretation rather than numeric matching.",
    };
  }
  try {
    const expected = evaluateArithmetic(expression);
    const received = numericFromStudentAnswer(response.answer);
    if (received === null) {
      return {
        status: "NOT_DETERMINISTIC",
        correctAnswer: formatNumber(expected),
        method: "DETERMINISTIC_ARITHMETIC",
        explanation: "The reference arithmetic was verified, but the submitted answer was not a single readable number.",
      };
    }
    const correct = Math.abs(received - expected) <= 1e-9;
    return {
      status: correct ? "VERIFIED_CORRECT" : "VERIFIED_INCORRECT",
      correctAnswer: formatNumber(expected),
      method: "DETERMINISTIC_ARITHMETIC",
      explanation: correct
        ? `The submitted value equals the deterministically evaluated result ${formatNumber(expected)}.`
        : `The submitted value does not equal the deterministically evaluated result ${formatNumber(expected)}.`,
    };
  } catch {
    return {
      status: "NOT_DETERMINISTIC",
      correctAnswer: question.answerKey.canonicalAnswer,
      method: "AI_AUTHORED_REFERENCE",
      explanation: "The expression could not be evaluated by the limited arithmetic referee.",
    };
  }
}

/** The value the line is asserting, taken from after the last "=" when present, else the last number in the line. */
function extractLineValue(line: string): number | null {
  const cleaned = line.trim().replace(/,/g, "");
  const equalsIndex = cleaned.lastIndexOf("=");
  const segment = equalsIndex >= 0 ? cleaned.slice(equalsIndex + 1) : cleaned;
  const matches = segment.match(/-?\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;
  return Number(matches[matches.length - 1]);
}

/**
 * Instant, AI-free read of where a student's working first stops matching
 * the reference checkpoint chain. Values are matched against checkpoints in
 * order but out-of-sequence-length-tolerant — a student who wrote only the
 * final answer, skipping intermediate steps, is matched against the tail of
 * the chain rather than flagged as an immediate mismatch. This is *where*
 * the answer diverged, never *why*; only the slow analysis may conclude why.
 */
export function diagnoseBreakpoint(
  question: LotusQuestion,
  response: LotusStudentResponse,
): LotusBreakpointDiagnosis {
  const checkpoints = question.answerKey.checkpoints;
  if (response.didNotKnow) return { status: "NO_WORKING" };
  if (!checkpoints || checkpoints.length === 0) return { status: "NOT_DETERMINISTIC" };

  const observedValues = (response.working || "")
    .split("\n")
    .map(extractLineValue)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (observedValues.length === 0) return { status: "NO_WORKING" };

  let checkPointer = 0;
  for (const observed of observedValues) {
    let matchedAt = -1;
    for (let i = checkPointer; i < checkpoints.length; i += 1) {
      if (Math.abs(checkpoints[i]! - observed) <= 1e-6) {
        matchedAt = i;
        break;
      }
    }
    if (matchedAt === -1) {
      return {
        status: "DIVERGED",
        divergedAtStep: checkPointer + 1,
        expectedValue: checkpoints[checkPointer],
        studentValue: observed,
      };
    }
    checkPointer = matchedAt + 1;
  }
  return { status: "MATCHED_THROUGH_ALL_STEPS" };
}

/**
 * Pulls a literal arithmetic expression out of the prompt's own wording,
 * when one is written there (Grade-8-CBSE prompts in this domain routinely
 * state it verbatim: "Evaluate 3(4 - 7)"). Handles unicode math symbols and
 * implicit multiplication next to a bracket. Returns null rather than a
 * best-effort guess when the prompt isn't in a form this can parse
 * confidently (a word problem, an MCQ stem) — an abstention, not a check.
 */
export function extractExpressionFromPrompt(prompt: string): string | null {
  const evalMatch = /^\s*evaluate\s+(.+)/i.exec(prompt);
  let text = evalMatch ? evalMatch[1]! : prompt;
  text = text.split(/\.\s*(?:show|write|explain)/i)[0]!;
  // A period at the very end of the text is always sentence punctuation,
  // never a decimal point — a real decimal always has a digit after the
  // dot. Strip it before extraction, or "." itself (kept in the allowed
  // character class below so genuine decimals like "7.5" still work) would
  // get pulled into the candidate and make it fail to parse.
  text = text.replace(/\.\s*$/, "");

  let normalized = normalizeExpressionText(text)
    .replace(/(\d|\))\s*\(/g, "$1*(")
    .replace(/\)\s*(\d)/g, ")*$1");

  const candidates = normalized.match(/[0-9+\-*/().\s]+/g) ?? [];
  const candidate = candidates
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && /[+\-*/()]/.test(segment))
    .sort((a, b) => b.length - a.length)[0];
  return candidate ?? null;
}

/**
 * Cross-checks a candidate's answerKey.expression against an expression
 * independently re-extracted from its own prompt text — two different
 * derivations of the same question that must agree, rather than trusting
 * the model's expression on its own. This is what makes "generated math is
 * independently verified" actually true rather than a check that only
 * confirms the model's expression is consistent with itself.
 */
export function crossCheckExpressionAgainstPrompt(
  question: Omit<LotusQuestion, "id">,
): LotusMathCrossCheck {
  const expression = question.answerKey?.expression;
  if (!expression || question.answerKey.kind === "OPEN_RESPONSE") {
    return { status: "UNVERIFIABLE", explanation: "No deterministic expression to cross-check." };
  }
  const extracted = extractExpressionFromPrompt(question.prompt);
  if (!extracted) {
    return {
      status: "UNVERIFIABLE",
      explanation: "Could not independently extract a literal expression from the prompt's wording.",
    };
  }
  let fromPrompt: number;
  let fromKey: number;
  try {
    fromPrompt = evaluateArithmetic(extracted);
  } catch {
    return {
      status: "UNVERIFIABLE",
      explanation: `Extracted "${extracted}" from the prompt but it did not evaluate as arithmetic.`,
    };
  }
  try {
    fromKey = evaluateArithmetic(expression);
  } catch {
    return { status: "UNVERIFIABLE", explanation: "The answer key's own expression did not evaluate." };
  }
  if (Math.abs(fromPrompt - fromKey) <= 1e-9) {
    return {
      status: "MATCHED",
      explanation: `The prompt's own wording ("${extracted}") and the answer key's expression independently evaluate to the same result.`,
    };
  }
  return {
    status: "MISMATCHED",
    explanation: `The prompt's own wording ("${extracted}") evaluates to ${formatNumber(fromPrompt)}, but the answer key's expression ("${expression}") evaluates to ${formatNumber(fromKey)}. The question must not be shown as written.`,
  };
}

export function questionFingerprints(question: Omit<LotusQuestion, "id"> | LotusQuestion): {
  exact: string;
  structure: string;
} {
  const base = question.answerKey?.expression || question.prompt;
  const exact = base.toLowerCase().replace(/\s+/g, "").replace(/[×·]/g, "*").replace(/÷/g, "/");
  return { exact, structure: exact.replace(/\d+(?:\.\d+)?/g, "#") };
}
