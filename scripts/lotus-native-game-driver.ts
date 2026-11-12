/**
 * Native controls for Lotus's non-typed games.
 *
 * This is deliberately an evaluator-only adapter: it reads the private
 * question supplied by the token-gated test route, but every response below is
 * made through the student's actual browser controls.  It never posts a game
 * payload directly to the API.
 */
import type { Page, Locator } from "playwright";
import { orderStepCards } from "../apps/api/src/lotus/lotus-games-more";

type Game = { kind: string; [key: string]: any };
type Question = { game?: Game; answerKey?: { canonicalAnswer?: string } };
type Plan = { answer?: string; didNotKnow?: boolean; isDeliberateMistake?: boolean; [key: string]: any };

const clean = (value: string) => value
  .replaceAll("−", "-").replaceAll("²", "^2").replaceAll("³", "^3")
  .replace(/\s+/g, "").replace(/\+1(?=x)/g, "+").replace(/(^|\()1x/g, "$1x").toLowerCase();

const display = (value: number) => value < 0 ? `−${-value}` : String(value);
const fail = (kind: string, why: string): never => { throw new Error(`Native ${kind} adapter cannot represent this persona response: ${why}`); };

function intended(question: Question, plan: Plan): string {
  const value = plan.answer;
  if (!value || plan.didNotKnow) fail(question.game?.kind ?? "game", "no explicit selectable answer was planned");
  return value;
}

function pairFrom(answer: string): [number, number] | null {
  const text = answer.replaceAll("−", "-");
  const squared = /\(\s*x\s*([+-])\s*(\d+)\s*\)\s*(?:\^\s*2|²)/.exec(text);
  if (squared) { const v = (squared[1] === "-" ? -1 : 1) * Number(squared[2]); return [v, v]; }
  // A scruffy typist may leave the last bracket open; the numbers are still what the student meant.
  const matches = [...text.matchAll(/\(\s*x\s*([+-])\s*(\d+)\s*\)?/g)];
  if (matches.length < 2) return null;
  return matches.slice(-2).map((m) => (m[1] === "-" ? -1 : 1) * Number(m[2])) as [number, number];
}

/** The planned pair, or, when a wrong answer has no pair in it, the right pair with one number nudged. */
function pairOrWrong(answer: string, canonical: string, wrong: boolean, plan: Plan, kind: string): [number, number] {
  const planned = pairFrom(answer);
  if (planned) return planned;
  const right = wrong ? pairFrom(canonical) : null;
  if (!right) fail(kind, `cannot make a pair from ${answer}`);
  plan.gameFidelity = "wrong answer had no pair; right pair with one number changed";
  return [right![0] + 1 === 0 ? right![0] + 2 : right![0] + 1, right![1]];
}

function targetSigns(expression: string, a: number, b: number): ["+" | "-", "+" | "-"] | null {
  const source = expression.replaceAll("−", "-").replace(/\s+/g, "");
  const match = /^x(?:\^2|²)([+-])(\d*)x([+-])(\d+)$/.exec(source);
  if (!match) return null;
  const middle = (match[1] === "-" ? -1 : 1) * Number(match[2] || 1);
  const last = (match[3] === "-" ? -1 : 1) * Number(match[4]);
  for (const left of [1, -1] as const) for (const right of [1, -1] as const) {
    if (left * a + right * b === middle && left * right * a * b === last) return [left > 0 ? "+" : "-", right > 0 ? "+" : "-"];
  }
  return null;
}

async function clickTimes(locator: Locator, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) await locator.click();
}

/** Steppers all start at one and skip zero.  Use their real arrow buttons. */
async function setStepper(surface: Locator, ordinal: number, target: number): Promise<void> {
  if (!Number.isInteger(target) || target === 0) fail("stepper", `invalid target ${target}`);
  const up = surface.locator('button[aria-label$=": higher"]').nth(ordinal);
  const down = surface.locator('button[aria-label$=": lower"]').nth(ordinal);
  let current = 1;
  const arrow = target > current ? up : down;
  while (current !== target) {
    await arrow.click();
    current += target > current ? 1 : -1;
    if (current === 0) current += target > 0 ? 1 : -1;
  }
}

async function chooseText(surface: Locator, expected: string, kind: string): Promise<void> {
  const options = surface.getByRole("button");
  const count = await options.count();
  for (let i = 0; i < count; i += 1) {
    const option = options.nth(i);
    if (clean(await option.innerText()) === clean(expected) && await option.isEnabled()) { await option.click(); return; }
  }
  fail(kind, `planned answer ${JSON.stringify(expected)} is not a visible option`);
}

