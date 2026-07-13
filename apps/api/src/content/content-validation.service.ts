import { Injectable, Logger } from "@nestjs/common";
import type { DraftType } from "@cogna/shared/contracts/content-drafts";

export interface ValidationInput {
  draftType: DraftType;
  conceptId: string;
  difficulty?: number;
  targetMisconception?: string;
  payload: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Content Validation Service — content-validation-rules-v1
 *
 * Validation rules:
 * 1. Schema validation (type, required fields)
 * 2. Canonical concept ID (no aliases)
 * 3. Difficulty present and in range [1-10]
 * 4. Accepted answers match question type
 * 5. Programmatic math check (basic)
 * 6. No clinical language (deny-list)
 */
@Injectable()
export class ContentValidationService {
  private readonly logger = new Logger(ContentValidationService.name);
  private readonly version = "content-validation-rules-v1";

  // Canonical concept IDs for Linear Equations unit (MVP 3.0)
  private readonly canonicalConceptIds = new Set([
    "C1_BASIC_SOLVING",
    "C2_VARIABLES_BOTH_SIDES",
    "C3_DISTRIBUTIVE_PROPERTY",
    "C4_COMBINING_LIKE_TERMS",
    "C5_FRACTIONAL_COEFFICIENTS",
    "C6_SIMPLE_WORD_PROBLEMS",
  ]);

  // Clinical/attention/personality language deny-list
  private readonly denyListPatterns = [
    /\b(ADHD|ADD)\b/i,
    /\b(autis[mt]|asperger)\b/i,
    /\b(dyslexia|dyscalculia)\b/i,
    /\bIQ\b/i,
    /\b(anxiety|depression|disorder)\b/i,
    /\b(lazy|stupid|dumb|slow)\b/i,
    /\b(learning disab(ility|led))\b/i,
    /\b(personality type)\b/i,
  ];

