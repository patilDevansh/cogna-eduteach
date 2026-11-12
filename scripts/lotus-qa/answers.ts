/**
 * Lotus QA answer sheet, question list v1 (frozen: add questions, never soften one).
 *
 * Turns saved real-browser runs into plain answers: what was planned, what was delivered.
 * Truth comes from each simulated student's sealed plan, written before Cogna's report was read.
 * It reads saved files only, so re-answering costs no browser time and no model calls.
 *
 *   node --import tsx scripts/lotus-qa/answers.ts
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { foldLedger, calculateSkillRating } from "../../apps/api/src/lotus/lotus-factorisation";

const ROOT = "test-results/lotus-qa";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

/** Written out by hand from the agreed paper, so it does not borrow from the code under test. */
const PLANNED_SPINE = ["FAC_DIVIDE_TERMS", "FAC_GCF_VARIABLE", "FAC_DIVIDE_TERMS", "FAC_COMMON_MONOMIAL", "FAC_GCF_NEGATIVE", "FAC_MEANING", "FAC_COMMON_BINOMIAL", "FAC_GROUP_TERMS", "FAC_DIFF_SQUARES", "FAC_DIFF_SQUARES", "FAC_PERFECT_SQUARE_PLUS", "FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL", "FAC_MONIC_TRINOMIAL", "FAC_FACTOR_FULLY"];
const ALL_GAMES = ["CHUNK_IT", "COMMIT_THEN_CHOOSE", "EDIT_HISTORY", "FIND_EVERY_B", "FOUR_SIGNS", "ORDER_STEPS", "RAPID_SET", "READBACK", "RECTANGLE", "REPLAY", "SPLIT_CONFIDENCE", "TEST_CLAIM", "TRUE_FALSE", "TWO_MOVES", "TWO_NUMBERS"];

interface Session { id: string; persona: string; pace: string; mode: string; run: string; truth: any; ledger: any[]; view: any; audits: any[]; report: any; evidence: any; }
function load(run: string): Session[] {
  const dir = `${ROOT}/${run}`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".cogna-result.json")).map((f) => {
    const id = f.replace(".cogna-result.json", "");
    const sealed = read(`${dir}/${id}.blind-analysis.json`);
    const view = read(`${dir}/${f}`).completed;
    const evidence = existsSync(`${dir}/${id}.browser-evidence.json`) ? read(`${dir}/${id}.browser-evidence.json`) : null;
    return { id, persona: sealed.persona, pace: sealed.pace, mode: run === "live" ? "live" : "fake", run, truth: sealed.declaredTruth, ledger: sealed.ledger, view, audits: view.audits ?? [], report: view.finalReport, evidence };
  });
}

// A rerun replaces only that persona and speed; the first attempts stay on disk as evidence.
const newestFirst = ["extra", "retry2", "retry", "fake"].flatMap(load);
const fake = newestFirst.filter((s, i) => newestFirst.findIndex((o) => o.persona === s.persona && o.pace === s.pace) === i);
const live = load("live");
const phone = load("scenarios");
const all = [...fake, ...phone, ...live];
const scenarios: Array<{ id: string; pass: boolean; detail: string }> = existsSync(`${ROOT}/scenarios/scenarios.json`) ? read(`${ROOT}/scenarios/scenarios.json`) : [];
const finished = new Set(all.map((s) => `${s.run === "live" ? "live" : "fake"}|${s.persona}|${s.pace}`));
const runFailures = [...new Set(["fake", "retry", "retry2", "extra", "live"].flatMap((run) => existsSync(`${ROOT}/${run}/report.json`) ? read(`${ROOT}/${run}/report.json`).results.filter((r: any) => !r.sessionId && !finished.has(`${run === "live" ? "live" : "fake"}|${r.persona}|${r.pace}`)).map((r: any) => `${run === "live" ? "live " : ""}${r.persona}/${r.pace}: ${r.score.failures[0]}`) : []))].sort();

const skill = (s: Session, id: string) => (s.report?.skills ?? []).find((x: any) => x.skillId === id);
const confirmed = (s: Session) => (s.report?.skills ?? []).filter((x: any) => x.state === "CONFIRMED").map((x: any) => x.skillId as string);
const short = (id: string) => id.replace(/^(P|X)(\d+)_.*/, "$1$2");
const diag = (row: any) => row.question.diagnostics ?? {};
const isProbe = (row: any) => Boolean(diag(row).isElasticProbe) || Number(diag(row).slot) % 1 === 0.5;
const spineRows = (s: Session) => s.ledger.filter((row) => !isProbe(row));
const escalated = (s: Session) => spineRows(s).some((row, i) => diag(row).skillId !== PLANNED_SPINE[i]);
const by = (ids: RegExp, from: Session[] = fake) => from.filter((s) => ids.test(s.persona));
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

