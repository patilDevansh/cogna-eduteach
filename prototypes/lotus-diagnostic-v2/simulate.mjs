// Lotus diagnostic v2 — old vs new question formats, measured.
//
// Every simulated student holds one hidden state per skill: mastered, one named
// mistake (a "bug": a consistent wrong procedure), or simply doesn't know yet.
// Each question is a model of what a student in each state answers. Where the
// old questions exist in code (apps/api/src/lotus/lotus-probes.ts) their options
// and instances are copied from there; bug behaviour is derived from the maths
// of each option, not from the labels the code attaches.
//
// We then measure, for old and new formats on the same skill:
//   bits   — mutual information between the hidden state and the response
//            (how much one answer tells us; max = log2(#states))
//   named  — P(an ideal reader names the right mistake | student has a mistake)
//   false  — P(a named mistake | student has none: mastered, slipped or guessing)
// and the same for a whole short battery, by Monte Carlo.
//
// Run: node prototypes/lotus-diagnostic-v2/simulate.mjs > prototypes/lotus-diagnostic-v2/results.json

const SLIP = 0.08; // careless mis-pick, answered with the student's usual confidence

// ---------- small distribution helpers ----------
const uniform = (xs) => Object.fromEntries(xs.map((x) => [x, 1 / xs.length]));
function mix(...parts) { // [weight, dist]
  const out = {};
  for (const [w, d] of parts) for (const [k, p] of Object.entries(d)) out[k] = (out[k] ?? 0) + w * p;
  return out;
}
function joint(a, b) { // independent components -> "a|b"
  const out = {};
  for (const [ka, pa] of Object.entries(a)) for (const [kb, pb] of Object.entries(b)) out[`${ka}|${kb}`] = pa * pb;
  return out;
}
const point = (x) => ({ [x]: 1 });
const slip = (d, options) => mix([1 - SLIP, d], [SLIP, uniform(options)]);

// Confidence tier ("Sure / Think so / Guessing"). Assumption, drawn from the
// three-tier literature: misconceptions are held with confidence, gaps are not.
let CONF = {
  M: { sure: 0.75, think: 0.2, guess: 0.05 },
  BUG: { sure: 0.6, think: 0.3, guess: 0.1 },
  UNK: { sure: 0.1, think: 0.3, guess: 0.6 },
};
const confOf = (state) => (state === "M" ? CONF.M : state === "UNK" ? CONF.UNK : CONF.BUG);

// ---------- skills and their hidden states (with a realistic-ish prior) ----------
const SKILLS = {
  PAIR: { name: "Monic trinomials (x² + bx + c)", states: { M: 0.35, SIGNS_SWAPPED: 0.2, PRODUCT_SUM_SWAPPED: 0.1, PRODUCT_ONLY: 0.15, UNK: 0.2 } },
  VERIFY: { name: "Checking a factorisation by expanding", states: { M: 0.4, FIRST_LAST_ONLY: 0.35, UNK: 0.25 } },
  NEGATIVE: { name: "Taking out a negative factor", states: { M: 0.35, FLIPPED_ONE_SIGN: 0.25, KEPT_ORIGINAL_SIGNS: 0.15, UNK: 0.25 } },
  MEANING: { name: "What 'fully factorised' means", states: { M: 0.4, SUM_ACCEPTED: 0.25, COMBINED_UNLIKE: 0.1, UNK: 0.25 } },
};

