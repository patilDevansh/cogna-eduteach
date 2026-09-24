import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { DELETE } from "../src/app/api/lotus/[...segments]/route";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

it("forwards a student-data DELETE request through the same-origin Lotus proxy", async () => {
  let requestedUrl = "";
  let requestedMethod = "";
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedMethod = init?.method ?? "";
    return new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const response = await DELETE(
    new Request("http://localhost:3000/api/lotus/students/demo-learner", { method: "DELETE" }),
    { params: Promise.resolve({ segments: ["students", "demo-learner"] }) },
  );

  assert.equal(response.status, 200);
  assert.equal(requestedMethod, "DELETE");
  assert.match(requestedUrl, /\/lotus\/students\/demo-learner$/);
  assert.deepEqual(await response.json(), { deleted: true });
});
