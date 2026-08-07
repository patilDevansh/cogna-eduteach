#!/usr/bin/env node
/**
 * Drive the 12-case Phase B UI/API audit against a live API.
 * Writes JSON trails + a markdown summary for UI_FRACTION_AUDIT.md.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.API_URL || "http://localhost:3001";
const OUT_DIR = path.join(__dirname, "audit-runs");
const STUDENT_ID = process.env.STUDENT_ID || "dev_student_001";

async function api(method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function startSession(track) {
  return api("POST", "/diagnostic-v2/sessions", {
    studentId: STUDENT_ID,
    ...(track ? { track } : {}),
  });
}

async function submitStep(sessionId, payload) {
  return api("POST", `/diagnostic-v2/sessions/${sessionId}/steps`, payload);
}

async function getDebug(sessionId) {
  return api("GET", `/diagnostic-v2/sessions/${sessionId}`);
}

function inventClaims(text) {
  if (!text) return [];
  const tags = [];
  const t = text.toLowerCase();
  if (/moderate errors|many wrong|some wrong/.test(t)) tags.push("moderate_errors");
  if (/likely gap/.test(t) && /never|not yet|untested|before testing/.test(t) === false) {
    /* checked against counts separately */
  }
  if (/after (initial )?teach|after instruction/.test(t)) tags.push("after_teaching_overclaim");
  if (/option\s*0/.test(t)) tags.push("option_0_jargon");
  return tags;
}

function judgeTrailMatch({ whyText, hypText, debug, finishedItemKey }) {
  const tags = [...inventClaims(whyText), ...inventClaims(hypText)];
  const clearState = debug.microSkillStates?.find((s) => s.microSkillId === "LIN_CLEAR_FRACTIONS");
  const distState = debug.microSkillStates?.find((s) => s.microSkillId === "LIN_DISTRIBUTE_NEG");
  const failures =
    (clearState?.independentFailureCount ?? 0) + (distState?.independentFailureCount ?? 0);
  const whyLower = (whyText || "").toLowerCase();
  if (
    failures === 0 &&
    (/moderate errors|many wrong|some wrong|likely gap/.test(whyLower) ||
      /moderate errors|many wrong|likely gap/.test((hypText || "").toLowerCase()))
  ) {
    tags.push("false_gap");
  }
  if (
    finishedItemKey?.startsWith("ENTRY") &&
    /lin_distribute_neg|lin_clear_fractions/.test(whyLower) &&
    /likely gap|moderate/.test(whyLower)
  ) {
    tags.push("false_gap");
  }
  const trailMatch = tags.length === 0 ? "PASS" : "FAIL";
  return { trailMatch, failureModeTag: tags.join(",") || null };
}

