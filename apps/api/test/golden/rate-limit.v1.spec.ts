import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rateLimitMiddleware } from "../../src/rate-limit.middleware";

const call = (method: string, headers: Record<string, string>, ip = "10.0.0.1") => {
  let status = 200;
  let passed = false;
  const req = { path: "/parents/me/students", method, ip, header: (name: string) => headers[name.toLowerCase()] } as never;
  const res = { setHeader: () => undefined, status: (s: number) => { status = s; return { json: () => undefined }; } } as never;
  rateLimitMiddleware(req, res, () => { passed = true; });
  return passed ? 200 : status;
};

describe("rate limiting", () => {
  it("never counts CORS preflights", () => {
    for (let i = 0; i < 2000; i++) assert.equal(call("OPTIONS", {}, "10.9.9.9"), 200);
  });

  it("gives each parent behind one shared IP their own allowance", () => {
    let blocked = 0;
    for (let i = 0; i < 70; i++) if (call("POST", { "x-parent-id": "parent-a" }, "10.1.1.1") === 429) blocked += 1;
    assert.ok(blocked > 0, "one parent hammering a billed route is limited");
    assert.equal(call("POST", { "x-parent-id": "parent-b" }, "10.1.1.1"), 200, "another parent on the same IP is not");
  });
});
