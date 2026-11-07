#!/usr/bin/env node
/**
 * Scores every run in a folder against the frozen protocol (lotus-test-records/eval-2026-11-07/PROTOCOL.md).
 *   node --import tsx scripts/lotus-eval/score.ts <RUNS_DIR> <OUT_DIR>
 * Writes scorecard.json (every run, every measure) and SCORECARD.md (per condition, against the pass bars).
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FACTORISATION_SKILLS, dependsOnTransitively, skillsUsedBy } from "../../src/lotus/lotus-factorisation-catalogue";
import type { Learner } from "./learners";

type State = "CONFIRMED" | "SUSPECTED" | "SECURE" | "OTHER";
const SKILLS = FACTORISATION_SKILLS.map((s) => s.id);
const NAME = new Map(FACTORISATION_SKILLS.map((s) => [s.id, s.name]));
const below = (a: string, b: string) => a !== b && dependsOnTransitively(a, b); // a is built on b

function truth(l: Learner) {
  const gaps = Object.keys(l.gaps);
  const roots = gaps.filter((g) => !gaps.some((o) => below(g, o)));
  const knock = SKILLS.filter((s) => !gaps.includes(s) && gaps.some((g) => below(s, g)));
  const shaky = Object.keys(l.shaky);
  const linked = gaps.some((g) => gaps.some((o) => below(g, o)));
  return { gaps, roots, knock, shaky, linked };
}

function startFromText(text: string | undefined): string | null {
  const m = text?.match(/Start with (.+?)\./i);
  if (!m) return null;
  const said = m[1]!.toLowerCase();
  const hit = [...NAME.entries()].filter(([, n]) => said.startsWith(n.toLowerCase())).sort((a, b) => b[1].length - a[1].length)[0];
  return hit?.[0] ?? null;
}

interface RunScore {
  file: string; learner: string; group: string; condition: string; repeat: number; answered: number;
  start: string | null; startIsRoot: boolean | null; startIsGap: boolean | null;
  invented: string[]; knockOnConfirmed: string[];
  rootsFound: number; roots: number; gapsFound: number; gaps: number; missedGaps: string[];
  secureReported: number; secureRight: number; gapCalledSecure: string[];
  shakyAsked: number; shakyKeptSeparate: number;
  linked: boolean; orderRight: boolean | null;
  singleEvidenceConfirmed: string[] | null; unexplainedConfirmed: string[] | null;
  untestedCalledSecure: string[] | null; notAskedLines: number | null;
  /** Bar 13: questions the report cites behind each reported weakness, and how many truly show a problem. */
  cited: number | null; citedReal: number | null; weaknessesWithoutCitation: string[] | null; badCitations: string[] | null;
  outcome: string | null;
}

function scoreStates(file: string, run: Record<string, any>, condition: string, states: Map<string, State>, start: string | null, withEvidence: boolean): RunScore {
  const l = run.learner as Learner;
  const t = truth(l);
  const asked = new Set<string>();
  for (const turn of run.turns ?? []) if (turn.skillId) for (const s of skillsUsedBy({ skillId: turn.skillId, taggedSkills: turn.taggedSkills ?? [], stepSkills: turn.stepSkills ?? [] })) asked.add(s);
  const is = (s: string, ...xs: State[]) => xs.includes(states.get(s) ?? "OTHER");
  const confirmed = SKILLS.filter((s) => is(s, "CONFIRMED"));
  const secure = SKILLS.filter((s) => is(s, "SECURE"));
  const trulySecure = (s: string) => !t.gaps.includes(s) && !t.knock.includes(s) && !t.shaky.includes(s);
  const audits: any[] = run.cogna?.audits ?? [];
  const negatives = (s: string) => new Set(audits.flatMap((a, i) => (a.skillEvidence ?? []).filter((e: any) => e.skillId === s && !e.hedge && ["MISTAKE", "UNFINISHED", "DID_NOT_KNOW"].includes(e.kind)).map(() => i))).size;
  const summaries: any[] = run.cogna?.finalReport?.skills ?? [];
  const uncertain: string[] = run.cogna?.finalReport?.uncertainAreas ?? [];
  return {
    file, learner: l.id, group: l.group, condition, repeat: run.repeat, answered: (run.ledger ?? []).length,
    start, startIsRoot: t.gaps.length ? (start ? t.roots.includes(start) : false) : null, startIsGap: t.gaps.length ? (start ? t.gaps.includes(start) : false) : null,
    invented: confirmed.filter((s) => !t.gaps.includes(s) && !t.knock.includes(s) && !t.shaky.includes(s)),
    knockOnConfirmed: confirmed.filter((s) => t.knock.includes(s)),
    rootsFound: t.roots.filter((s) => is(s, "CONFIRMED", "SUSPECTED")).length, roots: t.roots.length,
    gapsFound: t.gaps.filter((s) => is(s, "CONFIRMED", "SUSPECTED")).length, gaps: t.gaps.length,
    missedGaps: t.gaps.filter((s) => !is(s, "CONFIRMED", "SUSPECTED")),
    secureReported: secure.length, secureRight: secure.filter(trulySecure).length, gapCalledSecure: secure.filter((s) => t.gaps.includes(s)),
    shakyAsked: t.shaky.filter((s) => asked.has(s)).length, shakyKeptSeparate: t.shaky.filter((s) => asked.has(s) && !is(s, "SECURE", "CONFIRMED")).length,
    linked: l.group === "SEVERAL" && t.linked, orderRight: l.group === "SEVERAL" && t.linked ? (start ? t.roots.includes(start) : false) : null,
    singleEvidenceConfirmed: withEvidence ? confirmed.filter((s) => negatives(s) < 2) : null,
    unexplainedConfirmed: withEvidence ? confirmed.filter((s) => !(summaries.find((x) => x.skillId === s)?.evidence ?? []).some((e: string) => /Q\d+/.test(e))) : null,
    untestedCalledSecure: withEvidence ? secure.filter((s) => !asked.has(s)) : null,
    notAskedLines: withEvidence ? uncertain.filter((u) => /not asked|no question in this test|never checked/i.test(u)).length : null,
    ...citations(run, summaries, withEvidence),
    outcome: run.cogna?.finalReport?.outcome ?? null,
  };
}

