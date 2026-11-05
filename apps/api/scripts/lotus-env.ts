import { existsSync, readFileSync } from "node:fs";

/**
 * Reads .env files the way the API does (app.module.ts, @nestjs/config): the FIRST file that
 * defines a key wins, and an empty value never overrides a real one. Node's own --env-file can't
 * read the repo's .env (it has a single-quoted JSON line) and lets a later empty
 * OPENAI_API_KEY= in packages/database/.env win, so scripts that call the real AI use this.
 *
 * Values are never printed; the caller only gets the names it set.
 */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.lastIndexOf(quote) > 0) {
      value = value.slice(1, value.lastIndexOf(quote));
      if (quote === '"') value = value.replace(/\\n/g, "\n");
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    out[match[1]!] = value;
  }
  return out;
}

/** Loads the files in order into `env`. Returns the names that were set (never the values). */
export function loadEnvFiles(paths: string[], env: NodeJS.ProcessEnv = process.env): string[] {
  const set: string[] = [];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(path, "utf8")))) {
      if (value === "" || (env[key] !== undefined && env[key] !== "")) continue;
      env[key] = value;
      set.push(key);
    }
  }
  return set;
}
