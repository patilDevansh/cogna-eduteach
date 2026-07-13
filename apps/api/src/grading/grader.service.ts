import { Injectable } from "@nestjs/common";
import type { Grade } from "@cogna/shared";

@Injectable()
export class GraderService {
  grade(submittedAnswer: string, acceptedAnswers: string[]): Grade {
    const normalized = this.normalize(submittedAnswer);
    if (!normalized) {
      return "INVALID_FORMAT";
    }

    const accepted = acceptedAnswers.map((a) => this.normalize(a));
    if (accepted.some((a) => a === normalized)) {
      return "CORRECT";
    }

    return "INCORRECT";
  }

  normalize(answer: string): string | null {
    const trimmed = answer.trim();
    if (!trimmed) {
      return null;
    }

    const lower = trimmed.toLowerCase().replace(/\s+/g, "");
    const withoutSpaces = lower.replace(/\s/g, "");

    // x=16 or x = 16 → normalize variable side
    const varMatch = withoutSpaces.match(/^x=(-?\d+(?:\.\d+)?)$/);
    if (varMatch) {
      return `x=${this.normalizeNumber(varMatch[1])}`;
    }

    const num = this.normalizeNumber(withoutSpaces);
    if (num !== null) {
      return num;
    }

    return withoutSpaces;
  }

  private normalizeNumber(value: string): string | null {
    const n = Number(value);
    if (Number.isNaN(n)) {
      return null;
    }
    if (Number.isInteger(n)) {
      return String(n);
    }
    return String(n);
  }
}
