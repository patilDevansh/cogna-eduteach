/**
 * Demo-student identity helpers.
 *
 * The seeded `dev_student_001` is a *template*, not a live shared account.
 * When DEMO_FRESH_STUDENT_PER_LOGIN is on, each demo login clones it into a
 * `demo_<cuid>` row so runs do not contaminate each other's MicroSkillStateV2.
 * These clones accumulate on purpose — they are the training / comparison
 * dataset — and must never be swept up by a TTL job.
 */

/** Seeded template id (packages/database/prisma/seed.ts). Never returned by fresh demo login. */
export const DEMO_STUDENT_TEMPLATE_ID = "dev_student_001";

/** Canonical display name the student UI keys off — clones keep this exact string. */
export const DEMO_STUDENT_NAME = "Demo Student";

/** Prefix for every minted demo clone. */
export const DEMO_STUDENT_ID_PREFIX = "demo_";

/**
 * True for the seeded template and for any `demo_` clone. Use this instead of
 * an exact `=== "dev_student_001"` check so demo-only affordances (next-step
 * hint, etc.) keep working after fresh-per-login cloning.
 */
export function isDemoStudent(studentId: string): boolean {
  return (
    studentId === DEMO_STUDENT_TEMPLATE_ID ||
    studentId.startsWith(DEMO_STUDENT_ID_PREFIX)
  );
}

/**
 * Env gate for minting a fresh clone on every demo login.
 * Default on when NODE_ENV is not "production"; must be explicitly "false"
 * to disable. Never inferred from hostnames or other ambient signals alone —
 * production must set DEMO_FRESH_STUDENT_PER_LOGIN=false (or leave NODE_ENV=production).
 */
export function isDemoFreshStudentPerLoginEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = env.DEMO_FRESH_STUDENT_PER_LOGIN;
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return env.NODE_ENV !== "production";
}
