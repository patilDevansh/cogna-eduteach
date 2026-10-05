import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { WorkerGuard } from "../../src/access/worker.guard";

const context = (headers: Record<string, string>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as never;

describe("ops/admin routes require the worker token", () => {
  const previous = process.env.COGNA_JOB_WORKER_TOKEN;
  process.env.COGNA_JOB_WORKER_TOKEN = "test-worker-token";
  const guard = new WorkerGuard();

  it("lets the worker token through", () => {
    assert.equal(guard.canActivate(context({ authorization: "Bearer test-worker-token" })), true);
  });

  it("refuses anonymous and wrong-token callers", () => {
    assert.throws(() => guard.canActivate(context({})), UnauthorizedException);
    assert.throws(() => guard.canActivate(context({ authorization: "Bearer nope" })), UnauthorizedException);
  });

  it("refuses a signed-in student or teacher (not an operator)", () => {
    process.env.COGNA_SESSION_SECRET = process.env.COGNA_SESSION_SECRET ?? "test-session-secret";
    assert.throws(() => guard.canActivate(context({ "x-cogna-student-id": "s1", "x-cogna-student-token": "forged" })), UnauthorizedException);
  });

  it("cleans up", () => {
    if (previous === undefined) delete process.env.COGNA_JOB_WORKER_TOKEN;
    else process.env.COGNA_JOB_WORKER_TOKEN = previous;
  });
});
