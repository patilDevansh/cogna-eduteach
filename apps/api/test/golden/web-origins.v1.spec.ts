import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowedWebOrigins } from "../../src/web-origins";

describe("allowed web origins (CORS)", () => {
  it("defaults to the local dev servers outside production", () => {
    assert.deepEqual(allowedWebOrigins({ NODE_ENV: "development" }), ["http://localhost:3000", "http://localhost:3002"]);
  });

  it("refuses to start in production without WEB_URL", () => {
    assert.throws(() => allowedWebOrigins({ NODE_ENV: "production", COGNA_ENV: "production" }), /WEB_URL must be set/);
    assert.throws(() => allowedWebOrigins({ NODE_ENV: "production", COGNA_ENV: "production", WEB_URL: " , " }), /WEB_URL must be set/);
  });

  it("accepts several comma-separated origins and drops trailing slashes", () => {
    assert.deepEqual(
      allowedWebOrigins({ NODE_ENV: "production", COGNA_ENV: "production", WEB_URL: "https://cogna.in/, https://www.cogna.in" }),
      ["https://cogna.in", "https://www.cogna.in"],
    );
  });
});