/** Choose the planned wrong option, or another wrong one if the game does not offer it. Never the right one. */
async function chooseWrong(surface: Locator, plan: Plan, canonical: string, kind: string): Promise<void> {
  const options = surface.getByRole("button");
  const count = await options.count();
  let fallback: Locator | null = null;
  for (let i = 0; i < count; i += 1) {
    const option = options.nth(i);
    if (!await option.isEnabled()) continue;
    const text = clean(await option.innerText());
    if (text === clean(plan.answer ?? "")) { await option.click(); return; }
    if (text && text !== clean(canonical) && /[x\d]/.test(text) && !/^(commit|lock|play|undo|reset)/.test(text)) fallback ??= option;
  }
  if (!fallback) fail(kind, "no wrong option is offered");
  plan.gameFidelity = "planned wrong answer not offered; another wrong option chosen";
  await fallback!.click();
}

function validBs(c: number): number[] {
  const values = new Set<number>();
  for (let p = -Math.abs(c); p <= Math.abs(c); p += 1) if (p !== 0 && c % p === 0) values.add(p + c / p);
  return [...values].sort((a, b) => a - b);
}

function selectionNumbers(answer: string): number[] {
  return [...answer.replaceAll("−", "-").matchAll(/(?<![\d])(-?\d+)(?![\d])/g)].map((m) => Number(m[1]));
}

function optionForRapid(row: { q: string; options: string[] }): string | null {
  const q = row.q.replace(/\s+/g, "");
  const squareMinus = /^(\d*)x\^2-(\d+)$/.exec(q);
  if (squareMinus) {
    const coefficient = Number(squareMinus[1] || 1);
    const root = Math.sqrt(Number(squareMinus[2]));
    if (Number.isInteger(root) && Number.isInteger(Math.sqrt(coefficient))) {
      return row.options.find((o) => clean(o).includes(`x-${root}`) && clean(o).includes(`x+${root}`)) ?? null;
    }
  }
  return null;
}

/**
 * Play one native Lotus game through the UI.  `false` means this is not a
 * native-game question; unsupported persona intentions fail loudly rather
 * than being converted to a correct answer.
 */