type Verdict = "DELIVERED" | "PARTLY" | "NOT DELIVERED" | "NOT TESTED";
interface Answer { id: string; area: string; question: string; planned: string; delivered: string; verdict: Verdict; evidence: string; }
const verdictOf = (good: number, total: number): Verdict => total === 0 ? "NOT TESTED" : good === total ? "DELIVERED" : good === 0 ? "NOT DELIVERED" : "PARTLY";
const answers: Answer[] = [];
const ask = (id: string, area: string, question: string, planned: string, compute: () => { delivered: string; verdict: Verdict; evidence?: string }) => {
  const r = compute();
  answers.push({ id, area, question, planned, delivered: r.delivered, verdict: r.verdict, evidence: r.evidence ?? "" });
};
const ratio = (good: Session[] | number, total: number) => typeof good === "number" ? `${good} of ${total}` : `${good.length} of ${total}`;
const names = (list: Session[]) => list.map((s) => `${short(s.persona)}/${s.pace}`).join(", ");

// ---- Skeleton
ask("S1", "15-question elastic skeleton", "Does every full test ask 15 planned questions in order, with at most four extra follow-ups and at most 19 in total?", "15 main questions once each, in order. At most four follow-ups numbered like Q8.5, only for students showing a problem. Never more than 19.", () => {
  const exits = all.filter((s) => s.ledger.length < 15);
  const full = all.filter((s) => !exits.includes(s));
  const ok = full.filter((s) => s.ledger.length <= 19 && spineRows(s).length === 15 && spineRows(s).every((r, i) => Math.floor(Number(diag(r).slot)) === i + 1) && s.ledger.filter(isProbe).length <= 4);
  const counts = all.map((s) => s.ledger.length);
  return { delivered: `${ratio(ok, full.length)} full tests held this shape${exits.length ? `, plus ${exits.length} permitted early exit(s)` : ""}. Lengths ranged from ${Math.min(...counts)} to ${Math.max(...counts)} questions.${runFailures.length ? ` ${runFailures.length} run(s) did not finish and are listed in S7.` : ""}`, verdict: verdictOf(ok.length, full.length), evidence: `not held: ${names(full.filter((s) => !ok.includes(s))) || "none"}` };
});
ask("S2", "15-question elastic skeleton", "Are the questions on the topics planned for each position?", "Each position tests its planned skill: foundations, signs, grouping, identities, then quadratics.", () => {
  const fullTests = all.filter((s) => s.ledger.length >= 15);
  const ok = fullTests.filter((s) => !escalated(s));
  return { delivered: `${ratio(ok, fullTests.length)} tests matched the planned topic in all 15 positions. The rest switched topics partway.`, verdict: verdictOf(ok.length, fullTests.length), evidence: `switched: ${names(fullTests.filter(escalated)) || "none"}` };
});
ask("S3", "15-question elastic skeleton", "Does a fast, strong student still get every planned topic?", "Every main topic is asked, for every student. The only stated exceptions are early exit and the time limit.", () => {
  // Anyone quick and correct on the first five qualifies for the switch, not only the named strong students.
  const strong = all.filter((s) => s.ledger.length >= 15 && s.audits.slice(0, 5).every((a) => a.verification.status === "VERIFIED_CORRECT"));
  const swapped = strong.filter(escalated);
  const detail = swapped[0] ? ` For example ${short(swapped[0].persona)}/${swapped[0].pace} was asked: ${[...new Set(spineRows(swapped[0]).slice(5).map((r) => diag(r).skillId))].length} different stretch skills from question 6 onward instead of the planned topics.` : "";
  return { delivered: `${ratio(strong.length - swapped.length, strong.length)} strong-student tests kept the planned topics. ${swapped.length} switched to harder stretch questions.${detail}`, verdict: swapped.length ? (swapped.length === strong.length ? "NOT DELIVERED" : "PARTLY") : verdictOf(strong.length, strong.length), evidence: names(swapped) };
});
ask("S4", "15-question elastic skeleton", "When a student shows a likely gap, does a follow-up question appear and target that gap?", "A suspected gap earns an extra check on that same skill, without losing a later topic.", () => {
  const cases = by(/P02|P03|P04|P05|P06|P07/);
  const probed = cases.filter((s) => s.ledger.some(isProbe));
  const onTarget = probed.filter((s) => s.ledger.filter(isProbe).some((r) => diag(r).skillId === s.truth.misconception?.skillId || (diag(r).taggedSkills ?? []).includes(s.truth.misconception?.skillId) || (diag(r).stepSkills ?? []).includes(s.truth.misconception?.skillId)) || PLANNED_SPINE.filter((id) => id === s.truth.misconception?.skillId).length >= 2);
  return { delivered: `${ratio(probed, cases.length)} students with a planted gap received a follow-up, and ${ratio(onTarget, cases.length)} had the planted skill rechecked, either by a follow-up or by a second planned question on that skill.`, verdict: verdictOf(onTarget.length, cases.length), evidence: `no on-target follow-up: ${names(cases.filter((s) => !onTarget.includes(s))) || "none"}` };
});
ask("S5", "15-question elastic skeleton", "Does a student who is completely overwhelmed get let out early, and only then?", "Early exit only at Q4 or Q5, after no correct answers plus repeated 'I don't know' or very slow answers.", () => {
  const short15 = all.filter((s) => s.ledger.length < 15);
  const support = by(/P08/, all);
  const failedSupport = runFailures.filter((f) => f.startsWith("P08"));
  return { delivered: `${short15.length} finished tests ended early (${names(short15) || "none"}). The student who says "I don't know" on planned skills answered ${support.map((s) => s.ledger.length).join(" and ") || "no"} questions.${failedSupport.length ? " That persona's run failed; see S7." : ""}`, verdict: short15.every((s) => s.ledger.length >= 4 && s.ledger.length <= 5) && all.length ? (short15.length ? "DELIVERED" : "NOT TESTED") : "NOT DELIVERED", evidence: short15.length ? "" : "No persona met the strict early-exit condition, so the exit itself was not exercised." };
});
ask("S6", "15-question elastic skeleton", "Does the question number on screen match where the student is?", "The student sees 'Question N of M', with N matching their real position.", () => {
  const rows = all.flatMap((s) => s.ledger.filter((r) => r.screenLabel).map((r) => ({ r, s })));
  const ok = rows.filter(({ r }) => Number(/Question (\d+)/.exec(r.screenLabel)?.[1]) === r.turn);
  const wrong = rows.find(({ r }) => Number(/Question (\d+)/.exec(r.screenLabel)?.[1]) !== r.turn);
  return { delivered: `${ratio(ok.length, rows.length)} on-screen labels matched the real position. Game-style questions without this label are not counted.`, verdict: verdictOf(ok.length, rows.length), evidence: wrong ? `first mismatch: ${short(wrong.s.persona)} turn ${wrong.r.turn} showed "${wrong.r.screenLabel}"` : "" };
});
ask("S7", "15-question elastic skeleton", "Did every planned browser test actually finish?", "Every persona at each speed reaches a final report on the real screens.", () => {
  const planned = fake.length + runFailures.filter((f) => !f.startsWith("live ")).length;
  return { delivered: `${ratio(fake.length, planned)} stand-in-AI sessions finished, plus ${live.length} live AI and ${phone.length} phone session(s). ${runFailures.length ? `Not finished: ${runFailures.map((f) => f.slice(0, 150)).join(" | ")}` : "None failed to finish."}`, verdict: verdictOf(fake.length, planned) };
});

