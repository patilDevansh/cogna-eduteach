import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ClerkAuthService {
  private readonly logger = new Logger(ClerkAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isEnabled(): boolean {
    return Boolean(this.config.get<string>("CLERK_SECRET_KEY"));
  }

  /**
   * Resolve parent ID from Clerk Bearer token or dev X-Parent-Id header.
   */
  async resolveParentId(
    authHeader?: string,
    headerParentId?: string,
  ): Promise<string> {
    if (headerParentId) {
      const parent = await this.prisma.parent.findUnique({
        where: { id: headerParentId },
      });
      if (parent) return parent.id;
    }

    if (this.isEnabled() && authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length);
      const clerkUserId = await this.verifyClerkToken(token);
      if (clerkUserId) {
        const user = await this.prisma.user.findUnique({
          where: { clerkId: clerkUserId },
          include: { parent: true },
        });
        if (user?.parent) return user.parent.id;

        const parent = await this.provisionParentFromClerk(clerkUserId, token);
        return parent.id;
      }
    }

    const devParent = await this.prisma.parent.findFirst({
      where: { user: { clerkId: "dev_parent_clerk" } },
    });

    if (!devParent) {
      throw new Error("No parent account found. Run db:seed or sign up.");
    }

    return devParent.id;
  }

  private async verifyClerkToken(token: string): Promise<string | null> {
    try {
      const secret = this.config.get<string>("CLERK_SECRET_KEY");
      if (!secret) return null;

      const { verifyToken } = await import("@clerk/backend");
      const payload = await verifyToken(token, { secretKey: secret });
      return payload.sub ?? null;
    } catch (err) {
      this.logger.warn(
        `Clerk token verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async provisionParentFromClerk(clerkUserId: string, token: string) {
    let email = `clerk+${clerkUserId}@users.cogna.local`;
    let name = "Parent";

    try {
      const secret = this.config.get<string>("CLERK_SECRET_KEY");
      if (secret) {
        const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
          headers: { Authorization: `Bearer ${secret}` },
        });
        if (res.ok) {
          const body = (await res.json()) as {
            email_addresses?: Array<{ email_address: string }>;
            first_name?: string;
            last_name?: string;
          };
          email =
            body.email_addresses?.[0]?.email_address ??
            `clerk+${createHash("sha256").update(token).digest("hex").slice(0, 8)}@users.cogna.local`;
          name = [body.first_name, body.last_name].filter(Boolean).join(" ") || "Parent";
        }
      }
    } catch {
      // Use defaults when Clerk user API is unavailable.
    }

    const user = await this.prisma.user.upsert({
      where: { clerkId: clerkUserId },
      create: {
        clerkId: clerkUserId,
        role: "PARENT",
        email,
      },
      update: { email },
    });

    return this.prisma.parent.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        name,
        subscriptionStatus: "trial",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
      update: { name },
    });
  }
}
