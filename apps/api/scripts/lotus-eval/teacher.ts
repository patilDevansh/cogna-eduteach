#!/usr/bin/env node
/**
 * Teacher check for every report, by one written rule ("could I plan this student's next three lessons from it?"):
 *   Capable learner:  YES an all-clear · PARTLY only suspicions · NO any confirmed gap.
 *   Learner with gaps: YES the starting point is a root · PARTLY the starting point is built on a root (teaching it
 *                      leads there), or there is none but a root is flagged · NO otherwise.
 * Applied to Cogna's report in every run (LOTUS, FIXED, AI_ONLY) and to every blind report.
 *   node --import tsx scripts/lotus-eval/teacher.ts <RUNS_DIR> <EVAL_DIR>
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FACTORISATION_SKILLS, dependsOnTransitively } from "../../src/lotus/lotus-factorisation-catalogue";
import type { Learner } from "./learners";

const NAME = new Map(FACTORISATION_SKILLS.map((s) => [s.id, s.name]));
const byName = (text: string | undefined) => {
  const said = text?.match(/Start with (.+?)\./i)?.[1]?.toLowerCase();
  return said ? [...NAME.entries()].filter(([, n]) => said.startsWith(n.toLowerCase())).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? null : null;
};

function judge(l: Learner, start: string | null, confirmed: string[], flagged: string[]): { verdict: "YES" | "PARTLY" | "NO"; why: string } {
  const gaps = Object.keys(l.gaps);
  if (!gaps.length) {
    if (confirmed.length) return { verdict: "NO", why: `confirms ${confirmed.map((s) => NAME.get(s)).join(", ")} in a secure learner` };
    if (flagged.length) return { verdict: "PARTLY", why: `no gap confirmed, but suspects ${flagged.map((s) => NAME.get(s)).join(", ")}` };
    return { verdict: "YES", why: "all-clear" };
  }
  const roots = gaps.filter((g) => !gaps.some((o) => o !== g && dependsOnTransitively(g, o)));
  if (start && roots.includes(start)) return { verdict: "YES", why: `starts with the root, ${NAME.get(start)}` };
  if (start && roots.some((r) => dependsOnTransitively(start, r))) return { verdict: "PARTLY", why: `starts with ${NAME.get(start)}, which is built on the root ${roots.map((r) => NAME.get(r)).join(", ")}` };
  if (!start && roots.some((r) => flagged.includes(r))) return { verdict: "PARTLY", why: "no starting point, but the root is flagged" };
  return { verdict: "NO", why: start ? `starts with ${NAME.get(start)}; the root is ${roots.map((r) => NAME.get(r)).join(", ")}` : `no starting point; the root ${roots.map((r) => NAME.get(r)).join(", ")} isn't flagged` };
}

async function main() {
  const [runsDir, evalDir] = process.argv.slice(2);
  if (!runsDir || !evalDir) throw new Error("usage: teacher.ts <RUNS_DIR> <EVAL_DIR>");
  const key: Record<string, string> = JSON.parse(await readFile(join(evalDir, "blind-key.json"), "utf8"));
  try { for (const [c, v] of Object.entries<{ file: string }>(JSON.parse(await readFile(join(evalDir, "blind-key-2.json"), "utf8")))) key[c] = v.file; } catch { /* first export only */ }
  const codeOf = new Map(Object.entries(key).map(([c, f]) => [f, c]));
  const rows: any[] = [];
  for (const f of (await readdir(runsDir)).filter((x) => /-r\d\.json$/.test(x)).sort()) {
    const run = JSON.parse(await readFile(join(runsDir, f), "utf8"));
    const l = run.learner as Learner;
    const skills: any[] = run.cogna?.finalReport?.skills ?? [];
    const c = judge(l, byName(run.cogna?.finalReport?.startingPoint), skills.filter((s) => s.state === "CONFIRMED").map((s) => s.skillId),
      skills.filter((s) => s.state === "CONFIRMED" || s.state === "SUSPECTED").map((s) => s.skillId));
    rows.push({ learner: l.id, condition: run.condition, repeat: run.repeat, who: "Cogna", ...c });
    const code = codeOf.get(f);
    if (!code) continue;
    try {
      const b = JSON.parse(await readFile(join(evalDir, "blind-reports", `${code}.json`), "utf8"));
      const states = Object.entries<string>(b.skills ?? {});
      rows.push({ learner: l.id, condition: run.condition, repeat: run.repeat, who: "Blind", code,
        ...judge(l, b.startWith ?? null, states.filter(([, v]) => v === "GAP").map(([s]) => s), states.filter(([, v]) => v === "GAP" || v === "SHAKY").map(([s]) => s)) });
    } catch { /* no blind report yet */ }
  }
  const count = (who: string, cond: string) => {
    const r = rows.filter((x) => x.who === who && x.condition === cond);
    return `${r.length} reports: ${r.filter((x) => x.verdict === "YES").length} yes, ${r.filter((x) => x.verdict === "PARTLY").length} partly, ${r.filter((x) => x.verdict === "NO").length} no`;
  };
  const md = ["# Teacher check — every report", "", "Rule: see the header of `apps/api/scripts/lotus-eval/teacher.ts`.", "",
    "| Run | Cogna's report | Blind report |", "|---|---|---|",
    ...["LOTUS", "FIXED", "AI_ONLY"].map((c) => `| ${c} | ${count("Cogna", c)} | ${count("Blind", c)} |`), "",
    "| Learner | Run | Who | Verdict | Why |", "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.learner} | ${r.condition} r${r.repeat} | ${r.who}${r.code ? ` (${r.code})` : ""} | ${r.verdict} | ${r.why} |`)];
  await writeFile(join(evalDir, "TEACHER_CHECK.md"), md.join("\n"));
  await writeFile(join(evalDir, "teacher-check.json"), JSON.stringify(rows, null, 2));
  console.log(md.slice(4, 9).join("\n"));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