/**
 * Bar 13. For every skill the report calls CONFIRMED or SUSPECTED, the question numbers its evidence lines cite.
 * A citation is real when, on that question, the learner truly went wrong, doubted, or said they didn't know
 * (what the simulator did, which Lotus never saw). A weakness citing no question at all is listed.
 */
function citations(run: Record<string, any>, summaries: any[], withEvidence: boolean) {
  if (!withEvidence) return { cited: null, citedReal: null, weaknessesWithoutCitation: null, badCitations: null };
  const intents = new Map<number, string>((run.turns ?? []).filter((t: any) => t.intent).map((t: any) => [t.turn, t.intent.kind]));
  let cited = 0, real = 0;
  const none: string[] = [], bad: string[] = [];
  for (const s of summaries.filter((x) => x.state === "CONFIRMED" || x.state === "SUSPECTED")) {
    // Only lines that claim a problem: "Q6: right…" lines are context the report gives, not evidence of the weakness.
    const claims = (s.evidence ?? []).filter((line: string) => !/^Q\d+: right\b/i.test(line.trim()));
    const qs = [...new Set((claims.join(" ").match(/Q(\d+)/g) ?? []).map((q: string) => Number(q.slice(1))))] as number[];
    if (!qs.length) { none.push(s.skillId); continue; }
    for (const q of qs) {
      cited++;
      const kind = intents.get(q);
      if (kind && kind !== "RIGHT") real++; else bad.push(`${s.skillId}@Q${q}:${kind ?? "not asked"}`);
    }
  }
  return { cited, citedReal: real, weaknessesWithoutCitation: none, badCitations: bad };
}

function cognaStates(run: Record<string, any>): Map<string, State> {
  const m = new Map<string, State>();
  for (const s of run.cogna?.finalReport?.skills ?? []) m.set(s.skillId, s.state === "CONFIRMED" ? "CONFIRMED" : s.state === "SUSPECTED" ? "SUSPECTED" : s.state === "SECURE" ? "SECURE" : "OTHER");
  return m;
}