// ---------- the algebra the bugs run on ----------
const br = (n) => (n < 0 ? `(x−${-n})` : `(x+${n})`);
const pairText = (a, b) => [a, b].sort((u, v) => u - v).map(br).join("");
function factorPairs(c) {
  const out = [];
  for (let r = 1; r <= Math.abs(c); r++) if (c % r === 0) { out.push([r, c / r], [-r, -c / r]); }
  return out;
}
/** What each PAIR state writes for x² + bx + c (a set when the bug allows several). */
function pairAnswers(state, b, c) {
  const pq = factorPairs(c).find(([u, v]) => u + v === b);
  const correct = pq && pairText(pq[0], pq[1]);
  switch (state) {
    case "M": return [correct];
    case "SIGNS_SWAPPED": return [pairText(-pq[0], -pq[1])]; // found the numbers, flipped them into the brackets
    case "PRODUCT_SUM_SWAPPED": { const rs = factorPairs(b).find(([u, v]) => u + v === c); return rs ? [pairText(rs[0], rs[1])] : []; }
    case "PRODUCT_ONLY": return [...new Set(factorPairs(c).map(([u, v]) => pairText(u, v)))]; // any pair with the right product
    default: return [];
  }
}
/** A multiple-choice answer: pick uniformly among options the state believes in, else guess. */
function choose(options, believes) {
  const ok = options.filter(believes);
  return ok.length ? uniform(ok) : uniform(options);
}

// =====================================================================
// ITEMS. Each: { id, skill, era, label, seconds, like(state) -> dist }
// =====================================================================
const ITEMS = [];

// ---- PAIR / old: Firefly (lotus-probes.ts firefly(), instance p=−3, q=5) ----
{
  const p = -3, q = 5, P = p * q, S = p + q;
  const opt = { right: "−3 and 5", sign: "3 and −5", other: "1 and −15", prod: "−2 and 4" };
  const nums = { right: [-3, 5], sign: [3, -5], other: [1, -15], prod: [-2, 4] };
  const options = Object.keys(opt);
  ITEMS.push({
    id: "old-firefly", skill: "PAIR", era: "old", seconds: 20,
    label: "Firefly: which two numbers multiply to −15 and add to 2?",
    like(state) {
      if (state === "UNK") return uniform(options);
      // SIGNS_SWAPPED goes wrong only when writing brackets; finding the numbers it does right.
      if (state === "M" || state === "SIGNS_SWAPPED") return slip(point("right"), options);
      if (state === "PRODUCT_ONLY") return slip(choose(options, (o) => nums[o][0] * nums[o][1] === P), options);
      if (state === "PRODUCT_SUM_SWAPPED") return slip(choose(options, (o) => nums[o][0] * nums[o][1] === S && nums[o][0] + nums[o][1] === P), options);
    },
  });
}

// ---- PAIR / new: Bug-separating doors + confidence ----
// Instance searched so that every PAIR bug writes a *different* bracket answer.
function findDoorsInstance() {
  for (let b = -9; b <= 9; b++) for (let c = -30; c <= 30; c++) {
    if (!b || !c) continue;
    const pq = factorPairs(c).find(([u, v]) => u + v === b);
    const rs = factorPairs(b).find(([u, v]) => u + v === c);
    if (!pq || !rs || pq[0] === pq[1]) continue;
    const right = pairAnswers("M", b, c)[0], sw = pairAnswers("SIGNS_SWAPPED", b, c)[0], ps = pairAnswers("PRODUCT_SUM_SWAPPED", b, c)[0];
    const po = pairAnswers("PRODUCT_ONLY", b, c).filter((t) => t !== right && t !== sw);
    if (new Set([right, sw, ps]).size === 3 && po.length && !po.includes(ps) && c < 0) return { b, c, right, sw, ps, po: po[0] };
  }
}
const DOORS = findDoorsInstance();
{
  const { b, c, right, sw, ps, po } = DOORS;
  const options = [right, sw, ps, po];
  const answerDist = (state) => {
    if (state === "UNK") return uniform(options);
    const believed = pairAnswers(state, b, c);
    return slip(choose(options, (o) => believed.includes(o)), options);
  };
  const exprText = `x² ${b < 0 ? "−" : "+"} ${Math.abs(b) === 1 ? "" : Math.abs(b)}x ${c < 0 ? "−" : "+"} ${Math.abs(c)}`;
  ITEMS.push({ id: "new-doors-noconf", skill: "PAIR", era: "new*", seconds: 25, label: `Doors without the confidence tap: ${exprText} = ?`, like: answerDist });
  ITEMS.push({ id: "new-doors", skill: "PAIR", era: "new", seconds: 30, label: `Doors: ${exprText} = ? (every wrong door is a different mistake) + how sure?`, like: (s) => joint(answerDist(s), confOf(s)), instance: DOORS, exprText });
}

