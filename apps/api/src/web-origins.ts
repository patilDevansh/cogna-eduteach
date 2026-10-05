import { isProductionLike } from "./access/cogna-access";

/**
 * Browser origins allowed to call the API (CORS). WEB_URL may list several, comma-separated,
 * e.g. "https://cogna.in,https://www.cogna.in". Locally it defaults to the dev servers; in
 * production a missing WEB_URL would silently block the real site, so startup fails instead.
 */
export function allowedWebOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = (env.WEB_URL ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (configured.length) return configured;
  if (isProductionLike(env)) {
    throw new Error("WEB_URL must be set in production (the site's address, e.g. https://cogna.in) or browsers cannot reach the API.");
  }
  return ["http://localhost:3000", "http://localhost:3002"];
}