function aiStates(run: Record<string, any>): Map<string, State> {
  const m = new Map<string, State>();
  for (const [s, v] of Object.entries<string>(run.aiRead?.skills ?? {})) m.set(s, v === "GAP" ? "CONFIRMED" : v === "SHAKY" ? "SUSPECTED" : v === "SECURE" ? "SECURE" : "OTHER");
  return m;
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function summarise(cond: string, rs: RunScore[]) {
  const withGaps = rs.filter((r) => r.gaps > 0);
  const capable = rs.filter((r) => r.group === "CAPABLE");
  const linked = rs.filter((r) => r.orderRight !== null);
  const ev = rs.filter((r) => r.singleEvidenceConfirmed !== null);
  // Bar 4: pairwise agreement of the starting point across repeats of the same learner.
  const byLearner = new Map<string, (string | null)[]>();
  for (const r of rs) byLearner.set(r.learner, [...(byLearner.get(r.learner) ?? []), r.start]);
  let pairs = 0, agree = 0;
  for (const starts of byLearner.values()) for (let i = 0; i < starts.length; i++) for (let j = i + 1; j < starts.length; j++) { pairs++; if (starts[i] === starts[j]) agree++; }
  return {
    condition: cond, runs: rs.length,
    b1_startRight: [withGaps.filter((r) => r.startIsRoot).length, withGaps.length],
    b1_startIsAGap: [withGaps.filter((r) => r.startIsGap).length, withGaps.length],
    b2_capableWithInvented: [capable.filter((r) => r.invented.length).length, capable.length],
    b2_inventedPerStruggling: withGaps.length ? sum(withGaps.map((r) => r.invented.length)) / withGaps.length : 0,
    knockOnPerStruggling: withGaps.length ? sum(withGaps.map((r) => r.knockOnConfirmed.length)) / withGaps.length : 0,
    b3_rootsFound: [sum(withGaps.map((r) => r.rootsFound)), sum(withGaps.map((r) => r.roots))],
    b4_agreement: [agree, pairs],
    b5_singleEvidenceBreaks: ev.length ? sum(ev.map((r) => r.singleEvidenceConfirmed!.length)) : null,
    b6_avgQuestionsWithGaps: withGaps.length ? sum(withGaps.map((r) => r.answered)) / withGaps.length : 0,
    b7_gapsFound: [sum(withGaps.map((r) => r.gapsFound)), sum(withGaps.map((r) => r.gaps))],
    b8_secureRight: [sum(rs.map((r) => r.secureRight)), sum(rs.map((r) => r.secureReported))],
    b8_gapsCalledSecure: sum(rs.map((r) => r.gapCalledSecure.length)),
    b9_shakySeparate: [sum(rs.map((r) => r.shakyKeptSeparate)), sum(rs.map((r) => r.shakyAsked))],
    b10_orderRight: [linked.filter((r) => r.orderRight).length, linked.length],
    b11_unexplained: ev.length ? sum(ev.map((r) => r.unexplainedConfirmed!.length)) : null,
    b12_untestedSecure: ev.length ? sum(ev.map((r) => r.untestedCalledSecure!.length)) : null,
    b12_avgNotAskedLines: ev.length ? sum(ev.map((r) => r.notAskedLines!)) / ev.length : null,
    b13_citationsReal: rs.some((r) => r.cited !== null) ? [sum(rs.map((r) => r.citedReal ?? 0)), sum(rs.map((r) => r.cited ?? 0))] : null,
    b13_weaknessesWithoutCitation: rs.some((r) => r.cited !== null) ? sum(rs.map((r) => r.weaknessesWithoutCitation?.length ?? 0)) : null,
  };
}

async function main() {
  const [runsDir, outDir] = process.argv.slice(2);
  if (!runsDir || !outDir) throw new Error("usage: score.ts <RUNS_DIR> <OUT_DIR>");
  const files = (await readdir(runsDir)).filter((f) => /-r\d+\.json$/.test(f));
  const scores: RunScore[] = [];
  for (const f of files) {
    const run = JSON.parse(await readFile(join(runsDir, f), "utf8"));
    scores.push(scoreStates(f, run, run.condition, cognaStates(run), startFromText(run.cogna?.finalReport?.startingPoint), true));
    if (run.condition === "FIXED" && run.aiRead?.skills) scores.push(scoreStates(f, run, "FIXED_AI_READ", aiStates(run), run.aiRead.startWith ?? null, false));
  }
  // The blind independent end reports (Amendment 1), scored on the same bars as the Lotus run they read.
  const keyFile = join(outDir, "blind-key.json");
  const blindDir = join(outDir, "blind-reports");
  try {
    const key: Record<string, string> = JSON.parse(await readFile(keyFile, "utf8"));
    for (const [code, runFile] of Object.entries(key)) {
      let report: any;
      try { report = JSON.parse(await readFile(join(blindDir, `${code}.json`), "utf8")); } catch { continue; }
      const run = JSON.parse(await readFile(join(runsDir, runFile), "utf8"));
      const states = new Map<string, State>();
      for (const [s, v] of Object.entries<string>(report.skills ?? {})) states.set(s, v === "GAP" ? "CONFIRMED" : v === "SHAKY" ? "SUSPECTED" : v === "SECURE" ? "SECURE" : "OTHER");
      const score = scoreStates(`${code}→${runFile}`, run, "BLIND_CLAUDE", states, report.startWith ?? null, false);
      // Bar 13 for the blind report: the questions its gaps and shaky skills cite.
      const intents = new Map<number, string>((run.turns ?? []).filter((t: any) => t.intent).map((t: any) => [t.turn, t.intent.kind]));
      let cited = 0, real = 0; const none: string[] = [], bad: string[] = [];
      for (const claim of [...(report.gaps ?? []), ...(report.shaky ?? [])]) {
        const qs = [...new Set(((claim.evidence ?? []).join(" ").match(/Q(\d+)/g) ?? []).map((q: string) => Number(q.slice(1))))] as number[];
        if (!qs.length) { none.push(claim.skill); continue; }
        for (const q of qs) { cited++; const k = intents.get(q); if (k && k !== "RIGHT") real++; else bad.push(`${claim.skill}@Q${q}:${k ?? "not asked"}`); }
      }
      scores.push({ ...score, cited, citedReal: real, weaknessesWithoutCitation: none, badCitations: bad });
    }
  } catch { /* no blind reports yet */ }
  const conditions = ["LOTUS", "BLIND_CLAUDE", "FIXED", "FIXED_AI_READ", "AI_ONLY"].filter((c) => scores.some((s) => s.condition === c));
  const summary = conditions.map((c) => summarise(c, scores.filter((s) => s.condition === c)));
  await writeFile(join(outDir, "scorecard.json"), JSON.stringify({ summary, runs: scores }, null, 2));
  const f = (x: unknown) => Array.isArray(x) ? `${pct(x[0], x[1])} (${x[0]}/${x[1]})` : typeof x === "number" ? (Number.isInteger(x) ? String(x) : x.toFixed(1)) : x === null ? "n/a" : String(x);
  const rows: Array<[string, string, (s: ReturnType<typeof summarise>) => unknown]> = [
    ["1", "Right starting point (≥ 70%)", (s) => s.b1_startRight],
    ["1b", "Starting point is at least a real gap", (s) => s.b1_startIsAGap],
    ["2", "Capable learners given an invented gap (0)", (s) => s.b2_capableWithInvented],
    ["2", "Invented gaps per struggling learner (≤ 1)", (s) => s.b2_inventedPerStruggling],
    ["2b", "Knock-on gaps confirmed per struggling learner (no bar)", (s) => s.knockOnPerStruggling],
    ["3", "Roots found (≥ 80%)", (s) => s.b3_rootsFound],
    ["4", "Same starting point across repeats (≥ 80%)", (s) => s.b4_agreement],
    ["5", "Gaps confirmed on a single answer (0)", (s) => s.b5_singleEvidenceBreaks],
    ["6", "Average questions, learners with gaps (< 15)", (s) => s.b6_avgQuestionsWithGaps],
    ["7", "All gaps found (≥ 80%)", (s) => s.b7_gapsFound],
    ["8", "Reported strengths truly secure (≥ 90%)", (s) => s.b8_secureRight],
    ["8b", "Gaps reported as secure (0)", (s) => s.b8_gapsCalledSecure],
    ["9", "Shaky skills kept separate (≥ 70%)", (s) => s.b9_shakySeparate],
    ["10", "Deeper gap first, linked gaps (≥ 80%)", (s) => s.b10_orderRight],
    ["11", "Confirmed gaps without question evidence (0)", (s) => s.b11_unexplained],
    ["12", "Never-asked skills called secure (0)", (s) => s.b12_untestedSecure],
    ["12b", "\"Not asked\" lines per report (≤ 5)", (s) => s.b12_avgNotAskedLines],
    ["13", "Cited questions that truly show the weakness (≥ 95%)", (s) => s.b13_citationsReal],
    ["13b", "Reported weaknesses citing no question (0)", (s) => s.b13_weaknessesWithoutCitation],
  ];
  const md = ["# Lotus evaluation E1 — scorecard", "", `Runs: ${summary.map((s) => `${s.condition} ${s.runs}`).join(", ")}`, "",
    `| Bar | Measure | ${conditions.join(" | ")} |`, `|---|---|${conditions.map(() => "---").join("|")}|`,
    ...rows.map(([n, label, get]) => `| ${n} | ${label} | ${summary.map((s) => f(get(s))).join(" | ")} |`), ""];
  await writeFile(join(outDir, "SCORECARD.md"), md.join("\n"));
  console.log(md.join("\n"));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
