/**
 * A sample test's analysis and report stay on the server until the parent pays. Every Lotus response
 * for an unpaid sample student goes out locked (lockedCopy): what was asked and answered, nothing
 * the diagnosis is made of. Enforced here, not in the page, because devtools can read any response.
 */
import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import type { LotusSessionView } from "@cogna/shared";
import { from, mergeMap, type Observable } from "rxjs";
import { PrismaService } from "../prisma/prisma.service";
import { lockedCopy } from "../lotus/lotus.service";

type SampleLookup = { sampleAttempt: { findUnique(args: { where: { studentId: string }; select: { paidAt: true } }): Promise<{ paidAt: Date | null } | null> } };

/** True for a student who came from a sample link and whose parent hasn't paid yet. */
export async function unpaidSample(prisma: SampleLookup, studentId: string): Promise<boolean> {
  const attempt = await prisma.sampleAttempt.findUnique({ where: { studentId }, select: { paidAt: true } });
  return Boolean(attempt && !attempt.paidAt);
}

const isSessionView = (value: unknown): value is LotusSessionView =>
  Boolean(value && typeof value === "object" && "sessionId" in value && "studentId" in value && "audits" in value);

@Injectable()
export class SampleLockInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      mergeMap((value) => from((async () => (isSessionView(value) && (await unpaidSample(this.prisma, value.studentId)) ? lockedCopy(value) : value))())),
    );
  }
}