// ---- VERIFY / old: Spot the impostor (impostor(), p=2, q=3: x² + 5x + 6) ----
{
  // Impostor (x−2)(x−3) shares x² and +6 with all three genuine forms.
  const options = ["impostor", "eq1", "eq2", "eq3"];
  ITEMS.push({
    id: "old-impostor", skill: "VERIFY", era: "old", seconds: 25,
    label: "Impostor: three of these are x² + 5x + 6 in disguise. Which isn't?",
    like(state) {
      if (state === "M") return slip(point("impostor"), options);
      // Checking first and last terms only: all four pass, so it's a coin toss — same as not knowing.
      return uniform(options);
    },
  });
}

// ---- VERIFY / new: Riya vs Sam, two-tier + confidence ----
{
  // Riya: x² + x − 6 = (x + 3)(x − 2) ✔   Sam: x² + x − 6 = (x − 3)(x + 2) ✘ (same x² and −6)
  const options = ["onlyRiya", "onlySam", "both", "neither"];
  const reasons = ["expandedAll", "firstLast", "signsLook", "guessed"];
  const answer = (s) => s === "M" ? slip(point("onlyRiya"), options) : s === "FIRST_LAST_ONLY" ? slip(point("both"), options) : uniform(options);
  const reason = (s) => s === "M" ? { expandedAll: 0.8, signsLook: 0.15, firstLast: 0.03, guessed: 0.02 }
    : s === "FIRST_LAST_ONLY" ? { firstLast: 0.7, signsLook: 0.2, expandedAll: 0.05, guessed: 0.05 }
    : { guessed: 0.5, signsLook: 0.3, firstLast: 0.1, expandedAll: 0.1 };
  ITEMS.push({ id: "new-riyasam-noconf", skill: "VERIFY", era: "new*", seconds: 30, label: "Riya vs Sam, answer + reason only", like: (s) => joint(answer(s), reason(s)) });
  ITEMS.push({ id: "new-riyasam", skill: "VERIFY", era: "new", seconds: 35, label: "Riya vs Sam: who is right? → how did you decide? → how sure?", like: (s) => joint(joint(answer(s), reason(s)), confOf(s)) });
}

// ---- NEGATIVE / old: Detective (detective(), g=3, a=2, b=3: −6x − 9) ----
{
  // Line 1 (−3)(2x) + (−3)(3)   Line 2 −3(2x − 3) ✘   Line 3 −6x + 9
  const options = ["L1", "L2", "L3", "nothing"];
  ITEMS.push({
    id: "old-detective", skill: "NEGATIVE", era: "old", seconds: 25,
    label: "Detective: which line is the first to go wrong?",
    like(state) {
      if (state === "M") return slip(point("L2"), options);
      // Line 2 is exactly what FLIPPED_ONE_SIGN writes; line 3 then follows from it.
      if (state === "FLIPPED_ONE_SIGN") return slip({ nothing: 0.6, L3: 0.4 }, options);
      // KEPT_ORIGINAL_SIGNS would write −3(−2x − 3): line 2 differs, so it says "Line 2" — right answer, wrong reason.
      if (state === "KEPT_ORIGINAL_SIGNS") return slip(point("L2"), options);
      return uniform(options);
    },
  });
}

