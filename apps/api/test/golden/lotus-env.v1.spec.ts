import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadEnvFiles, parseEnv } from "../../scripts/lotus-env";

describe("script env loading follows the API's rule", () => {
  it("reads quoted values, single-quoted JSON, comments, export and blank lines", () => {
    const env = parseEnv([
      "# a comment", "", 'KEY_A="value-a"', "KEY_B='{\"model\":{\"x\":1}}'", "KEY_C=plain # trailing", "export KEY_D=dee", "not a line", 'KEY_E="has # hash"',
    ].join("\n"));
    assert.deepEqual(env, { KEY_A: "value-a", KEY_B: '{"model":{"x":1}}', KEY_C: "plain", KEY_D: "dee", KEY_E: "has # hash" });
  });

  it("the first file that defines a key wins, and an empty value never overrides a real one", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-"));
    const root = join(dir, "root.env"), db = join(dir, "db.env");
    writeFileSync(root, 'SECRET_KEY="real-value"\nONLY_ROOT=1\n');
    writeFileSync(db, 'SECRET_KEY=\nONLY_DB=2\nEMPTY=\n');
    const env: NodeJS.ProcessEnv = {};
    const names = loadEnvFiles([root, db, join(dir, "missing.env")], env);
    assert.equal(env.SECRET_KEY, "real-value");
    assert.equal(env.ONLY_DB, "2");
    assert.equal(env.EMPTY, undefined);
    assert.deepEqual(names.sort(), ["ONLY_DB", "ONLY_ROOT", "SECRET_KEY"]);
  });

  it("a real value already in the environment is kept; an empty one is filled", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-"));
    const file = join(dir, "a.env");
    writeFileSync(file, "A=from-file\nB=from-file\n");
    const env: NodeJS.ProcessEnv = { A: "already", B: "" };
    loadEnvFiles([file], env);
    assert.deepEqual({ A: env.A, B: env.B }, { A: "already", B: "from-file" });
  });
});
