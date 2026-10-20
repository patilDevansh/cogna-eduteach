import { createHash } from "node:crypto";

/** Sign-in codes are matched case-insensitively and stored only as this hash. */
export function hashAccessCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}