async function driveScript(caseDef) {
  const start = await startSession(caseDef.track);
  const ledger = {
    caseId: caseDef.id,
    label: caseDef.label,
    track: caseDef.track || "NEGATIVE_DISTRIBUTION",
    sessionId: start.sessionId,
    studentId: STUDENT_ID,
    opening: {
      itemKey: start.itemKey,
      equationPrompt: start.equationPrompt,
      stageId: start.stageId,
      source: "RULE",
      whyRuleNotAi: "opening item is fixed entry sequence",
    },
    transitions: [],
    notes: [],
  };

  let attemptId = start.attemptId;
  let itemKey = start.itemKey;
  let previousLine = start.openingLine;
  let guard = 0;
  let scriptIdx = 0;
  const actions = caseDef.actions;

  while (guard++ < 50 && scriptIdx < actions.length) {
    const action = actions[scriptIdx];
    if (action.waitMs) await sleep(action.waitMs);

    if (action.untilItem && itemKey !== action.untilItem && !action.force) {
      // Skip until we land on the expected item — or record mismatch
      if (action.requireItem && itemKey !== action.requireItem) {
        ledger.notes.push(`expected ${action.requireItem}, on ${itemKey}`);
      }
    }

    let response;
    if (action.dontKnow) {
      response = await submitStep(start.sessionId, {
        attemptId,
        previousLine,
        dontKnow: true,
      });
    } else {
      response = await submitStep(start.sessionId, {
        attemptId,
        previousLine,
        submittedLine: action.line,
      });
    }

    const debug = await getDebug(start.sessionId);
    const sel = response.selectorDecision;
    const hyp = debug.hypotheses?.[debug.hypotheses.length - 1];
    const next = response.nextAttempt;
    const whyText = sel?.reasoning || "";
    const hypText = hyp?.reasoning || "";
    const { trailMatch, failureModeTag } = judgeTrailMatch({
      whyText,
      hypText,
      debug,
      finishedItemKey: itemKey,
    });

    let whyRuleNotAi = null;
    let whyAiNotRule = null;
    if (sel?.source === "RULE") {
      whyRuleNotAi = /Rule sequence/i.test(whyText)
        ? "selector fell back to rule sequence (timeout/reject/flag/shadow)"
        : "selectorDecision.source=RULE";
    } else if (sel?.source === "AI") {
      whyAiNotRule =
        "AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI";
    } else if (response.itemComplete && !sel) {
      whyRuleNotAi = "item complete but no selectorDecision (session end or no next item)";
    }

    const transition = {
      fromItemKey: itemKey,
      studentAction: action.tag,
      submittedLine: action.line || null,
      dontKnow: !!action.dontKnow,
      outcome: response.outcome,
      validity: response.validity ?? null,
      verificationSource: response.verificationSource ?? null,
      firstInvalidActionCode: response.firstInvalidActionCode ?? null,
      firstInvalidActionDescription: response.firstInvalidActionDescription ?? null,
      assistanceOffered: response.assistanceOffered ?? null,
      itemComplete: !!response.itemComplete,
      selectorDecision: sel || null,
      nextItemKey: next?.itemKey ?? null,
      nextEquationPrompt: next?.equationPrompt ?? null,
      nextOrigin: debug.items?.find((i) => i.itemKey === next?.itemKey)?.origin ?? null,
      hypothesis: hyp
        ? {
            source: hyp.source,
            label: hyp.hypothesisLabel,
            confidence: hyp.confidence,
            reasoning: hyp.reasoning,
            childFacingSummary: hyp.childFacingSummary,
            microSkillId: hyp.microSkillId,
          }
        : null,
      microSkillStates: (debug.microSkillStates || []).map((s) => ({
        microSkillId: s.microSkillId,
        status: s.status,
        independentSuccessCount: s.independentSuccessCount,
        independentFailureCount: s.independentFailureCount,
      })),
      trailMatch,
      failureModeTag,
      whyRuleNotAi,
      whyAiNotRule,
      stageHistoryTail: (debug.stageHistory || []).slice(-3),
    };
    ledger.transitions.push(transition);

    if (response.outcome === "SUBMITTED" && response.validity === "VALID" && action.line) {
      previousLine = action.line;
    }
    if (next) {
      attemptId = next.attemptId;
      itemKey = next.itemKey;
      previousLine = next.openingLine;
    }
    if (response.sessionComplete) break;
    scriptIdx++;
  }

  ledger.finalDebug = await getDebug(start.sessionId);
  return ledger;
}

const ENTRY_OK = [
  { tag: "correct", line: "x/2 = 4" },
  { tag: "correct", line: "x = 8" },
];