// ---- NEGATIVE / new: Find it, then fix it + confidence ----
{
  const lines = ["L1", "L2", "L3", "nothing"];
  const fixes = ["fixRight", "fixKept", "fixOther"]; // −3(2x + 3), −3(−2x − 3), −3(−2x + 3)
  const answer = (s) => {
    let d;
    if (s === "M") d = slip(point("L2"), lines);
    else if (s === "FLIPPED_ONE_SIGN") d = slip({ nothing: 0.6, L3: 0.4 }, lines);
    else if (s === "KEPT_ORIGINAL_SIGNS") d = slip(point("L2"), lines);
    else d = uniform(lines);
    const fix = s === "M" ? slip(point("fixRight"), fixes) : s === "KEPT_ORIGINAL_SIGNS" ? slip(point("fixKept"), fixes) : uniform(fixes);
    // Only a student who flags line 2 is asked for its fix.
    const out = {};
    for (const [l, p] of Object.entries(d)) {
      if (l !== "L2") out[`${l}|-`] = (out[`${l}|-`] ?? 0) + p;
      else for (const [f, q] of Object.entries(fix)) out[`L2|${f}`] = (out[`L2|${f}`] ?? 0) + p * q;
    }
    return out;
  };
  ITEMS.push({ id: "new-findfix-noconf", skill: "NEGATIVE", era: "new*", seconds: 30, label: "Find & fix, no confidence tap", like: answer });
  ITEMS.push({ id: "new-findfix", skill: "NEGATIVE", era: "new", seconds: 35, label: "Find the wrong line → choose its fix → how sure?", like: (s) => joint(answer(s), confOf(s)) });
}

// ---- MEANING / old: one-tier choice (catalogue slot 6) ----
{
  // "Is 2y(x + 1) + 3(x + 1) fully factorised?"  Yes / No: (x+1)(2y+3) / No: 5y(x+1) / No: (x+1)²(2y+3)
  const options = ["yes", "noRight", "noCombined", "noSquared"];
  const answer = (s) => s === "M" ? slip(point("noRight"), options) : s === "SUM_ACCEPTED" ? slip(point("yes"), options)
    : s === "COMBINED_UNLIKE" ? slip(point("noCombined"), options) : uniform(options);
  ITEMS.push({ id: "old-meaning", skill: "MEANING", era: "old", seconds: 20, label: "Is 2y(x + 1) + 3(x + 1) fully factorised? (one tier)", like: answer });
  const reasons = ["oneProduct", "allBrackets", "addLike", "guessed"];
  const reason = (s) => s === "M" ? { oneProduct: 0.8, addLike: 0.05, allBrackets: 0.1, guessed: 0.05 }
    : s === "SUM_ACCEPTED" ? { allBrackets: 0.75, oneProduct: 0.1, addLike: 0.05, guessed: 0.1 }
    : s === "COMBINED_UNLIKE" ? { addLike: 0.7, oneProduct: 0.15, allBrackets: 0.05, guessed: 0.1 }
    : { guessed: 0.5, allBrackets: 0.2, oneProduct: 0.15, addLike: 0.15 };
  ITEMS.push({ id: "new-meaning", skill: "MEANING", era: "new", seconds: 35, label: "Same question → why? → how sure?", like: (s) => joint(joint(answer(s), reason(s)), confOf(s)) });
}

// =====================================================================
// MEASUREMENT
// =====================================================================
const log2 = (x) => Math.log(x) / Math.LN2;
function analyse(item) {
  const prior = SKILLS[item.skill].states;
  const states = Object.keys(prior);
  const L = Object.fromEntries(states.map((s) => [s, item.like(s)]));
  const responses = [...new Set(states.flatMap((s) => Object.keys(L[s])))];
  const pr = Object.fromEntries(responses.map((r) => [r, states.reduce((t, s) => t + prior[s] * (L[s][r] ?? 0), 0)]));
  let bits = 0;
  for (const s of states) for (const r of responses) {
    const j = prior[s] * (L[s][r] ?? 0);
    if (j > 0) bits += j * log2(j / (prior[s] * pr[r]));
  }
  // Ideal reader: names a mistake only when its posterior ≥ 0.6 (the "we're sure enough" bar).
  const verdict = (r) => {
    let best = null, bestP = 0;
    for (const s of states) { const post = prior[s] * (L[s][r] ?? 0) / pr[r]; if (post > bestP) { bestP = post; best = s; } }
    return bestP >= 0.6 ? best : "UNSURE";
  };
  const bugs = states.filter((s) => s !== "M" && s !== "UNK");
  const bugMass = bugs.reduce((t, s) => t + prior[s], 0);
  let named = 0, falseNamed = 0, cleanMass = 0;
  for (const s of states) for (const r of responses) {
    const p = L[s][r] ?? 0;
    if (!p) continue;
    const v = verdict(r);
    if (bugs.includes(s) && v === s) named += prior[s] * p;
    if (!bugs.includes(s)) { cleanMass += prior[s] * p; if (bugs.includes(v)) falseNamed += prior[s] * p; }
  }
  // Per-state: what the reader concludes for a student in that state.
  const perState = Object.fromEntries(states.map((s) => {
    const tally = {};
    for (const [r, p] of Object.entries(L[s])) { const v = verdict(r); tally[v] = (tally[v] ?? 0) + p; }
    return [s, tally];
  }));
  return {
    id: item.id, skill: item.skill, era: item.era, label: item.label, seconds: item.seconds,
    bits: +bits.toFixed(3), maxBits: +log2(states.length).toFixed(3),
    bitsPerMin: +(bits * 60 / item.seconds).toFixed(2),
    namedRate: +(named / bugMass).toFixed(3), falseRate: +(falseNamed / cleanMass).toFixed(3),
    perState,
    table: { prior, L },
  };
}

