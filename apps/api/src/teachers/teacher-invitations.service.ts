import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, timingSafeEqual } from "node:crypto";

type TeacherInvitation = {
  email: string;
  code: string;
  teacherName: string;
  schoolId: string;
  schoolName: string;
};

const DEMO_INVITATION: TeacherInvitation = {
  email: "ananya@gurukul.edu",
  code: "GURUKUL-2026",
  teacherName: "Ananya Rao",
  schoolId: "gurukul-pilot",
  schoolName: "Gurukul",
};

@Injectable()
export class TeacherInvitationsService {
  private readonly invitations: TeacherInvitation[];

  constructor(config: ConfigService) {
    const configured = config.get<string>("TEACHER_PILOT_INVITATIONS");
    this.invitations = this.parseInvitations(configured);
  }

  claim(rawEmail: string, rawCode: string) {
    const email = rawEmail.trim().toLowerCase();
    const code = rawCode.trim().toUpperCase();
    const invitation = this.invitations.find(
      (candidate) => candidate.email.toLowerCase() === email && this.codesMatch(candidate.code, code),
    );

    if (!invitation) {
      throw new UnauthorizedException(
        "This email and invitation code do not match an approved teacher. Ask your school administrator for a new invitation.",
      );
    }

    return {
      teacherEmail: invitation.email,
      teacherName: invitation.teacherName,
      schoolId: invitation.schoolId,
      schoolName: invitation.schoolName,
      role: "teacher" as const,
      invitationVerified: true as const,
    };
  }

  private parseInvitations(value?: string): TeacherInvitation[] {
    if (!value) return [DEMO_INVITATION];
    try {
      const parsed = JSON.parse(value) as TeacherInvitation[];
      return Array.isArray(parsed) && parsed.length ? parsed : [DEMO_INVITATION];
    } catch {
      return [DEMO_INVITATION];
    }
  }

  private codesMatch(expected: string, actual: string): boolean {
    const expectedHash = createHash("sha256").update(expected.toUpperCase()).digest();
    const actualHash = createHash("sha256").update(actual).digest();
    return timingSafeEqual(expectedHash, actualHash);
  }
}