const CASES = [
  {
    id: "01_frac_perfect_short",
    label: "Frac perfect short — entry only then stop after next Why",
    track: "FRACTION_LINEAR",
    actions: [...ENTRY_OK, { tag: "stop", done: true }],
  },
  {
    id: "02_frac_all_correct",
    label: "Frac all-correct path through MAIN clear",
    track: "FRACTION_LINEAR",
    actions: [
      ...ENTRY_OK,
      { tag: "correct_clear", line: "3(x + 1) = 2(x - 1) + 6" },
      { tag: "correct", line: "3x + 3 = 2x - 2 + 6" },
      { tag: "correct", line: "3x + 3 = 2x + 4" },
      { tag: "correct", line: "x + 3 = 4" },
      { tag: "correct", line: "x = 1" },
    ],
  },
  {
    id: "03_wrong_lcd_twice",
    label: "Wrong common multiple ×2 → contrast/pattern",
    track: "FRACTION_LINEAR",
    actions: [
      ...ENTRY_OK,
      { tag: "wrong_lcd", line: "2(x + 1) = 3(x - 1) + 6" },
      { tag: "wrong_lcd", line: "2(x + 1) = 3(x - 1) + 6" },
    ],
  },
  {
    id: "04_dropped_term",
    label: "Dropped term when clearing",
    track: "FRACTION_LINEAR",
    actions: [
      ...ENTRY_OK,
      { tag: "dropped_term", line: "3(x + 1) = 2(x - 1)" },
    ],
  },
  {
    id: "05_decline_twice",
    label: "Decline ×2 on MAIN",
    track: "FRACTION_LINEAR",
    actions: [
      ...ENTRY_OK,
      { tag: "decline", dontKnow: true },
      { tag: "decline", dontKnow: true },
    ],
  },
  {
    id: "06_gibberish",
    label: "Gibberish / PARSE_FAILED on MAIN",
    track: "FRACTION_LINEAR",
    actions: [
      ...ENTRY_OK,
      { tag: "gibberish", line: "asdf qwerty !!!" },
    ],
  },
  {
    id: "07_selector_rule_only",
    label: "AI selector GENERATE off (env note — see summary)",
    track: "FRACTION_LINEAR",
    // Same path as all-correct; judgment notes whether source stayed RULE
    actions: [
      ...ENTRY_OK,
      { tag: "correct_clear", line: "3(x + 1) = 2(x - 1) + 6" },
    ],
    expectAllRule: true,
    note: "Requires AI_DIAGNOSTIC_V2_SELECTOR_GENERATE=false for hard RULE-only; with flags on, record actual sources.",
  },
  {
    id: "08_ai_on_path",
    label: "Normal AI-on path — capture at least one AI next item",
    track: "FRACTION_LINEAR",
    actions: [
      ...ENTRY_OK,
      { tag: "wrong_lcd", line: "2(x + 1) = 3(x - 1) + 6" },
      { tag: "correct_clear", line: "3(x + 1) = 2(x - 1) + 6" },
      { tag: "correct", line: "3x + 3 = 2x - 2 + 6" },
      { tag: "correct", line: "3x + 3 = 2x + 4" },
      { tag: "correct", line: "x + 3 = 4" },
      { tag: "correct", line: "x = 1" },
    ],
  },
  {
    id: "09_negdist_perfect_entry",
    label: "NegDist perfect entry — false-gap Why check",
    track: "NEGATIVE_DISTRIBUTION",
    actions: [
      { tag: "correct", line: "3x + 5 = 20" },
      { tag: "correct", line: "3x = 15" },
      { tag: "correct", line: "x = 5" },
    ],
  },
  {
    id: "10_negdist_arun",
    label: "NegDist Arun-like sign product wrong ×2",
    track: "NEGATIVE_DISTRIBUTION",
    actions: [
      { tag: "correct", line: "3x + 5 = 20" },
      { tag: "correct", line: "3x = 15" },
      { tag: "correct", line: "x = 5" },
      { tag: "correct", line: "4x - 2x - 7 = 9" },
      { tag: "correct", line: "2x - 7 = 9" },
      { tag: "correct", line: "2x = 16" },
      { tag: "correct", line: "x = 8" },
      { tag: "wrong_sign", line: "-2x - 10 + 3 = 11" },
      { tag: "wrong_sign", line: "-2x - 10 + 3 = 11" },
    ],
  },
  {
    id: "11_assist_on_correct",
    label: "Assist-on-correct hunt after wrong then correct contrast clear",
    track: "FRACTION_LINEAR",
    actions: [
      ...ENTRY_OK,
      { tag: "wrong_lcd", line: "2(x + 1) = 3(x - 1) + 6" },
      { tag: "wrong_lcd", line: "2(x + 1) = 3(x - 1) + 6" },
      // Contrast bare: (y+2)/4 = 3 → clear correctly then finish
      { tag: "correct_clear", line: "y + 2 = 12" },
      { tag: "correct", line: "y = 10" },
    ],
  },
  {
    id: "12_timeout_observe",
    label: "Observe slow selector (no artificial delay) — note RULE fallback if any",
    track: "FRACTION_LINEAR",
    actions: [
      ...ENTRY_OK,
      { tag: "correct_clear", line: "3(x + 1) = 2(x - 1) + 6" },
    ],
  },
];

