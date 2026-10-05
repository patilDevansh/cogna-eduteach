import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { ClerkAuthService } from "../../src/parents/clerk-auth.service";

const prisma = {
  parent: {
    findUnique: async ({ where }: { where: { id: string } }) => (where.id === "parent-1" ? { id: "parent-1" } : null),
    findFirst: async () => ({ id: "dev-parent" }),
  },
};
const noClerk = { get: () => undefined };
const service = () => new ClerkAuthService(noClerk as never, prisma as never);

function withEnv(env: Record<string, string | undefined>, run: () => Promise<void>) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  return run().finally(() => {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  });
}

describe("parent sign-in", () => {
  it("in production, a bare X-Parent-Id header is not a login", () =>
    withEnv({ NODE_ENV: "production", COGNA_ENV: "production" }, async () => {
      await assert.rejects(() => service().resolveParentId(undefined, "parent-1"), UnauthorizedException);
      await assert.rejects(() => service().resolveParentId(undefined, undefined), UnauthorizedException);
    }));

  it("outside production, the dev header and the seeded dev parent still work", () =>
    withEnv({ NODE_ENV: "development", COGNA_ENV: undefined }, async () => {
      assert.equal(await service().resolveParentId(undefined, "parent-1"), "parent-1");
      assert.equal(await service().resolveParentId(undefined, undefined), "dev-parent");
    }));
});
