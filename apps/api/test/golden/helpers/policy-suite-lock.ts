import { mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@cogna/database";

/**
 * Cross-process mutex for policy golden suites (A02, A03, A04, A08, A09, A10, ...).
 *
 * The node test runner executes each spec file in its own process, in
 * parallel. All policy suites mutate the single global "PROMOTED policy"
 * row set, so they must not run at the same time. This lock serializes
 * only the policy suites against each other, leaving every other golden
 * suite free to run in parallel.
 *
 * Implementation: atomic mkdir spin-lock in the OS temp dir. Stale locks
 * (older than STALE_MS, e.g. from a crashed run) are broken automatically.
 */
const LOCK_DIR = join(tmpdir(), "cogna-policy-golden-suite.lock");
const STALE_MS = 60_000;
const POLL_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquirePolicySuiteLock(): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      mkdirSync(LOCK_DIR);
      return;
    } catch {
      // Lock held by another suite; break it if stale, else wait.
      try {
        if (
          existsSync(LOCK_DIR) &&
          Date.now() - statSync(LOCK_DIR).mtimeMs > STALE_MS
        ) {
          rmSync(LOCK_DIR, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Raced with the holder releasing; retry immediately.
        continue;
      }
      await sleep(POLL_MS);
    }
  }
}

export function releasePolicySuiteLock(): void {
  rmSync(LOCK_DIR, { recursive: true, force: true });
}

/** Roll back every PROMOTED policy so suites start from a clean global state. */
export async function rollbackAllPromotedPolicies(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.policyVersion.updateMany({
    where: { status: "PROMOTED" },
    data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
  });
}