function toMarkdown(results) {
  const lines = [];
  lines.push("# UI Fraction / Diagnostic-v2 Audit");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Student: \`${STUDENT_ID}\` · API: \`${API}\``);
  lines.push("");
  lines.push("## Judgment rules");
  lines.push("");
  lines.push("- Opening item always RULE.");
  lines.push("- AI agreeing with the rule still shows AI.");
  lines.push("- Score Why/hypothesis on evidence claims vs microSkillStates, not only next itemKey.");
  lines.push("- Tags: `false_gap`, `moderate_errors`, `after_teaching_overclaim`, `option_0_jargon`.");
  lines.push("");
  lines.push("## Case summary");
  lines.push("");
  lines.push("| Case | Track | Opening | AI next? | trailMatch fails | Notes |");
  lines.push("|---|---|---|---|---|---|");

  for (const r of results) {
    const aiNext = r.transitions.some((t) => t.selectorDecision?.source === "AI");
    const fails = r.transitions.filter((t) => t.trailMatch === "FAIL").length;
    const tags = [
      ...new Set(r.transitions.map((t) => t.failureModeTag).filter(Boolean)),
    ].join("; ");
    lines.push(
      `| ${r.caseId} | ${r.track} | ${r.opening.itemKey} | ${aiNext ? "yes" : "no"} | ${fails} | ${tags || r.notes.join("; ") || "—"} |`,
    );
  }

  lines.push("");
  lines.push("## Per-case transitions");
  lines.push("");

  for (const r of results) {
    lines.push(`### ${r.caseId} — ${r.label}`);
    lines.push("");
    lines.push(
      `- Opening: \`${r.opening.itemKey}\` · source **RULE** · ${r.opening.whyRuleNotAi}`,
    );
    lines.push(`- Session: \`${r.sessionId}\``);
    if (r.notes.length) lines.push(`- Notes: ${r.notes.join("; ")}`);
    lines.push("");
    for (const [i, t] of r.transitions.entries()) {
      lines.push(`#### Transition ${i + 1}: ${t.fromItemKey} ← ${t.studentAction}`);
      lines.push("");
      lines.push(
        `- validity: \`${t.validity}\` · verification: \`${t.verificationSource}\` · code: \`${t.firstInvalidActionCode}\``,
      );
      if (t.firstInvalidActionDescription) {
        lines.push(`- firstInvalid: ${t.firstInvalidActionDescription}`);
      }
      lines.push(`- assistance: \`${t.assistanceOffered}\` · itemComplete: ${t.itemComplete}`);
      if (t.selectorDecision) {
        lines.push(
          `- selector: **${t.selectorDecision.source}** → next \`${t.nextItemKey}\` (origin \`${t.nextOrigin}\`)`,
        );
        lines.push(`- Why: ${t.selectorDecision.reasoning || "(none)"}`);
        if (t.whyRuleNotAi) lines.push(`- why RULE not AI: ${t.whyRuleNotAi}`);
        if (t.whyAiNotRule) lines.push(`- why AI not RULE: ${t.whyAiNotRule}`);
      } else {
        lines.push("- selector: (none)");
      }
      if (t.hypothesis) {
        lines.push(
          `- What we think: **${t.hypothesis.source}** / \`${t.hypothesis.label}\` — ${t.hypothesis.reasoning}`,
        );
      } else {
        lines.push("- What we think: (none)");
      }
      const clear = t.microSkillStates.find((s) => s.microSkillId === "LIN_CLEAR_FRACTIONS");
      const dist = t.microSkillStates.find((s) => s.microSkillId === "LIN_DISTRIBUTE_NEG");
      lines.push(
        `- states: CLEAR fail=${clear?.independentFailureCount ?? 0} ok=${clear?.independentSuccessCount ?? 0}; DIST fail=${dist?.independentFailureCount ?? 0} ok=${dist?.independentSuccessCount ?? 0}`,
      );
      lines.push(
        `- trailMatch: **${t.trailMatch}**${t.failureModeTag ? ` · tags: \`${t.failureModeTag}\`` : ""}`,
      );
      lines.push("");
    }
  }

  lines.push("## Prioritized bugs");
  lines.push("");
  const bugCounts = new Map();
  for (const r of results) {
    for (const t of r.transitions) {
      if (t.trailMatch !== "FAIL") continue;
      const key = t.failureModeTag || "unspecified";
      bugCounts.set(key, (bugCounts.get(key) || 0) + 1);
    }
  }
  if (bugCounts.size === 0) {
    lines.push("- No automated trailMatch failures. Manual review still recommended for assist-on-correct.");
  } else {
    for (const [k, n] of [...bugCounts.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`1. \`${k}\` — ${n} transition(s)`);
    }
  }
  lines.push("");
  lines.push("## Case 07 note");
  lines.push("");
  lines.push(
    "Hard RULE-only requires temporarily setting `AI_DIAGNOSTIC_V2_SELECTOR_GENERATE=false`. This run uses live env flags; sources observed are recorded as-is.",
  );
  lines.push("");
  return lines.join("\n");
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = [];
  for (const c of CASES) {
    process.stderr.write(`Running ${c.id}...\n`);
    try {
      // Filter out stop markers
      const actions = c.actions.filter((a) => !a.done);
      const ledger = await driveScript({ ...c, actions });
      results.push(ledger);
      fs.writeFileSync(
        path.join(OUT_DIR, `${c.id}.json`),
        JSON.stringify(ledger, null, 2),
      );
    } catch (err) {
      process.stderr.write(`FAIL ${c.id}: ${err.message}\n`);
      results.push({
        caseId: c.id,
        label: c.label,
        track: c.track || "NEGATIVE_DISTRIBUTION",
        opening: { itemKey: "?", whyRuleNotAi: "session failed to start" },
        transitions: [],
        notes: [String(err.message)],
        sessionId: null,
      });
    }
  }
  const md = toMarkdown(results);
  const mdPath = path.join(__dirname, "UI_FRACTION_AUDIT.md");
  fs.writeFileSync(mdPath, md);
  process.stderr.write(`Wrote ${mdPath}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