// Whole-battery Monte Carlo: n items per skill, posterior over each skill's state.
function rng(seed) { let h = seed >>> 0; return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
function draw(d, r) { let u = r(), acc = 0; for (const [k, p] of Object.entries(d)) { acc += p; if (u <= acc) return k; } return Object.keys(d).at(-1); }
function battery(era, perSkill, students = 20000, seed = 7) {
  const r = rng(seed);
  const pick = (skill) => ITEMS.find((i) => i.skill === skill && i.era === era) ?? ITEMS.find((i) => i.skill === skill && i.era === "old");
  let bugStudents = 0, named = 0, clean = 0, falseNamed = 0, unkStudents = 0, unkFlagged = 0, seconds = 0;
  for (let n = 0; n < students; n++) for (const [skill, def] of Object.entries(SKILLS)) {
    const truth = draw(def.states, r);
    const item = pick(skill);
    const states = Object.keys(def.states);
    const post = { ...def.states };
    for (let k = 0; k < perSkill; k++) {
      const resp = draw(item.like(truth), r);
      for (const s of states) post[s] *= item.like(s)[resp] ?? 0;
      seconds += item.seconds;
    }
    const z = states.reduce((t, s) => t + post[s], 0);
    let best = "UNSURE", bestP = 0;
    for (const s of states) if (post[s] / z > bestP) { bestP = post[s] / z; best = s; }
    const verdict = bestP >= 0.6 ? best : "UNSURE";
    const isBug = truth !== "M" && truth !== "UNK";
    const vBug = verdict !== "M" && verdict !== "UNK" && verdict !== "UNSURE";
    if (isBug) { bugStudents++; if (verdict === truth) named++; }
    else { clean++; if (vBug) falseNamed++; }
    if (truth === "UNK") { unkStudents++; if (verdict === "UNK") unkFlagged++; }
  }
  return {
    era, perSkill, minutes: +(seconds / students / 60).toFixed(1),
    namedRate: +(named / bugStudents).toFixed(3),
    falseRate: +(falseNamed / clean).toFixed(3),
    unknownSpotted: +(unkFlagged / unkStudents).toFixed(3),
  };
}

const items = ITEMS.map(analyse);
const batteries = [battery("old", 1), battery("old", 2), battery("old", 3), battery("new", 1), battery("new", 2)];

// Sensitivity: what if students with a misconception are NOT more confident than guessers?
CONF = { M: { sure: 0.6, think: 0.3, guess: 0.1 }, BUG: { sure: 0.35, think: 0.35, guess: 0.3 }, UNK: { sure: 0.2, think: 0.35, guess: 0.45 } };
const sensitivity = { items: ITEMS.filter((i) => i.era === "new").map(analyse), batteries: [battery("new", 1), battery("new", 2)] };

console.log(JSON.stringify({ slip: SLIP, doors: DOORS, skills: SKILLS, items, batteries, sensitivity }, null, 2));