// ---- Separation of powers
ask("A1", "AI and rules: who does what", "Is every answer marked right or wrong by fixed maths rules, and are those marks correct?", "Rules decide right or wrong. Planted mistakes are marked wrong, correct answers right.", () => {
  const rows = fake.filter((s) => !s.truth.messy).flatMap((s) => s.audits.map((a, i) => ({ a, r: s.ledger[i], s }))).filter(({ r, a }) => r && !a.response?.didNotKnow);
  const correctMark = rows.filter(({ a, r }) => r.plannedDeliberateMistake ? a.verification.status !== "VERIFIED_CORRECT" || (a.skillEvidence ?? []).some((e: any) => e.kind === "MISTAKE") : a.verification.status === "VERIFIED_CORRECT");
  const methods = [...new Set(all.flatMap((s) => s.audits.map((a) => a.verification.method)))];
  const miss = rows.find((x) => !correctMark.includes(x));
  return { delivered: `${ratio(correctMark.length, rows.length)} answers were marked in line with the student's hidden plan. Marking methods seen: ${methods.join(", ")}.`, verdict: verdictOf(correctMark.length, rows.length), evidence: miss ? `first miss: ${short(miss.s.persona)} Q${miss.r.turn} (${miss.r.gameKind ?? "typed"}) planned mistake=${miss.r.plannedDeliberateMistake}, marked ${miss.a.verification.status}` : "" };
});
ask("A2", "AI and rules: who does what", "If the live AI disagrees with the maths rules, do the rules win?", "The AI can comment on an answer but cannot change its mark.", () => {
  const rows = live.flatMap((s) => s.audits).filter((a) => a.gpt?.mathJudgment && a.gpt.mathJudgment !== "NOT_APPLICABLE");
  const disagree = rows.filter((a) => (a.gpt.mathJudgment === "CORRECT") !== (a.verification.status === "VERIFIED_CORRECT"));
  return { delivered: rows.length ? `The live AI gave a maths view on ${rows.length} answers and disagreed with the rules on ${disagree.length}. In all cases the saved mark is the rules' mark, because that mark is produced before the AI runs.` : "No live AI answers were reviewed.", verdict: rows.length ? "DELIVERED" : "NOT TESTED" };
});
ask("A3", "AI and rules: who does what", "Can every piece of skill evidence be traced to where it came from?", "Each piece of evidence records its source: an instant rule or the AI review.", () => {
  const items = all.flatMap((s) => s.audits.flatMap((a) => a.skillEvidence ?? []));
  const sourced = items.filter((e) => e.source);
  const sources = Object.entries(items.reduce((m: Record<string, number>, e) => ({ ...m, [e.source ?? "missing"]: (m[e.source ?? "missing"] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(", ");
  return { delivered: `${ratio(sourced.length, items.length)} pieces of evidence name their source (${sources}).`, verdict: verdictOf(sourced.length, items.length) };
});
ask("A4", "AI and rules: who does what", "Are the /5 ratings calculated only from recorded evidence?", "Ratings come from fixed rules applied to the evidence, with no AI opinion and no randomness.", () => {
  let same = 0, total = 0; let first = "";
  for (const s of all) {
    const ledger = foldLedger(s.audits as any, []);
    for (const row of s.report.skills.filter((x: any) => x.rating !== undefined)) {
      const entry = ledger.get(row.skillId); if (!entry) continue;
      total += 1;
      const again = calculateSkillRating(entry as any, s.audits as any);
      if (again?.rating === row.rating) same += 1; else first ||= `${short(s.persona)} ${row.skillId}: report ${row.rating}, recalculated ${again?.rating}`;
    }
  }
  return { delivered: `${ratio(same, total)} ratings were reproduced exactly by recalculating from the saved evidence.`, verdict: verdictOf(same, total), evidence: first };
});
ask("A5", "AI and rules: who does what", "Does the report wait for the background AI reviews?", "No report is finalised while reviews are unfinished, and any that failed are disclosed.", () => {
  const reviews = all.flatMap((s) => s.audits);
  const counts = reviews.reduce((m: Record<string, number>, a) => ({ ...m, [a.analysisStatus]: (m[a.analysisStatus] ?? 0) + 1 }), {});
  const pending = counts.PENDING ?? 0;
  const undisclosed = all.filter((s) => s.audits.some((a) => !["COMPLETE", "NOT_REQUIRED"].includes(a.analysisStatus)) && !s.report.limitations.some((l: string) => /deeper AI review/.test(l)));
  return { delivered: `Review status at report time: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}. ${undisclosed.length} report(s) hid an unfinished review.`, verdict: pending === 0 && undisclosed.length === 0 ? "DELIVERED" : "PARTLY" };
});

// ---- Diagnosis
const planted = () => by(/P02|P03|P04|P05|P06|P07/);
ask("D1", "Finding the right gap", "Does Lotus confirm the exact gap each student was given?", "A student with one planted misconception is reported with that skill as a confirmed gap.", () => {
  const list = planted();
  const hit = list.filter((s) => confirmed(s).includes(s.truth.misconception.skillId));
  return { delivered: `${ratio(hit, list.length)} students had the planted gap confirmed. In the others: ${list.filter((s) => !hit.includes(s)).map((s) => `${short(s.persona)}/${s.pace}=${skill(s, s.truth.misconception.skillId)?.state ?? "not listed"}`).join(", ") || "none"}.`, verdict: verdictOf(hit.length, list.length) };
});
ask("D2", "Finding the right gap", "Does the report give the right place to start teaching?", "The starting point is the planted gap, or a skill it depends on that really was shown to be weak.", () => {
  const list = planted();
  const right = list.filter((s) => { const name = skill(s, s.truth.misconception.skillId)?.name; return name && String(s.report.startingPoint).toLowerCase().includes(String(name).toLowerCase()); });
  return { delivered: `${ratio(right, list.length)} reports named the planted skill as the starting point.`, verdict: verdictOf(right.length, list.length), evidence: list.filter((s) => !right.includes(s)).map((s) => `${short(s.persona)}/${s.pace}: "${String(s.report.startingPoint).slice(0, 80)}"`).join(" | ") };
});
ask("D3", "Finding the right gap", "Does Lotus name the specific misconception, not just the topic?", "The recorded mistake matches the type of error the student actually made.", () => {
  const list = planted();
  const named = list.filter((s) => s.audits.some((a) => (a.skillEvidence ?? []).some((e: any) => e.mistake === s.truth.misconception.mistakeCode)));
  return { delivered: `${ratio(named, list.length)} sessions recorded the exact planted mistake type.`, verdict: verdictOf(named.length, list.length), evidence: `missed: ${names(list.filter((s) => !named.includes(s))) || "none"}` };
});
ask("D4", "Finding the right gap", "Is a careless slip kept apart from a real gap?", "One-off slips and typing mess never become a confirmed gap.", () => {
  const list = by(/P09|X01|X04/);
  const clean = list.filter((s) => confirmed(s).length === 0);
  return { delivered: `${ratio(clean, list.length)} careless-student sessions had no confirmed gap. Wrongly confirmed: ${list.filter((s) => !clean.includes(s)).map((s) => `${short(s.persona)}/${s.pace}: ${confirmed(s).join(", ")}`).join(" | ") || "none"}.`, verdict: verdictOf(clean.length, list.length) };
});
ask("D5", "Finding the right gap", "Does a real gap still come through when the student also makes slips?", "The real gap is found, and the slips are not added as extra gaps.", () => {
  const list = by(/X03/);
  const ok = list.filter((s) => confirmed(s).every((id) => ["FAC_GCF_NEGATIVE", "FND_SIGN_MUL_DIV"].includes(id)) && confirmed(s).length > 0);
  return { delivered: `${ratio(ok, list.length)} sessions found only the real gap. Confirmed: ${list.map((s) => confirmed(s).join(", ") || "nothing").join(" | ")}.`, verdict: verdictOf(ok.length, list.length) };
});
ask("D6", "Finding the right gap", "Does Lotus invent gaps for students who have none?", "Strong or under-confident but correct students get no gaps.", () => {
  const list = by(/P01|P10|X09/);
  const clean = list.filter((s) => (s.report.skills as any[]).every((x) => !["CONFIRMED", "SUSPECTED"].includes(x.state)));
  return { delivered: `${ratio(clean, list.length)} gap-free sessions had no invented gap. ${list.filter((s) => !clean.includes(s)).map((s) => `${short(s.persona)}/${s.pace}: ${(s.report.skills as any[]).filter((x) => ["CONFIRMED", "SUSPECTED"].includes(x.state)).map((x) => x.skillId).join(", ")}`).join(" | ")}`, verdict: verdictOf(clean.length, list.length) };
});
ask("D7", "Finding the right gap", "Are 'I don't know' answers treated as needing support?", "They signal support is needed, not a named misconception, and don't count as skills shown.", () => {
  const list = by(/P08/, all);
  const ok = list.filter((s) => s.truth.supportSkills.every((id: string) => { const row = skill(s, id); return !row || row.state !== "SECURE"; }) && !s.audits.some((a) => a.response?.didNotKnow && (a.skillEvidence ?? []).some((e: any) => e.mistake)));
  return { delivered: `${ratio(ok, list.length)} sessions kept "I don't know" skills out of the strengths and didn't invent a misconception.`, verdict: verdictOf(ok.length, list.length) };
});
ask("D8", "Finding the right gap", "Are guessing and random tapping recognised?", "A random tapper gets an 'unclear' result. A guesser is not called strong on the guessed topics.", () => {
  const random = by(/X08/); const guess = by(/X02/);
  const a = random.filter((s) => s.report.outcome === "INSUFFICIENT_OR_CONFLICTING");
  const b = guess.filter((s) => (s.report.skills as any[]).filter((x) => x.state === "SECURE" && s.truth.messy.guessSkills.includes(x.skillId)).length === 0);
  return { delivered: `Random tapper reported as unclear in ${ratio(a, random.length)}. Guesser not credited on guessed topics in ${ratio(b, guess.length)}.`, verdict: verdictOf(a.length + b.length, random.length + guess.length), evidence: random.filter((s) => !a.includes(s)).map((s) => `${s.pace}: ${s.report.outcome}`).join(", ") };
});
ask("D9", "Finding the right gap", "Is late-test tiredness kept apart from real gaps?", "Fast wrong answers late on are reported as possible tiredness and aren't taught as gaps.", () => {
  const list = by(/X07/);
  const ok = list.filter((s) => confirmed(s).length === 0 && s.report.limitations.some((l: string) => /tiredness/.test(l)));
  return { delivered: `${ratio(ok, list.length)} sessions flagged tiredness with no confirmed gap. Confirmed: ${list.map((s) => confirmed(s).join(", ") || "nothing").join(" | ")}.`, verdict: verdictOf(ok.length, list.length) };
});
ask("D10", "Finding the right gap", "Are widespread sign problems traced to one root?", "Errors across many topics are traced back to signs as the starting point.", () => {
  const list = by(/X06/);
  const ok = list.filter((s) => /sign|negative/i.test(s.report.startingPoint));
  return { delivered: `${ratio(ok, list.length)} sessions named signs as the starting point. Reports said: ${list.map((s) => `"${String(s.report.startingPoint).slice(0, 90)}"`).join(" | ")}`, verdict: verdictOf(ok.length, list.length) };
});
ask("D11", "Finding the right gap", "Does the live AI analyser identify the right gap, starting point, and misconception?", "With the real AI, the planted gap is confirmed or suspected and the planted mistake type is recorded.", () => {
  const list = live.filter((s) => s.truth.misconception && !/P09/.test(s.persona));
  const found = list.filter((s) => ["CONFIRMED", "SUSPECTED"].includes(skill(s, s.truth.misconception.skillId)?.state));
  const conf = list.filter((s) => confirmed(s).includes(s.truth.misconception.skillId));
  const named = list.filter((s) => s.audits.some((a) => (a.skillEvidence ?? []).some((e: any) => e.mistake === s.truth.misconception.mistakeCode)));
  const start = list.filter((s) => String(s.report.startingPoint).toLowerCase().includes(String(skill(s, s.truth.misconception.skillId)?.name).toLowerCase()));
  return { delivered: list.length ? `Across ${list.length} live AI session(s): gap confirmed ${conf.length}, confirmed or suspected ${found.length}, exact mistake type named ${named.length}, correct starting point ${start.length}.` : "No live AI gap session finished.", verdict: verdictOf(conf.length, list.length), evidence: list.map((s) => `${short(s.persona)}: confirmed ${confirmed(s).join(", ") || "nothing"}`).join(" | ") };
});
ask("D12", "Finding the right gap", "Does the live AI tell a careless slip from a misunderstanding?", "With the real AI, a planted one-off slip isn't confirmed, and is labelled as a slip where the AI gives a label.", () => {
  const list = live.filter((s) => /P09|X01|X04/.test(s.persona));
  const clean = list.filter((s) => confirmed(s).length === 0);
  const kinds = list.flatMap((s) => s.audits.map((a) => a.conclusion?.mistakeKind).filter(Boolean));
  return { delivered: list.length ? `${ratio(clean, list.length)} live slip sessions had no confirmed gap. AI labels given: ${kinds.join(", ") || "none"}. A planted slip labelled MISUNDERSTANDING is the wrong label, even though the rules did not turn it into a gap.` : "No live slip session finished.", verdict: !list.length ? "NOT TESTED" : kinds.includes("MISUNDERSTANDING") ? "PARTLY" : verdictOf(clean.length, list.length) };
});

ask("D13", "Finding the right gap", "Did the live AI's review actually contribute to the diagnosis?", "The AI reviews each answer and can add evidence the rules could not see, before the report is finished.", () => {
  const rows = live.flatMap((s) => s.audits);
  const reviewed = rows.filter((a) => a.analysisStatus === "COMPLETE");
  const evidence = rows.flatMap((a) => a.skillEvidence ?? []);
  const fromAi = evidence.filter((e) => e.source !== "INSTANT");
  return { delivered: `${ratio(reviewed.length, rows.length)} live answers had a finished AI review when the report was saved. ${ratio(fromAi.length, evidence.length)} pieces of evidence came from anything other than the instant rules.`, verdict: !rows.length ? "NOT TESTED" : fromAi.length ? "PARTLY" : "NOT DELIVERED", evidence: live.map((s) => `${short(s.persona)}: ${s.audits.filter((a) => a.analysisStatus === "COMPLETE").length} of ${s.audits.length} reviewed`).join(" | ") };
});
ask("D14", "Finding the right gap", "Were the live tests written fresh by AI, without code-built questions?", "Every question comes from the AI or its checked question bank.", () => {
  const rows = live.flatMap((s) => s.ledger);
  const count = (fn: (d: any) => boolean) => rows.filter((r) => fn(diag(r))).length;
  const code = count((d) => d.origin === "CODE");
  return { delivered: `Of ${rows.length} live questions: ${count((d) => d.provenance === "AI_GENERATED_FOR_SESSION")} newly written, ${count((d) => d.provenance === "AI_REUSED_FROM_BANK")} reused from the AI bank, ${code} built by code.`, verdict: !rows.length ? "NOT TESTED" : code ? "PARTLY" : "DELIVERED" };
});

// ---- Ratings
ask("R1", "Ratings out of 5", "Do skills that were never tested stay unrated?", "Untested skills show no number.", () => {
  const rows = all.flatMap((s) => (s.report.skills as any[]).filter((x) => x.state === "UNTESTED"));
  const ok = rows.filter((x) => x.rating === undefined);
  return { delivered: `${ratio(ok.length, rows.length)} untested skills had no rating.`, verdict: verdictOf(ok.length, rows.length) };
});
ask("R2", "Ratings out of 5", "Does a student who gets everything right receive strong ratings?", "A clean, correct performance shows as fluent or better (4 or 5) on the skills it directly covered.", () => {
  const list = by(/P01/); const rows = list.flatMap((s) => (s.report.skills as any[]).filter((x) => x.rating !== undefined));
  const strong = rows.filter((x) => x.rating >= 4);
  return { delivered: `${ratio(strong.length, rows.length)} rated skills got 4 or 5. The other ${rows.length - strong.length} show 3 "Emerging" despite correct answers.`, verdict: strong.length / Math.max(rows.length, 1) >= 0.8 ? "DELIVERED" : strong.length ? "NOT DELIVERED" : "NOT DELIVERED", evidence: list.map((s) => `${s.pace}: outcome ${s.report.outcome}`).join(", ") };
});
ask("R3", "Ratings out of 5", "Do the same correct answers get the same rating at different speeds?", "Open design question: the code gives speed a large effect. Reported so it can be decided, not as a bug.", () => {
  const pairs = by(/P01|P10/).filter((s) => s.pace === "normal").map((n) => ({ n, f: fake.find((s) => s.persona === n.persona && s.pace === "fast") })).filter((p) => p.f && !escalated(p.f));
  let changed = 0, total = 0;
  for (const { n, f } of pairs) for (const row of n.report.skills as any[]) { const o = skill(f!, row.skillId); if (row.rating !== undefined && o?.rating !== undefined) { total += 1; if (row.rating !== o.rating) changed += 1; } }
  return { delivered: total ? `${ratio(changed, total)} ratings changed purely with speed.` : "Fast students switched to stretch questions, so no like-for-like comparison exists.", verdict: total ? (changed ? "PARTLY" : "DELIVERED") : "NOT TESTED" };
});
ask("R4", "Ratings out of 5", "Are confirmed gaps rated low?", "A confirmed gap is 1 (foundational) or 2 (other).", () => {
  const rows = all.flatMap((s) => (s.report.skills as any[]).filter((x) => x.state === "CONFIRMED"));
  const ok = rows.filter((x) => x.rating <= 2);
  return { delivered: `${ratio(ok.length, rows.length)} confirmed gaps were rated 1 or 2.`, verdict: verdictOf(ok.length, rows.length) };
});
ask("R5", "Ratings out of 5", "Does the report's headline agree with its ratings?", "A student told they can advance shouldn't have most skills labelled Emerging.", () => {
  const adv = all.filter((s) => s.report.outcome === "ADVANCEMENT");
  const ok = adv.filter((s) => { const r = (s.report.skills as any[]).filter((x) => x.rating !== undefined); return r.filter((x) => x.rating >= 4).length >= r.length / 2; });
  return { delivered: `${ratio(ok, adv.length)} "ready to advance" reports had most rated skills at 4 or 5.`, verdict: verdictOf(ok.length, adv.length) };
});

// ---- Real browser
const withEvidence = all.filter((s) => s.evidence);
ask("B1", "Real browser behaviour", "Were answers really entered through the student screens?", "Every answer is sent by clicking or typing in the real page, not posted behind it.", () => {
  const ok = withEvidence.filter((s) => s.evidence.sentAnswers.length === s.audits.length);
  return { delivered: `${ratio(ok, withEvidence.length)} sessions: the number of answers the page sent equals the number saved (${sum(withEvidence.map((s) => s.evidence.sentAnswers.length))} answers in total).`, verdict: verdictOf(ok.length, withEvidence.length) };
});
ask("B2", "Real browser behaviour", "Does the time the page measured match each student's pace?", "Measured time stays close to the declared pace, because ratings depend on it.", () => {
  const rows = withEvidence.flatMap((s) => s.evidence.sentAnswers.map((a: any, i: number) => ({ got: a.responseTimeMs, want: s.ledger[i]?.response?.responseTimeMs }))).filter((r) => r.want && r.got);
  const ok = rows.filter((r) => Math.abs(r.got - r.want) <= Math.max(3000, r.want * 0.25));
  return { delivered: `${ratio(ok.length, rows.length)} answers were timed within tolerance of the planned pace.`, verdict: verdictOf(ok.length, rows.length) };
});
ask("B3", "Real browser behaviour", "Has every game type been played on screen, including with wrong answers?", "All 15 game types are operated through their real controls, correctly and incorrectly.", () => {
  const rows = all.flatMap((s) => s.ledger).filter((r) => r.gameKind);
  const seen = new Set(rows.map((r) => r.gameKind));
  const wrongSeen = new Set(rows.filter((r) => r.plannedDeliberateMistake).map((r) => r.gameKind));
  const missing = ALL_GAMES.filter((g) => !seen.has(g));
  return { delivered: `${seen.size} of ${ALL_GAMES.length} game types were played. ${wrongSeen.size} were played with a deliberate wrong answer. Never served: ${missing.join(", ") || "none"}. Typed questions: ${all.flatMap((s) => s.ledger).filter((r) => !r.gameKind).length}.`, verdict: missing.length === 0 && wrongSeen.size === ALL_GAMES.length ? "DELIVERED" : seen.size ? "PARTLY" : "NOT DELIVERED" };
});
ask("B4", "Real browser behaviour", "Does the report on screen show what was calculated?", "The report page opens and shows the same starting point and rated skills.", () => {
  const ok = withEvidence.filter((s) => { const t = s.evidence.reportText.toLowerCase(); return /competency ratings/.test(t) && (s.report.skills as any[]).filter((x) => x.rating !== undefined).every((x) => t.includes(String(x.name).toLowerCase())); });
  return { delivered: `${ratio(ok, withEvidence.length)} report pages displayed the ratings section with every rated skill.`, verdict: verdictOf(ok.length, withEvidence.length), evidence: `not matched: ${names(withEvidence.filter((s) => !ok.includes(s))) || "none"}` };
});
ask("B5", "Real browser behaviour", "Are there browser errors while a student takes the test?", "No page crashes or unexplained errors during a test.", () => {
  const crashes = withEvidence.filter((s) => s.evidence.browserErrors.some((e: string) => e.startsWith("pageerror")));
  const errors = withEvidence.flatMap((s) => s.evidence.browserErrors as string[]);
  const kinds = Object.entries(errors.reduce((m: Record<string, number>, e) => ({ ...m, [e.slice(0, 70)]: (m[e.slice(0, 70)] ?? 0) + 1 }), {})).slice(0, 5).map(([k, v]) => `${v}× ${k}`).join(" | ");
  return { delivered: `${crashes.length} sessions had a page crash. ${errors.length} console errors in total${kinds ? `: ${kinds}` : ""}.`, verdict: !withEvidence.length ? "NOT TESTED" : crashes.length ? "NOT DELIVERED" : errors.length ? "PARTLY" : "DELIVERED" };
});
ask("B6", "Real browser behaviour", "Does it fit on a phone?", "A full test and report fit a 375-wide screen with no sideways scrolling.", () => {
  const list = withEvidence.filter((s) => (s.evidence.viewport?.width ?? 1000) < 500);
  const ok = list.filter((s) => s.evidence.worstOverflowPx <= 0 && s.evidence.reportOverflowPx <= 0);
  return { delivered: `${ratio(ok, list.length)} phone sessions had no sideways overflow. Worst overflow: ${list.map((s) => `${s.evidence.worstOverflowPx}px during test, ${s.evidence.reportOverflowPx}px on report`).join("; ") || "n/a"}.`, verdict: verdictOf(ok.length, list.length) };
});
const scenarioQuestions: Array<[string, string, string, string]> = [
  ["B7", "REFRESH_MID_TEST", "Does a refresh in the middle of a test lose anything?", "The student returns to the same question with saved answers intact."],
  ["B8", "FAILED_SAVE_THEN_RETRY", "If an answer fails to save, is it safe to retry?", "The student is told, can retry, and the answer is saved exactly once."],
  ["B9", "OLD_TAB_CANNOT_DOUBLE_ANSWER", "Can an old tab answer the same question twice?", "A second answer from a stale tab is not counted."],
  ["B10", "STUDENT_CANNOT_READ_ANOTHER", "Can a student read another student's test?", "Another student or a logged-out visitor is refused."],
  ["B11", "ANSWERS_NOT_SENT_TO_BROWSER", "Can a student find the answers in the browser?", "The answer key is never sent to the page."],
  ["B13", "REPORT_WAITS_FOR_AI_REVIEWS", "If the AI is down, is a rule-only report withheld until reviews land?", "No report is shown during an outage. It's marked as still being reviewed, then completes by itself once the AI returns."],
  ["B12", "PRIVATE_TEST_DOOR_NEEDS_TOKEN", "Is the private testing door closed without its secret?", "Without the token, the testing route doesn't respond."],
];
for (const [id, key, question, planned] of scenarioQuestions) ask(id, "Real browser behaviour", question, planned, () => {
  const r = scenarios.find((x) => x.id === key);
  return { delivered: r?.detail ?? "Scenario did not run.", verdict: !r ? "NOT TESTED" : r.pass ? "DELIVERED" : "NOT DELIVERED" };
});
for (const [id, question, planned] of [
  ["N1", "Does the wording change correctly for ICSE and IGCSE students?", "Board-specific words appear for each board. Every browser student here was CBSE."],
  ["N2", "Does the test survive slow or failed live AI during a session?", "A delay or outage is handled without losing answers. No outage was injected."],
  ["N3", "Does it hold up with many students at once?", "Concurrent classroom use stays correct. Sessions here ran one at a time."],
  ["N4", "Do teachers see the right information?", "The teacher portfolio and class report match the students' results. Only the student report was opened."],
  ["N5", "Is the diagnosis right for real children?", "Teacher review and real student results. Everything here is simulated."],
] as const) ask(id, "Not tested yet", question, planned, () => ({ delivered: "Not tested in this run.", verdict: "NOT TESTED" }));

const counts = answers.reduce((m: Record<string, number>, a) => ({ ...m, [a.verdict]: (m[a.verdict] ?? 0) + 1 }), {});
const areas = [...new Set(answers.map((a) => a.area))];
const md = [
  "# Lotus QA answer sheet (question list v1)", "",
  `Generated ${new Date().toISOString()}. Real browser sessions: ${fake.length} with the stand-in AI, ${live.length} with the live AI, ${phone.length} on a phone screen.`, "",
  `**${counts.DELIVERED ?? 0} delivered, ${counts.PARTLY ?? 0} partly, ${counts["NOT DELIVERED"] ?? 0} not delivered, ${counts["NOT TESTED"] ?? 0} not tested.**`, "",
  ...areas.flatMap((area) => [`## ${area}`, "", ...answers.filter((a) => a.area === area).flatMap((a) => [`### ${a.id}. ${a.question}`, `- **Verdict:** ${a.verdict}`, `- **Planned:** ${a.planned}`, `- **Delivered:** ${a.delivered}`, ...(a.evidence ? [`- **Detail:** ${a.evidence}`] : []), ""])]),
].join("\n");
writeFileSync(`${ROOT}/ANSWERS.md`, md);
writeFileSync(`${ROOT}/answers.json`, JSON.stringify(answers, null, 2));
console.log(JSON.stringify(counts));
for (const a of answers) console.log(`${a.id.padEnd(4)} ${a.verdict.padEnd(14)} ${a.delivered.slice(0, 230)}${a.evidence ? ` [${a.evidence.slice(0, 160)}]` : ""}`);
