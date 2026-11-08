#!/usr/bin/env node
/**
 * Blind export for every scored run not yet given a blind report (the first export covered each learner's earliest
 * LOTUS run). Same content as blind-ledgers.ts: questions and answers only. The runs are split into batches so that
 * no batch holds two runs of the same learner: a reviewer can't recognise a student from an earlier test.
 *   node --import tsx scripts/lotus-eval/blind-ledgers-rest.ts <RUNS_DIR> <EVAL_DIR>
 * Writes <EVAL_DIR>/blind2/batchN/Cxx.json, <EVAL_DIR>/blind2/skills.json and <EVAL_DIR>/blind-key-2.json.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FACTORISATION_SKILLS } from "../../src/lotus/lotus-factorisation-catalogue";

async function main() {
  const [runsDir, evalDir] = process.argv.slice(2);
  if (!runsDir || !evalDir) throw new Error("usage: blind-ledgers-rest.ts <RUNS_DIR> <EVAL_DIR>");
  const done = new Set(Object.values(JSON.parse(await readFile(join(evalDir, "blind-key.json"), "utf8")) as string[]));
  const rest = (await readdir(runsDir)).filter((f) => /-r\d\.json$/.test(f) && !done.has(f)).sort();
  // Fixed shuffle, then deal into batches so a learner never appears twice in one batch.
  const shuffled = rest.map((f, i) => ({ f, k: (i * 7919 + 13) % 101 })).sort((a, b) => a.k - b.k).map((x) => x.f);
  const batches: string[][] = [];
  for (const f of shuffled) {
    const learner = f.split("-")[0]!;
    let b = batches.find((xs) => !xs.some((x) => x.split("-")[0] === learner) && xs.length < 11);
    if (!b) { b = []; batches.push(b); }
    b.push(f);
  }
  const key: Record<string, { file: string; batch: number }> = {};
  let n = 0;
  const out = join(evalDir, "blind2");
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "skills.json"), JSON.stringify(FACTORISATION_SKILLS.map((s) => ({ id: s.id, name: s.name, dependsOn: s.dependsOn })), null, 2));
  for (const [bi, files] of batches.entries()) {
    await mkdir(join(out, `batch${bi + 1}`), { recursive: true });
    for (const f of files) {
      const run = JSON.parse(await readFile(join(runsDir, f), "utf8"));
      const code = `C${String(++n).padStart(2, "0")}`;
      key[code] = { file: f, batch: bi + 1 };
      await writeFile(join(out, `batch${bi + 1}`, `${code}.json`), JSON.stringify({ student: code, answers: run.ledger }, null, 2));
    }
  }
  await writeFile(join(evalDir, "blind-key-2.json"), JSON.stringify(key, null, 2));
  console.log(`exported ${n} runs in ${batches.length} batches: ${batches.map((b) => b.length).join(", ")}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
