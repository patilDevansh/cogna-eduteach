import type {
  LotusMathVerification,
  LotusQuestion,
  LotusStudentResponse,
} from "@cogna/shared";

class ArithmeticParser {
  private index = 0;

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
      if (this.take("+")) value += this.term();
      else if (this.take("-")) value -= this.term();
      else return value;
    }
  }

  private term(): number {
    let value = this.factor();
    while (true) {
      this.space();
      if (this.take("*")) value *= this.factor();
      else if (this.take("/")) {
        const divisor = this.factor();
        if (divisor === 0) throw new Error("Division by zero.");
        value /= divisor;
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

export function evaluateArithmetic(expression: string): number {
  const normalized = expression
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-");
  if (!/^[0-9+\-*/().\s]+$/.test(normalized)) {
    throw new Error("Expression contains unsupported characters.");
  }
  return new ArithmeticParser(normalized).parse();
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
    const value = evaluateArithmetic(expression);
    return {
      ...question,
      answerKey: {
        ...question.answerKey,
        canonicalAnswer: formatNumber(value),
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

export function questionFingerprints(question: Omit<LotusQuestion, "id"> | LotusQuestion): {
  exact: string;
  structure: string;
} {
  const base = question.answerKey?.expression || question.prompt;
  const exact = base.toLowerCase().replace(/\s+/g, "").replace(/[×·]/g, "*").replace(/÷/g, "/");
  return { exact, structure: exact.replace(/\d+(?:\.\d+)?/g, "#") };
}
