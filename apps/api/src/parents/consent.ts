import type { Prisma } from "@cogna/database";

/** One live answer per parent and child: the new one replaces whichever was standing. */
export async function setConsent(tx: Prisma.TransactionClient, parentId: string, studentId: string, consentType: "PRACTICE_CONSENT" | "PRACTICE_DECLINED") {
  const other = consentType === "PRACTICE_CONSENT" ? "PRACTICE_DECLINED" : "PRACTICE_CONSENT";
  await tx.consent.updateMany({ where: { parentId, studentId, consentType: other, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!(await tx.consent.count({ where: { parentId, studentId, consentType, revokedAt: null } }))) {
    await tx.consent.create({ data: { parentId, studentId, consentType } });
  }
}
