#!/usr/bin/env node
/**
 * Exports, for each learner's first LOTUS run, only what a teacher would see on paper: each question, the right
 * answer, the options, what the student did (answer, chips, drafts, confidence, time). No Lotus report, no
 * hidden profile, no learner name. Files are named by a neutral code (B01…), with the key kept separately.
 *   node --import tsx scripts/lotus-eval/blind-ledgers.ts <RUNS_DIR> <BLIND_DIR>
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FACTORISATION_SKILLS } from "../../src/lotus/lotus-factorisation-catalogue";

async function main() {
  const [runsDir, blindDir] = process.argv.slice(2);
  if (!runsDir || !blindDir) throw new Error("usage: blind-ledgers.ts <RUNS_DIR> <BLIND_DIR>");
  await mkdir(blindDir, { recursive: true });
  // Each learner's earliest LOTUS run (r1 where it exists).
  const all = (await readdir(runsDir)).filter((f) => /-LOTUS-r\d\.json$/.test(f)).sort();
  const files = all.filter((f, i) => all.findIndex((g) => g.split("-LOTUS-")[0] === f.split("-LOTUS-")[0]) === i);
  const key: Record<string, string> = {};
  // A fixed shuffle so the code order says nothing about the learner group.
  const order = files.map((f, i) => ({ f, k: (i * 7919) % 97 })).sort((a, b) => a.k - b.k);
  for (const [i, { f }] of order.entries()) {
    const run = JSON.parse(await readFile(join(runsDir, f), "utf8"));
    const code = `B${String(i + 1).padStart(2, "0")}`;
    key[code] = f;
    await writeFile(join(blindDir, `${code}.json`), JSON.stringify({ student: code, answers: run.ledger }, null, 2));
  }
  await writeFile(join(blindDir, "skills.json"), JSON.stringify(FACTORISATION_SKILLS.map((s) => ({ id: s.id, name: s.name, dependsOn: s.dependsOn })), null, 2));
  // The key lives outside the blind folder, so a reviewer given that folder can't see it.
  await writeFile(join(blindDir, "..", "blind-key.json"), JSON.stringify(key, null, 2));
  console.log(`exported ${files.length} blind ledgers`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