export async function driver(page: Page, question: Question, plan: Plan): Promise<boolean> {
  const game = question.game;
  if (!game) return false;
  const surface = page.locator(`[data-game="${game.kind}"]`);
  if (!await surface.count()) return false;
  const answer = intended(question, plan);
  const canonical = question.answerKey?.canonicalAnswer ?? "";
  const wrong = clean(answer) !== clean(canonical);

  switch (game.kind) {
    case "TWO_NUMBERS": {
      const pair = pairOrWrong(answer, canonical, wrong, plan, game.kind);
      await setStepper(surface, 0, pair[0]); await setStepper(surface, 1, pair[1]); return true;
    }
    case "COMMIT_THEN_CHOOSE": {
      const pair = pairOrWrong(answer, canonical, wrong, plan, game.kind);
      await setStepper(surface, 0, pair[0]); await setStepper(surface, 1, pair[1]);
      const commit = surface.getByRole("button", { name: /commit|lock/i });
      await commit.click();
      if (wrong) await chooseWrong(surface, plan, canonical, game.kind); else await chooseText(surface, answer, game.kind);
      return true;
    }
    case "TWO_MOVES": {
      const pair = pairOrWrong(answer, canonical, wrong, plan, game.kind);
      await setStepper(surface, 0, pair[0]); await setStepper(surface, 1, pair[1]);
      const toggles = surface.locator('button[aria-label*="bracket sign"]');
      await clickTimes(toggles.nth(0), pair[0] < 0 ? 2 : 1); await clickTimes(toggles.nth(1), pair[1] < 0 ? 2 : 1); return true;
    }
    case "FOUR_SIGNS": {
      // Four signs records a whole rule, not just a final answer.  A planned
      // wrong final answer cannot identify which rule the persona intended.
      // A wrong final answer can't say which rule the student holds, so the first case's first sign is flipped.
      if (wrong) plan.gameFidelity = "wrong answer modelled as one flipped sign";
      const cards = surface.locator('[class*="fourCase"], [class*="quadCard"]');
      for (let i = 0; i < game.cases.length; i += 1) {
        const signs = targetSigns(game.cases[i], game.numbers[0], game.numbers[1]);
        if (!signs) fail(game.kind, `cannot parse case ${game.cases[i]}`);
        if (wrong && i === 0) signs[0] = signs[0] === "+" ? "-" : "+";
        let card = cards.filter({ hasText: game.cases[i].replaceAll("^2", "²") }).first();
        for (let k = 0; k < await cards.count(); k += 1) {
          if (clean(await cards.nth(k).innerText()).startsWith(clean(game.cases[i]))) { card = cards.nth(k); break; }
        }
        const buttons = (await card.count()) ? card.locator('button[aria-label*="sign before"]') : surface.locator('button[aria-label*="sign before"]').nth(i * 2).locator("..");
        if (await buttons.count() >= 2) {
          await clickTimes(buttons.nth(0), signs[0] === "-" ? 2 : 1); await clickTimes(buttons.nth(1), signs[1] === "-" ? 2 : 1);
        } else fail(game.kind, `could not find sign controls for ${game.cases[i]}`);
      }
      return true;
    }
    case "ORDER_STEPS": {
      const cards = orderStepCards(question as any);
      if (cards && clean(answer) === clean(question.answerKey?.canonicalAnswer ?? "")) {
        for (const role of ["L1", "L2", "L3"]) await surface.locator(`[data-poolcard="${cards.roles.indexOf(role)}"]`).click();
        return true;
      }
      if (wrong && cards) {
        // A wrong final answer doesn't define an order, so a wrong step card replaces the middle step.
        plan.gameFidelity = "wrong answer modelled as a wrong middle step";
        for (const role of ["L1", "D1", "L3"]) await surface.locator(`[data-poolcard="${cards.roles.indexOf(role)}"]`).click();
        return true;
      }
      if (wrong) fail(game.kind, "planned final answer does not define an ordered three-step misconception");
      const final = game.steps.findIndex((step: string) => clean(step) === clean(answer));
      if (final < 0) fail(game.kind, "canonical answer is not one of the offered steps");
      // The cards are generated as L1/L2/L3/D1/D2/D3. L3 is the canonical
      // factorisation; the two algebraic working cards are recognisable by
      // their repeated grouped bracket / grouped first line respectively.
      const candidates = game.steps.map((step: string, i: number) => ({ step: clean(step), i })).filter(({ i }: { i: number }) => i !== final);
      const l1 = candidates.find(({ step }: { step: string }) => /^\(.+\)[+-]\(.+\)$/.test(step));
      const l2 = candidates.find(({ step }: { step: string }) => /\)\(?[+-]\d*\(/.test(step));
      if (l1 === undefined || l2 === undefined || l1.i === l2.i) fail(game.kind, "could not identify the checked L1/L2 working cards");
      for (const index of [l1.i, l2.i, final]) await surface.locator(`[data-poolcard="${index}"]`).click();
      return true;
    }
    case "TEST_CLAIM": {
      await surface.locator('input[type="range"]').fill(String(game.min));
      if (wrong) await chooseWrong(surface, plan, canonical, game.kind); else await chooseText(surface, answer, game.kind);
      return true;
    }
    case "RAPID_SET": {
      for (let i = 0; i < game.rows.length; i += 1) {
        const isLast = i === game.rows.length - 1;
        const expected = isLast ? answer : optionForRapid(game.rows[i]);
        if (!expected) fail(game.kind, `cannot derive the planned option for row ${i + 1}`);
        if (isLast && wrong) await chooseWrong(surface, plan, canonical, game.kind); else await chooseText(surface, expected, game.kind);
      }
      return true;
    }
    case "FIND_EVERY_B": {
      const chosen = selectionNumbers(answer);
      if (!chosen.length) fail(game.kind, "planned selection contains no b values");
      for (const value of chosen) await surface.getByRole("button", { name: display(value), exact: true }).click();
      return true;
    }
    case "REPLAY": {
      const line = Number(/line\s+(\d+)/i.exec(answer)?.[1]);
      if (!Number.isInteger(line) || line < 1 || line > game.lines.length) fail(game.kind, `cannot choose replay stop from ${answer}`);
      await surface.getByRole("button", { name: /play/i }).click();
      const stop = surface.getByRole("button", { name: new RegExp(`line ${line}[, ]`, "i") });
      await stop.waitFor({ state: "visible", timeout: Math.max(5_000, game.stepMs * (line + 2)) });
      await stop.click(); return true;
    }
    case "CHUNK_IT": {
      const route = game.routes.find((item: { lines: string[] }) => clean(item.lines.at(-1) ?? "") === clean(answer))
        ?? (wrong ? game.routes.find((item: { lines: string[] }) => clean(item.lines.at(-1) ?? "") !== clean(canonical)) : undefined);
      if (!route) fail(game.kind, `no route ends in planned answer ${answer}`);
      const name = route.move === "CHUNK" ? /chunk/i : route.move === "EXPAND" ? /expand/i : /root/i;
      await surface.getByRole("button", { name }).click(); return true;
    }
    default: return false;
  }
}

export const driveLotusNativeGame = driver;
export const lotusNativeGameDriver = driver;