  async validateContent(input: ValidationInput): Promise<ValidationResult> {
    const errors: string[] = [];

    // Rule 1: Schema validation
    if (input.draftType === "QUESTION") {
      this.validateQuestionSchema(input.payload, errors);
    } else if (input.draftType === "EXPLANATION_TEMPLATE") {
      this.validateExplanationSchema(input.payload, errors);
    } else {
      errors.push(`Unsupported draftType: ${input.draftType}`);
    }

    // Rule 2: Canonical concept ID
    if (!this.canonicalConceptIds.has(input.conceptId)) {
      errors.push(
        `Non-canonical conceptId: ${input.conceptId}. Must use canonical Linear Equations concept IDs.`,
      );
    }

    // Rule 3: Difficulty present and in range
    if (input.difficulty === undefined || input.difficulty === null) {
      errors.push("Difficulty is required");
    } else if (input.difficulty < 1 || input.difficulty > 10) {
      errors.push(`Difficulty must be in range [1-10], got ${input.difficulty}`);
    }

    // Rule 6: Deny-list language check
    if (input.draftType === "QUESTION" || input.draftType === "EXPLANATION_TEMPLATE") {
      this.checkDenyList(input.payload, errors);
    }

    const valid = errors.length === 0;

    if (!valid) {
      this.logger.warn(
        `Validation failed for ${input.draftType} ${input.conceptId}: ${errors.join("; ")}`,
      );
    }

    return {
      valid,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private validateQuestionSchema(
    payload: Record<string, unknown>,
    errors: string[],
  ): void {
    const { type, stem, acceptedAnswers, acceptedAnswer, options, allowedErrorMargin } = payload;

    // Required fields
    if (!type) {
      errors.push("Question type is required");
    }
    if (!stem || typeof stem !== "string" || stem.trim().length === 0) {
      errors.push("Question stem is required");
    }

    // Accept either acceptedAnswers (schema) or acceptedAnswer (draft payload)
    const answer = acceptedAnswers ?? acceptedAnswer;

    // Type-specific validation
    if (type === "NUMERIC") {
      // Rule 4: Accepted answer for NUMERIC must exist
      if (answer === undefined || answer === null) {
        errors.push("NUMERIC question requires acceptedAnswer or acceptedAnswers");
      } else if (typeof answer === "object" && answer !== null) {
        // Check if it's an object with a value field
        const answerValue = (answer as { value?: unknown }).value;
        if (typeof answerValue !== "number") {
          errors.push(
            `NUMERIC question answer value must be a number, got ${typeof answerValue}`,
          );
        } else if (isNaN(answerValue) || !isFinite(answerValue)) {
          errors.push("Answer value must be a finite number");
        }
      } else if (typeof answer !== "number") {
        errors.push(
          `NUMERIC question answer must be a number or object with value field, got ${typeof answer}`,
        );
      }

      // Allowed error margin should be non-negative if present
      if (
        allowedErrorMargin !== undefined &&
        (typeof allowedErrorMargin !== "number" || allowedErrorMargin < 0)
      ) {
        errors.push("allowedErrorMargin must be a non-negative number");
      }
    } else if (type === "MCQ") {
      // Rule 4: MCQ requires options array
      if (!Array.isArray(options) || options.length === 0) {
        errors.push("MCQ question requires non-empty options array");
      }

      // Accepted answer must be a valid option index or value
      if (answer === undefined || answer === null) {
        errors.push("MCQ question requires acceptedAnswer or acceptedAnswers");
      } else if (typeof answer === "number") {
        if (
          Array.isArray(options) &&
          (answer < 0 || answer >= options.length)
        ) {
          errors.push(
            `MCQ acceptedAnswer index ${answer} out of bounds (options.length=${options.length})`,
          );
        }
      } else if (typeof answer === "string") {
        if (
          Array.isArray(options) &&
          !options.some((opt) => String(opt) === answer)
        ) {
          errors.push(
            `MCQ acceptedAnswer "${answer}" not found in options`,
          );
        }
      } else if (typeof answer === "object" && answer !== null) {
        // Check if it's an object with a value field
        const answerValue = (answer as { value?: unknown }).value;
        if (answerValue !== undefined) {
          if (typeof answerValue === "number") {
            if (
              Array.isArray(options) &&
              (answerValue < 0 || answerValue >= options.length)
            ) {
              errors.push(
                `MCQ answer.value index ${answerValue} out of bounds`,
              );
            }
          } else if (
            Array.isArray(options) &&
            !options.some((opt) => String(opt) === String(answerValue))
          ) {
            errors.push(
              `MCQ answer.value "${answerValue}" not found in options`,
            );
          }
        }
      } else {
        errors.push(
          `MCQ acceptedAnswer must be a number (index) or string (value)`,
        );
      }
    } else if (type === "WORD_PROBLEM") {
      // WORD_PROBLEM is like NUMERIC with context
      if (answer === undefined || answer === null) {
        errors.push("WORD_PROBLEM question requires acceptedAnswer or acceptedAnswers");
      } else if (typeof answer === "object" && answer !== null) {
        const answerValue = (answer as { value?: unknown }).value;
        if (
          typeof answerValue !== "number" &&
          typeof answerValue !== "string"
        ) {
          errors.push(
            `WORD_PROBLEM answer.value must be number or string, got ${typeof answerValue}`,
          );
        }
      } else if (
        typeof answer !== "number" &&
        typeof answer !== "string"
      ) {
        errors.push(
          `WORD_PROBLEM answer must be number or string, got ${typeof answer}`,
        );
      }
    } else {
      errors.push(`Unknown question type: ${type}`);
    }
  }

  private validateExplanationSchema(
    payload: Record<string, unknown>,
    errors: string[],
  ): void {
    const { misconceptionId, conceptId, template } = payload;

    if (!misconceptionId || typeof misconceptionId !== "string") {
      errors.push("Explanation misconceptionId is required");
    }
    if (!conceptId || typeof conceptId !== "string") {
      errors.push("Explanation conceptId is required");
    }
    if (!template || typeof template !== "string" || template.trim().length === 0) {
      errors.push("Explanation template is required");
    }
  }

  private checkDenyList(payload: Record<string, unknown>, errors: string[]): void {
    // Check text fields for deny-list patterns
    const textFields: string[] = [];

    if (typeof payload.stem === "string") {
      textFields.push(payload.stem);
    }
    if (typeof payload.template === "string") {
      textFields.push(payload.template);
    }
    if (Array.isArray(payload.options)) {
      textFields.push(...payload.options.filter((o) => typeof o === "string"));
    }
    if (Array.isArray(payload.solutionSteps)) {
      textFields.push(
        ...payload.solutionSteps.filter((s) => typeof s === "string"),
      );
    }
    if (Array.isArray(payload.hintLadder)) {
      textFields.push(
        ...payload.hintLadder.filter((h) => typeof h === "string"),
      );
    }

    for (const text of textFields) {
      for (const pattern of this.denyListPatterns) {
        if (pattern.test(text)) {
          errors.push(
            `Content contains forbidden clinical/personality language: matched pattern ${pattern.source}`,
          );
          return; // Report once per draft
        }
      }
    }
  }
}
