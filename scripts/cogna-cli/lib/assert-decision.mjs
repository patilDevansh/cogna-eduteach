import { UI_ACTIONS, LEARNING_INTENTS } from "./contracts.mjs";

const UI_ACTION_SET = new Set(UI_ACTIONS);
const LEARNING_INTENT_SET = new Set(LEARNING_INTENTS);
const LEGACY_ACTION_KEYS = ["action", "EASIER_QUESTION", "HARDER_QUESTION"];

function formatDecision(decision) {
  if (!decision) return "(null)";
  try {
    return JSON.stringify(decision, null, 2);
  } catch {
    return String(decision);
  }
}

/**
 * Assert a LearningDecision-shaped object matches contract + optional expectations.
 *
 * @param {object | null | undefined} decision
 * @param {object} [expect]
 * @param {string} [expect.uiAction]
 * @param {string} [expect.learningIntent]
 * @param {object} [expect.params] — partial parameters match (conceptId, difficulty, …)
 * @param {string} [expect.label] — context for failure messages
 */
export function assertLearningDecision(decision, expect = {}) {
  const label = expect.label ? `[${expect.label}] ` : "";

  if (!decision || typeof decision !== "object") {
    throw new Error(`${label}Expected LearningDecision object, got ${decision}`);
  }

  for (const key of LEGACY_ACTION_KEYS) {
    if (key in decision && key !== "uiAction") {
      throw new Error(`${label}Legacy action field "${key}" present — use uiAction + learningIntent`);
    }
  }

  if (!decision.uiAction) {
    throw new Error(`${label}Missing uiAction on decision:\n${formatDecision(decision)}`);
  }

  if (!UI_ACTION_SET.has(decision.uiAction)) {
    throw new Error(
      `${label}Invalid uiAction "${decision.uiAction}" — must be one of: ${UI_ACTIONS.join(", ")}`,
    );
  }

  if (decision.learningIntent && !LEARNING_INTENT_SET.has(decision.learningIntent)) {
    throw new Error(
      `${label}Invalid learningIntent "${decision.learningIntent}" — must be one of: ${LEARNING_INTENTS.join(", ")}`,
    );
  }

  if (expect.uiAction && decision.uiAction !== expect.uiAction) {
    throw new Error(
      `${label}Expected uiAction ${expect.uiAction}, got ${decision.uiAction}\n${formatDecision(decision)}`,
    );
  }

  if (expect.learningIntent && decision.learningIntent !== expect.learningIntent) {
    throw new Error(
      `${label}Expected learningIntent ${expect.learningIntent}, got ${decision.learningIntent}\n${formatDecision(decision)}`,
    );
  }

  if (expect.params) {
    for (const [key, value] of Object.entries(expect.params)) {
      const actual = decision.parameters?.[key];
      if (actual !== value) {
        throw new Error(
          `${label}parameters.${key} mismatch: expected ${JSON.stringify(value)}, got ${JSON.stringify(actual)}\n${formatDecision(decision)}`,
        );
      }
    }
  }

  return decision;
}

/**
 * Assert submit-answer response shape and decision contract.
 */
export function assertAnswerResponse(res, expect = {}) {
  if (res.status === 503) {
    throw new Error(
      `Answer submit returned 503 FAILED_RETRYABLE: ${JSON.stringify(res.body)}`,
    );
  }
  if (res.status >= 500) {
    throw new Error(`Answer submit server error HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  }
  if (res.status !== 201) {
    throw new Error(`Answer submit expected HTTP 201, got ${res.status}: ${JSON.stringify(res.body)}`);
  }

  const decision = res.body?.decision ?? res.body?.next?.decision;
  if (expect.decision) {
    assertLearningDecision(decision, { ...expect.decision, label: expect.label });
  }

  return res.body;
}
