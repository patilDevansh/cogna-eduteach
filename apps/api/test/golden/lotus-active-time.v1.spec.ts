import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LOTUS_MAX_COUNTED_SECONDS_PER_QUESTION, lotusActiveSeconds } from "@cogna/shared";

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 15, 10, 0, seconds)).toISOString();
const ms = (seconds: number) => Date.UTC(2026, 9, 15, 10, 0, seconds);

describe("Lotus check clock: active time only", () => {
  it("counts the time between answers while the student is working", () => {
    assert.equal(lotusActiveSeconds(at(0), [at(40), at(100)], ms(130)), 130);
  });

  it("caps each question, so time away from the page doesn't use up the limit", () => {
    const away = 30 * 60;
    assert.equal(lotusActiveSeconds(at(0), [at(60)], ms(60 + away)), 60 + LOTUS_MAX_COUNTED_SECONDS_PER_QUESTION);
  });

  it("charges a long wait before the first answer at most one question's worth", () => {
    assert.equal(lotusActiveSeconds(at(0), [], ms(600)), LOTUS_MAX_COUNTED_SECONDS_PER_QUESTION);
  });
});
