import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { UserRole } from "@cogna/database";
import type { LotusSessionView } from "@cogna/shared";
import { isProductionLike, issueStudentToken } from "../access/cogna-access";
import { normalizeEmail } from "../classrooms/parent-invite";
import { MailService } from "../mail/mail.service";
import { hashAccessCode } from "../parents/access-code";
import { PrismaService } from "../prisma/prisma.service";
import { LotusService } from "../lotus/lotus.service";
import { allowedWebOrigins } from "../web-origins";
import { createRazorpayOrder, paymentSignatureValid, razorpayAccount, webhookSignatureValid } from "./razorpay";
import { reportUnlockedEmail, resultsReadyEmail, sampleStartedEmail } from "./sample-emails";

/** Every sample student belongs to this placeholder account until a real parent signs up. */
const SAMPLE_PARENT_KEY = "sample_tests";
const PER_EMAIL_PER_DAY = 3;
const PER_ADDRESS_PER_HOUR = 5;
/** A student session for the test itself: long enough to finish, short enough not to linger. */
const TEST_SESSION_MS = 3 * 60 * 60 * 1000;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export type SampleState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

@Injectable()
export class SampleService {
  private readonly logger = new Logger(SampleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lotus: LotusService,
    private readonly mail: MailService,
  ) {}

  /** The full report's price, in rupees (SAMPLE_REPORT_PRICE_INR, default ₹199). */
  price(env: NodeJS.ProcessEnv = process.env): number {
    const rupees = Number(env.SAMPLE_REPORT_PRICE_INR ?? 199);
    return Number.isFinite(rupees) && rupees >= 1 ? Math.round(rupees) : 199;
  }

