#!/usr/bin/env node
/**
 * Claim-by-claim comparison, every run that has a blind report: for each skill that Cogna's report (Lotus, fixed
 * test or AI-only, whichever the run was) or the blind report calls a weakness, what each said, the questions each
 * cited, what the learner really did on those questions, and what the skill truly is for that learner.
 *   node --import tsx scripts/lotus-eval/compare.ts <RUNS_DIR> <EVAL_DIR>
 * Writes <EVAL_DIR>/COMPARISON.md and comparison.json.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FACTORISATION_SKILLS, dependsOnTransitively } from "../../src/lotus/lotus-factorisation-catalogue";
import type { Learner } from "./learners";

const NAME = new Map(FACTORISATION_SKILLS.map((s) => [s.id, s.name]));
const qnums = (lines: string[]) => [...new Set((lines.join(" ").match(/Q(\d+)/g) ?? []).map((q) => Number(q.slice(1))))].sort((a, b) => a - b);

function truthOf(l: Learner, skill: string): "GAP" | "KNOCK_ON" | "SHAKY" | "SECURE" {
  const gaps = Object.keys(l.gaps);
  if (gaps.includes(skill)) return "GAP";
  if (gaps.some((g) => g !== skill && dependsOnTransitively(skill, g))) return "KNOCK_ON";
  if (skill in l.shaky) return "SHAKY";
  return "SECURE";
}

/** Whether a claim of weakness on this skill is right, given the truth. */
const claimRight = (t: string) => t !== "SECURE";

async function main() {
  const [runsDir, evalDir] = process.argv.slice(2);
  if (!runsDir || !evalDir) throw new Error("usage: compare.ts <RUNS_DIR> <EVAL_DIR>");
  const key: Record<string, string> = JSON.parse(await readFile(join(evalDir, "blind-key.json"), "utf8"));
  try { for (const [c, v] of Object.entries<{ file: string }>(JSON.parse(await readFile(join(evalDir, "blind-key-2.json"), "utf8")))) key[c] = v.file; } catch { /* first export only */ }
  const rows: any[] = [];
  const md: string[] = ["# Claim-by-claim comparison", "",
    "For every run with a blind report: each skill either report calls a weakness. **Truth** is the learner's hidden profile (GAP, KNOCK_ON = built on a gap, SHAKY, SECURE). **Cited Qs** show what the learner really did on each cited question (✓ right, ✗ wrong, ? doubted, — said I don't know, R rushed, S slip).",
    "A weakness here is anything a report calls CONFIRMED or SUSPECTED (blind: GAP or SHAKY), so \"flagged a secure skill\" includes suspicions; the scorecard's \"invented gap\" counts confirmed ones only. A claim on a SHAKY or KNOCK_ON skill counts as right.", ""];
  const mark: Record<string, string> = { RIGHT: "✓", PREDICTED_WRONG: "✗", UNPREDICTED_WRONG: "✗", DOUBTED_RIGHT: "?", DONT_KNOW: "—", RUSHED: "R", SLIP: "S" };
  for (const [code, file] of Object.entries(key).sort((a, b) => a[1].localeCompare(b[1]))) {
    let blind: any;
    try { blind = JSON.parse(await readFile(join(evalDir, "blind-reports", `${code}.json`), "utf8")); } catch { continue; }
    const run = JSON.parse(await readFile(join(runsDir, file), "utf8"));
    const l = run.learner as Learner;
    const intent = new Map<number, string>(run.turns.filter((t: any) => t.intent).map((t: any) => [t.turn, t.intent.kind]));
    const cites = (qs: number[]) => qs.map((q) => `Q${q}${mark[intent.get(q) ?? ""] ?? "·"}`).join(" ") || "none";
    const cogna = new Map<string, { state: string; qs: number[] }>();
    for (const s of run.cogna?.finalReport?.skills ?? []) {
      if (s.state !== "CONFIRMED" && s.state !== "SUSPECTED") continue;
      cogna.set(s.skillId, { state: s.state, qs: qnums((s.evidence ?? []).filter((e: string) => !/^Q\d+: right\b/i.test(e.trim()))) });
    }
    const b = new Map<string, { state: string; qs: number[] }>();
    for (const g of blind.gaps ?? []) b.set(g.skill, { state: "GAP", qs: qnums(g.evidence ?? []) });
    for (const s of blind.shaky ?? []) if (!b.has(s.skill)) b.set(s.skill, { state: "SHAKY", qs: qnums(s.evidence ?? []) });
    const skills = [...new Set([...cogna.keys(), ...b.keys(), ...Object.keys(l.gaps)])];
    const cognaStart = run.cogna?.finalReport?.startingPoint?.match(/Start with (.+?)\./i)?.[1] ?? "none";
    md.push(`## ${l.id} · ${run.condition} r${run.repeat} (blind ${code})`, "",
      `Hidden profile: gaps ${Object.keys(l.gaps).map((g) => NAME.get(g)).join(", ") || "none"}; shaky ${Object.keys(l.shaky).map((g) => NAME.get(g)).join(", ") || "none"}. Starting point — Cogna: ${cognaStart}; blind: ${blind.startWith ? NAME.get(blind.startWith) : "none"}.`, "",
      "| Skill | Truth | Cogna said | Cogna cited | Blind said | Blind cited | Verdict |", "|---|---|---|---|---|---|---|");
    for (const s of skills) {
      const t = truthOf(l, s);
      const c = cogna.get(s), bb = b.get(s);
      const cOk = c ? claimRight(t) : t !== "GAP";
      const bOk = bb ? claimRight(t) : t !== "GAP";
      const verdict = c && bb ? (cOk && bOk ? "both right" : cOk ? "only Cogna right" : bOk ? "only blind right" : "both wrong")
        : c ? (cOk ? "only Cogna found it" : "Cogna flagged a secure skill") : bb ? (bOk ? "only blind found it" : "blind flagged a secure skill") : "both missed the gap";
      md.push(`| ${NAME.get(s)} | ${t} | ${c?.state ?? "—"} | ${c ? cites(c.qs) : ""} | ${bb?.state ?? "—"} | ${bb ? cites(bb.qs) : ""} | ${verdict} |`);
      rows.push({ learner: l.id, condition: run.condition, repeat: run.repeat, code, skill: s, truth: t, cogna: c ?? null, blind: bb ?? null, verdict });
    }
    md.push("");
  }
  const tally = (cond: string) => { const r = rows.filter((x) => x.condition === cond); const out: Record<string, number> = {}; for (const x of r) out[x.verdict] = (out[x.verdict] ?? 0) + 1; return out; };
  md.splice(3, 0, "## Totals by condition", "", ...["LOTUS", "FIXED", "AI_ONLY"].map((c) => `- **${c}**: ${Object.entries(tally(c)).map(([k, v]) => `${k} ${v}`).join(" · ")}`), "");
  await writeFile(join(evalDir, "COMPARISON.md"), md.join("\n"));
  await writeFile(join(evalDir, "comparison.json"), JSON.stringify(rows, null, 2));
  console.log(md.slice(3, 9).join("\n"));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
