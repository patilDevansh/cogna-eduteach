import { createHash } from "node:crypto";

/**
 * Sign-in codes are matched case-insensitively and stored only as this hash. Spaces and dashes are dropped:
 * children copy a slip's code as "K7M2 QX9P" or "K7M2-QX9P", and no code contains either.
 */
export function hashAccessCode(code: string): string {
  return createHash("sha256").update(code.replace(/[\s-]/g, "").toLowerCase()).digest("hex");
}