  /**
   * Starts a sample test: the parent's email and consent come first (a child's data is only stored
   * after a parent agrees). Creates a fresh student and returns a private link token plus a student
   * session for the test. Rate-limited per email, per network address and per day overall, because
   * every test costs AI calls.
   */
  async start(input: { parentEmail?: string; childName?: string; consent?: boolean }, ip: string) {
    const parentEmail = normalizeEmail(input.parentEmail);
    const childName = String(input.childName ?? "").replace(/\s+/g, " ").trim();
    if (!parentEmail) throw new BadRequestException("Type the parent's email address.");
    if (childName.length < 2 || childName.length > 40) throw new BadRequestException("Type your child's first name (2–40 characters).");
    if (input.consent !== true) throw new BadRequestException("A parent or guardian needs to agree before the test starts.");

    const ipHash = sha256(`sample:${ip}`);
    const now = Date.now();
    const [byEmail, byAddress, today] = await Promise.all([
      this.prisma.sampleAttempt.count({ where: { parentEmail, createdAt: { gte: new Date(now - 86_400_000) } } }),
      this.prisma.sampleAttempt.count({ where: { ipHash, createdAt: { gte: new Date(now - 3_600_000) } } }),
      this.prisma.sampleAttempt.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    ]);
    if (byEmail >= PER_EMAIL_PER_DAY) throw new HttpException("This email has started three sample tests today. Use one of the links we emailed, or try again tomorrow.", HttpStatus.TOO_MANY_REQUESTS);
    if (byAddress >= PER_ADDRESS_PER_HOUR) throw new HttpException("Too many sample tests from this network. Try again in an hour.", HttpStatus.TOO_MANY_REQUESTS);
    const dailyLimit = Number(process.env.SAMPLE_DAILY_LIMIT ?? 300);
    if (today >= dailyLimit) throw new ServiceUnavailableException("Today's sample tests are all taken. Please come back tomorrow.");

    const token = randomBytes(24).toString("base64url");
    const parentId = await this.sampleParentId();
    const student = await this.prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        // Nobody signs in with a code: the test runs on the session handed back here.
        data: { primaryParentId: parentId, name: childName, grade: 8, accessCodeHash: hashAccessCode(`sample-${randomBytes(16).toString("hex")}`) },
      });
      await tx.learnerProfile.create({ data: { studentId: created.id } });
      await tx.sampleAttempt.create({ data: { token, studentId: created.id, parentEmail, childName, consentAt: new Date(), ipHash } });
      return created;
    });
    void this.mail.send(sampleStartedEmail({ to: parentEmail, childName, link: this.link(token) }));
    return { token, student: { studentId: student.id, name: student.name, grade: student.grade, sessionToken: issueStudentToken(student.id, process.env, TEST_SESSION_MS) } };
  }

  /**
   * Where a sample stands. Before payment: a free summary (how many answered and right, how many
   * skills are secure or need work), never which skills or why. After payment: the full report, and
   * a student session so the report page and personal lesson open on any device.
   */
  async status(token: string) {
    const attempt = await this.attempt(token);
    const session = await this.latestSession(attempt.studentId);
    const state: SampleState = !session ? "NOT_STARTED" : session.status === "COMPLETE" ? "COMPLETE" : "IN_PROGRESS";
    const base = { childName: attempt.childName, state, price: this.price(), paid: Boolean(attempt.paidAt) };
    if (state !== "COMPLETE" || !session) {
      // The child can carry on where they left off, on this or another device.
      return { ...base, student: { studentId: attempt.studentId, name: attempt.childName, grade: 8, sessionToken: issueStudentToken(attempt.studentId, process.env, TEST_SESSION_MS) } };
    }
    if (!attempt.resultEmailedAt) await this.emailOnce(attempt.id, "resultEmailedAt", resultsReadyEmail({ to: attempt.parentEmail, childName: attempt.childName, link: this.link(token), price: this.price() }));
    const summary = summarise(session);
    if (!attempt.paidAt) return { ...base, summary };
    return {
      ...base,
      summary,
      sessionId: session.sessionId,
      report: session.finalReport,
      student: { studentId: attempt.studentId, name: attempt.childName, grade: 8, sessionToken: issueStudentToken(attempt.studentId) },
    };
  }

  /**
   * A payment order for the full report. With Razorpay keys set, a real order for the checkout.
   * Without them, outside production, a test order the page can complete with testPay();
   * in production, payment is refused rather than pretending.
   */
  async order(token: string) {
    const attempt = await this.attempt(token);
    if (attempt.paidAt) throw new ConflictException("The full report is already unlocked.");
    const session = await this.latestSession(attempt.studentId);
    if (session?.status !== "COMPLETE") throw new BadRequestException("Finish the test first, then unlock the report.");
    if (!summarise(session).readable) throw new BadRequestException("There weren't enough answers to make a report. Take the check again, free.");
    const amountPaise = this.price() * 100;
    const account = razorpayAccount();
    if (!account) {
      if (isProductionLike()) throw new ServiceUnavailableException("Payments aren't set up yet. Please try again later.");
      return { mode: "TEST" as const, amount: amountPaise, currency: "INR" };
    }
    // One order per attempt and price: reopening the checkout reuses it, so a parent can't be charged twice for one report.
    if (attempt.orderId && attempt.amountPaise === amountPaise) {
      return { mode: "RAZORPAY" as const, keyId: account.keyId, orderId: attempt.orderId, amount: amountPaise, currency: "INR", prefill: { email: attempt.parentEmail } };
    }
    const order = await createRazorpayOrder(account, { amountPaise, receipt: attempt.id, notes: { sampleAttemptId: attempt.id, child: attempt.childName } });
    await this.prisma.sampleAttempt.update({ where: { id: attempt.id }, data: { orderId: order.id, amountPaise } });
    return { mode: "RAZORPAY" as const, keyId: account.keyId, orderId: order.id, amount: amountPaise, currency: "INR", prefill: { email: attempt.parentEmail } };
  }

  /** The checkout's success callback, checked against Razorpay's signature before anything unlocks. */
  async verify(token: string, input: { orderId?: string; paymentId?: string; signature?: string }) {
    const attempt = await this.attempt(token);
    const account = razorpayAccount();
    if (!account) throw new ServiceUnavailableException("Payments aren't set up yet.");
    const { orderId = "", paymentId = "", signature = "" } = input;
    if (!attempt.orderId || attempt.orderId !== orderId || !paymentSignatureValid(account.keySecret, orderId, paymentId, signature)) {
      throw new BadRequestException("We couldn't confirm that payment. If money left your account, it will be unlocked automatically within a few minutes.");
    }
    await this.markPaid(attempt.id, paymentId);
    return this.status(token);
  }

  /** Local testing only: completes a test order without Razorpay. */
  async testPay(token: string) {
    if (isProductionLike() || razorpayAccount()) throw new ForbiddenException("Test payments are only available locally.");
    const attempt = await this.attempt(token);
    const session = await this.latestSession(attempt.studentId);
    if (session?.status !== "COMPLETE") throw new BadRequestException("Finish the test first, then unlock the report.");
    await this.markPaid(attempt.id, `test_${Date.now()}`);
    return this.status(token);
  }

  /**
   * Razorpay's webhook: unlocks a report even when the parent closed the tab before the checkout
   * reported back. Only a correctly signed, captured payment for the amount on our order counts.
   */
  async webhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const account = razorpayAccount();
    if (!account?.webhookSecret || !rawBody || !signature || !webhookSignatureValid(account.webhookSecret, rawBody, signature)) {
      throw new BadRequestException("Invalid webhook signature.");
    }
    const event = JSON.parse(rawBody.toString("utf8")) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } } } };
    const payment = event.payload?.payment?.entity;
    if ((event.event === "payment.captured" || event.event === "order.paid") && payment?.order_id && payment.id) {
      const attempt = await this.prisma.sampleAttempt.findUnique({ where: { orderId: payment.order_id } });
      if (attempt && (attempt.amountPaise == null || payment.amount === attempt.amountPaise)) await this.markPaid(attempt.id, payment.id);
    }
    return { ok: true };
  }

  private async markPaid(attemptId: string, paymentId: string) {
    // Only the first confirmation counts (the callback and the webhook usually both arrive).
    const { count } = await this.prisma.sampleAttempt.updateMany({ where: { id: attemptId, paidAt: null }, data: { paidAt: new Date(), paymentId } });
    if (!count) return;
    const attempt = await this.prisma.sampleAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    this.logger.log(`Sample report unlocked: ${attempt.id}`);
    await this.emailOnce(attempt.id, "reportEmailedAt", reportUnlockedEmail({ to: attempt.parentEmail, childName: attempt.childName, link: this.link(attempt.token) }));
  }

  private async emailOnce(attemptId: string, field: "resultEmailedAt" | "reportEmailedAt", message: Parameters<MailService["send"]>[0]) {
    const { count } = await this.prisma.sampleAttempt.updateMany({ where: { id: attemptId, [field]: null }, data: { [field]: new Date() } });
    if (count) void this.mail.send(message);
  }

  private async attempt(token: string) {
    const attempt = token ? await this.prisma.sampleAttempt.findUnique({ where: { token: String(token) } }) : null;
    if (!attempt) throw new NotFoundException("That sample link isn't valid. Start a new sample test.");
    return attempt;
  }

  /** The full (unlocked) view of the child's latest test; LotusService.get is the server's own copy. */
  private async latestSession(studentId: string): Promise<LotusSessionView | null> {
    const record = await this.prisma.lotusSessionRecord.findFirst({ where: { studentId }, orderBy: { startedAt: "desc" }, select: { sessionId: true } });
    return record ? this.lotus.get(record.sessionId) : null;
  }

  private webUrl() {
    return (allowedWebOrigins()[0] ?? "http://localhost:3000").replace(/\/+$/, "");
  }

  private link(token: string) {
    return `${this.webUrl()}/try/result?t=${encodeURIComponent(token)}`;
  }

  private async sampleParentId(): Promise<string> {
    const user = await this.prisma.user.upsert({ where: { clerkId: SAMPLE_PARENT_KEY }, create: { clerkId: SAMPLE_PARENT_KEY, role: UserRole.PARENT }, update: {} });
    const parent = await this.prisma.parent.upsert({ where: { userId: user.id }, create: { userId: user.id, name: "Sample tests" }, update: {} });
    return parent.id;
  }
}

/** The free part of the result: counts only, so it shows the test was real without giving the diagnosis away. */
export function summarise(session: LotusSessionView) {
  const skills = session.finalReport?.skills ?? [];
  const skillsChecked = skills.filter((s) => s.state !== "UNTESTED").length;
  return {
    // Too few real answers (e.g. "I don't know" throughout): nothing worth selling, so no payment is offered.
    readable: skillsChecked > 0 && session.finalReport?.outcome !== "INSUFFICIENT_OR_CONFLICTING",
    answered: session.audits.length,
    correct: session.audits.filter((a) => a.verification?.status === "VERIFIED_CORRECT").length,
    skillsChecked,
    secure: skills.filter((s) => s.state === "SECURE").length,
    needWork: skills.filter((s) => s.state === "CONFIRMED" || s.state === "SUSPECTED").length,
  };
}
