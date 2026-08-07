#!/usr/bin/env node
/**
 * Drive COMBINED_ALGEBRA (+ optional solo) audit paths against a live API.
 * Captures selector Why, origin, hypotheses, assistance; flags known failure tags.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.API_URL || "http://localhost:3001";
const OUT_DIR = path.join(__dirname, "combined-audit-runs");
const STUDENT_ID = process.env.STUDENT_ID || `combined_audit_${Date.now()}`;

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

function inventClaims(text) {
  if (!text) return [];
  const tags = [];
  const t = text.toLowerCase();
  if (/moderate errors|many wrong|some wrong/.test(t)) tags.push("invent_after_perfect_candidate");
  if (/after (initial )?teach|after instruction/.test(t)) tags.push("after_teaching_overclaim");
  if (/option\s*\d+/.test(t)) tags.push("option_jargon");
  return tags;
}

function judge({ whyText, hypText, debug, itemKey, validity }) {
  const tags = [...inventClaims(whyText), ...inventClaims(hypText)];
  const failCount = (debug.microSkillStates || []).reduce(
    (n, s) => n + (s.independentFailureCount || 0),
    0,
  );
  const whyLower = (whyText || "").toLowerCase();
  const hypLower = (hypText || "").toLowerCase();
  if (
    failCount === 0 &&
    (/moderate errors|many wrong|likely gap/.test(whyLower) ||
      /moderate errors|many wrong|likely gap/.test(hypLower))
  ) {
    tags.push("false_gap");
  }
  if (itemKey?.startsWith("ENTRY") && /likely gap|moderate/.test(whyLower)) {
    tags.push("wrong_skill_why");
  }
  if (validity === "VALID" && /assist|help|hint/.test(whyLower) && /correct|valid/.test(whyLower)) {
    tags.push("assist_on_correct_candidate");
  }
  return { trailMatch: tags.length === 0 ? "PASS" : "FAIL", failureModeTag: tags.join(",") || null };
}

async function driveScript(caseDef) {
  const start = await api("POST", "/diagnostic-v2/sessions", {
    studentId: STUDENT_ID,
    track: caseDef.track,
  });
  const ledger = {
    caseId: caseDef.id,
    label: caseDef.label,
    track: caseDef.track,
    studentId: STUDENT_ID,
    sessionId: start.sessionId,
    opening: {
      itemKey: start.itemKey,
      equationPrompt: start.equationPrompt,
      stageId: start.stageId,
      source: "RULE",
    },
    transitions: [],
    topicEntriesSeen: [],
    aiSelectorCount: 0,
    ruleSelectorCount: 0,
    generateOriginCount: 0,
  };

  let attemptId = start.attemptId;
  let itemKey = start.itemKey;
  let previousLine = start.openingLine;
  const TOPIC_ENTRIES = new Set([
    "ENTRY_TWO_STEP",
    "ENTRY_FRAC_SIMPLE",
    "ENTRY_EXPAND_BINOMIAL",
    "ENTRY_FACTOR_EXPAND",
    "ENTRY_QUAD_STANDARD",
  ]);
  if (TOPIC_ENTRIES.has(itemKey)) ledger.topicEntriesSeen.push(itemKey);

  for (const action of caseDef.actions) {
    if (action.done) break;
    const response = action.dontKnow
      ? await api("POST", `/diagnostic-v2/sessions/${start.sessionId}/steps`, {
          attemptId,
          previousLine,
          dontKnow: true,
        })
      : await api("POST", `/diagnostic-v2/sessions/${start.sessionId}/steps`, {
          attemptId,
          previousLine,
          submittedLine: action.line,
        });

    const debug = await api("GET", `/diagnostic-v2/sessions/${start.sessionId}`);
    const sel = response.selectorDecision;
    const hyp = debug.hypotheses?.[debug.hypotheses.length - 1];
    const next = response.nextAttempt;
    const whyText = sel?.reasoning || "";
    const hypText = hyp?.reasoning || "";
    const { trailMatch, failureModeTag } = judge({
      whyText,
      hypText,
      debug,
      itemKey,
      validity: response.validity,
    });

    if (sel?.source === "AI") ledger.aiSelectorCount += 1;
    if (sel?.source === "RULE") ledger.ruleSelectorCount += 1;
    const nextOrigin =
      debug.items?.find((i) => i.itemKey === next?.itemKey)?.origin ?? null;
    if (nextOrigin === "TEMPLATE_RENDERED" || nextOrigin === "AI_AUTHORED") {
      ledger.generateOriginCount += 1;
    }
    if (sel?.source === "RULE" && response.itemComplete && next) {
      if (!/Rule sequence/i.test(whyText) && whyText.length === 0) {
        // silent rule fallback suspicion
      }
    }

    ledger.transitions.push({
      fromItemKey: itemKey,
      studentAction: action.tag,
      submittedLine: action.line || null,
      dontKnow: !!action.dontKnow,
      validity: response.validity ?? null,
      firstInvalidActionCode: response.firstInvalidActionCode ?? null,
      assistanceOffered: response.assistanceOffered ?? null,
      assistanceMessage: response.assistanceMessage ?? null,
      itemComplete: !!response.itemComplete,
      sessionStatus: response.sessionStatus,
      selectorDecision: sel || null,
      nextItemKey: next?.itemKey ?? null,
      nextOrigin,
      hypothesis: hyp
        ? {
            source: hyp.source,
            label: hyp.hypothesisLabel,
            reasoning: hyp.reasoning,
            childFacingSummary: hyp.childFacingSummary,
            microSkillId: hyp.microSkillId,
          }
        : null,
      trailMatch,
      failureModeTag,
    });

    if (response.outcome === "SUBMITTED" && response.validity === "VALID" && action.line) {
      previousLine = action.line;
    }
    if (next) {
      attemptId = next.attemptId;
      itemKey = next.itemKey;
      previousLine = next.openingLine;
      if (TOPIC_ENTRIES.has(itemKey) && !ledger.topicEntriesSeen.includes(itemKey)) {
        ledger.topicEntriesSeen.push(itemKey);
      }
    }
    if (response.sessionStatus === "COMPLETED") break;
  }

  ledger.summary = await api("GET", `/diagnostic-v2/sessions/${start.sessionId}/summary`);
  ledger.finalDebug = await api("GET", `/diagnostic-v2/sessions/${start.sessionId}`);
  return ledger;
}

const COMBINED_ALL_CORRECT = [
  { tag: "ok", line: "3x = 15" },
  { tag: "ok", line: "x = 5" },
  { tag: "ok", line: "2x - 7 = 9" },
  { tag: "ok", line: "2x = 16" },
  { tag: "ok", line: "x = 8" },
  { tag: "ok", line: "-2x + 10 + 3 = 11" },
  { tag: "ok", line: "-2x + 13 = 11" },
  { tag: "ok", line: "-2x = -2" },
  { tag: "ok", line: "x = 1" },
  { tag: "ok", line: "-4z + 8 + 3 = 19" },
  { tag: "ok", line: "-4z + 11 = 19" },
  { tag: "ok", line: "-4z = 8" },
  { tag: "ok", line: "z = -2" },
  // fractions
  { tag: "ok", line: "x/2 = 4" },
  { tag: "ok", line: "x = 8" },
  { tag: "ok", line: "3(x + 1) = 2(x - 1) + 6" },
  { tag: "ok", line: "3x + 3 = 2x - 2 + 6" },
  { tag: "ok", line: "3x + 3 = 2x + 4" },
  { tag: "ok", line: "x + 3 = 4" },
  { tag: "ok", line: "x = 1" },
  { tag: "ok", line: "2(z - 2) = (z + 1) + 6" },
  { tag: "ok", line: "2z - 4 = z + 1 + 6" },
  { tag: "ok", line: "2z - 4 = z + 7" },
  { tag: "ok", line: "z - 4 = 7" },
  { tag: "ok", line: "z = 11" },
  // identities
  { tag: "ok", line: "x^2 + 5x + 6" },
  { tag: "ok", line: "x^2 - 9" },
  { tag: "ok", line: "(z + 4)(z - 4)" },
  // factor
  { tag: "ok", line: "x^2 + 5x + 6" },
  { tag: "ok", line: "(x + 2)(x + 3)" },
  { tag: "ok", line: "(2x + 1)(x - 3)" },
  // quad
  { tag: "ok", line: "x^2 + 5x + 6 = 0" },
  { tag: "ok", line: "x = -2 or x = 3" },
  { tag: "ok", line: "x = 3 or x = -2" },
];

const CASES = [
  {
    id: "01_combined_all_correct",
    label: "Combined all-correct through five topics",
    track: "COMBINED_ALGEBRA",
    actions: COMBINED_ALL_CORRECT,
  },
  {
    id: "02_combined_arun_then_continue",
    label: "Combined: NegDist Arun error then correct transfer into fractions",
    track: "COMBINED_ALGEBRA",
    actions: [
      { tag: "ok", line: "3x = 15" },
      { tag: "ok", line: "x = 5" },
      { tag: "ok", line: "2x - 7 = 9" },
      { tag: "ok", line: "2x = 16" },
      { tag: "ok", line: "x = 8" },
      { tag: "arun", line: "-2x - 10 + 3 = 11" },
      { tag: "arun2", line: "-3y - 12" },
      // after RULE_PROMPT, transfer correct
      { tag: "ok", line: "-4z + 8 + 3 = 19" },
      { tag: "ok", line: "-4z + 11 = 19" },
      { tag: "ok", line: "-4z = 8" },
      { tag: "ok", line: "z = -2" },
      // enter fractions entry
      { tag: "ok", line: "x/2 = 4" },
      { tag: "ok", line: "x = 8" },
      { tag: "done", done: true },
    ],
  },
  {
    id: "03_combined_decline_on_main",
    label: "Combined: decline twice on NegDist MAIN",
    track: "COMBINED_ALGEBRA",
    actions: [
      { tag: "ok", line: "3x = 15" },
      { tag: "ok", line: "x = 5" },
      { tag: "ok", line: "2x - 7 = 9" },
      { tag: "ok", line: "2x = 16" },
      { tag: "ok", line: "x = 8" },
      { tag: "decline", dontKnow: true },
      { tag: "decline", dontKnow: true },
      { tag: "done", done: true },
    ],
  },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`API not reachable at ${API}. Start the combined-testing API first.`);
    process.exit(1);
  }

  const results = [];
  for (const c of CASES) {
    process.stdout.write(`Running ${c.id}… `);
    try {
      const ledger = await driveScript(c);
      const out = path.join(OUT_DIR, `${c.id}.json`);
      fs.writeFileSync(out, JSON.stringify(ledger, null, 2));
      const fails = ledger.transitions.filter((t) => t.trailMatch === "FAIL").length;
      console.log(
        `ok topics=${ledger.topicEntriesSeen.length} aiSel=${ledger.aiSelectorCount} ruleSel=${ledger.ruleSelectorCount} trailFails=${fails}`,
      );
      results.push(ledger);
    } catch (err) {
      console.log(`ERROR ${err instanceof Error ? err.message : err}`);
      results.push({ caseId: c.id, error: String(err) });
    }
  }

  const md = [];
  md.push("# Combined algebra audit");
  md.push("");
  md.push(`API: \`${API}\` · student: \`${STUDENT_ID}\` · ${new Date().toISOString()}`);
  md.push("");
  md.push("| Case | Topics entered | AI selector | RULE selector | GENERATE/AUTHOR next | Trail fails | Summary snippet |");
  md.push("|---|---|---|---|---|---|---|");
  for (const r of results) {
    if (r.error) {
      md.push(`| ${r.caseId} | — | — | — | — | ERROR | ${r.error.slice(0, 80)} |`);
      continue;
    }
    const fails = r.transitions.filter((t) => t.trailMatch === "FAIL").length;
    const snippet = (r.summary?.childFacingSummary || "").slice(0, 60).replace(/\|/g, "/");
    md.push(
      `| ${r.caseId} | ${r.topicEntriesSeen.length} (${r.topicEntriesSeen.join(", ")}) | ${r.aiSelectorCount} | ${r.ruleSelectorCount} | ${r.generateOriginCount} | ${fails} | ${snippet}… |`,
    );
  }
  md.push("");
  md.push("## AI pick / explain trust notes");
  md.push("");
  md.push("- Opening item is always RULE (fixed entry).");
  md.push("- `selectorDecision.source=AI` means GENERATE+SERVE served; RULE may still be timeout/fallback.");
  md.push("- Trail fails reuse known tags: `false_gap`, `invent_after_perfect_candidate`, `after_teaching_overclaim`, `option_jargon`, `wrong_skill_why`.");
  md.push("- Parent summary present on API as `parentFacingSummary` even when UI shows child only.");
  md.push("");
  md.push("## Per-case failure tags");
  md.push("");
  for (const r of results) {
    if (r.error) continue;
    const tagged = r.transitions.filter((t) => t.failureModeTag);
    md.push(`### ${r.caseId}`);
    if (tagged.length === 0) md.push("- No automated failure tags.");
    else {
      for (const t of tagged) {
        md.push(
          `- \`${t.fromItemKey}\` → \`${t.nextItemKey ?? "—"}\`: **${t.failureModeTag}** — Why: ${(t.selectorDecision?.reasoning || "").slice(0, 120)}`,
        );
      }
    }
    md.push("");
    if (r.summary) {
      md.push(`- Child summary: ${r.summary.childFacingSummary}`);
      if (r.summary.parentFacingSummary) {
        md.push(`- Parent summary: ${r.summary.parentFacingSummary}`);
      }
    }
    md.push("");
  }

  const mdPath = path.join(__dirname, "COMBINED_AUDIT.md");
  fs.writeFileSync(mdPath, md.join("\n"));
  console.log(`Wrote ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
